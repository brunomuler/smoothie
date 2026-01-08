"use client"

import { useQuery, useQueries } from "@tanstack/react-query"
import { useMemo } from "react"
import {
  calculateHistoricalYieldBreakdown,
  HistoricalYieldBreakdown,
} from "@/lib/balance-history-utils"
import { fetchWithTimeout } from "@/lib/fetch-utils"
import type { CostBasisHistoricalResponse } from "@/app/api/cost-basis-historical/route"

interface BlendPosition {
  id: string
  poolId: string  // Pool contract address
  supplyAmount: number
  price?: { usdPrice?: number } | null
  assetId?: string  // Asset contract address
  rawBalance?: number  // Raw token balance
}

interface BackstopPosition {
  poolId: string
  lpTokens: number
  lpTokensUsd: number
  costBasisLp?: number
  q4wLpTokens?: number  // LP tokens in queue-for-withdrawal (21-day lock)
}

export interface AssetYieldBreakdown extends HistoricalYieldBreakdown {
  assetAddress: string
  poolId: string
  compositeKey: string
  symbol?: string
}

export interface BackstopYieldBreakdown extends HistoricalYieldBreakdown {
  poolAddress: string
}

export interface TotalYieldBreakdown {
  // Aggregate totals
  totalCostBasisHistorical: number
  totalProtocolYieldUsd: number
  totalPriceChangeUsd: number
  totalEarnedUsd: number
  totalCurrentValueUsd: number

  // Per-asset breakdowns
  byAsset: Map<string, AssetYieldBreakdown>

  // Per-pool backstop breakdowns (keyed by poolId)
  byBackstop: Map<string, BackstopYieldBreakdown>

  // Loading state
  isLoading: boolean
  error: Error | null
}

interface BackstopEventWithPrice {
  date: string
  lpTokens: number
  priceAtEvent: number
  usdValue: number
  poolAddress: string
  priceSource: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback'
}

async function fetchBackstopHistoricalCostBasis(
  userAddresses: string[],
  sdkLpPrice: number
): Promise<{
  deposits: BackstopEventWithPrice[]
  withdrawals: BackstopEventWithPrice[]
}> {
  const params = new URLSearchParams({
    userAddresses: userAddresses.join(','),
    sdkLpPrice: sdkLpPrice.toString(),
  })
  const response = await fetchWithTimeout(`/api/backstop-events-with-prices?${params}`)
  if (!response.ok) {
    return { deposits: [], withdrawals: [] }
  }
  return response.json()
}

// Fetch cost basis for a single wallet
async function fetchCostBasisForWallet(
  walletAddress: string,
  sdkPrices: Record<string, number>
): Promise<CostBasisHistoricalResponse> {
  const params = new URLSearchParams({
    userAddresses: walletAddress,
    sdkPrices: JSON.stringify(sdkPrices),
  })
  const response = await fetchWithTimeout(`/api/cost-basis-historical?${params}`)
  if (!response.ok) {
    throw new Error('Failed to fetch cost basis')
  }
  return response.json()
}

/**
 * Per-wallet supply amounts for accurate yield calculation.
 * Structure: compositeKey -> walletAddress -> { tokens, usdPrice }
 */
export type PerWalletSupplyAmounts = Map<string, Map<string, { tokens: number; usdPrice: number }>>

export function useHistoricalYieldBreakdown(
  userAddresses: string | string[] | null | undefined,
  blendPositions: BlendPosition[] | null | undefined,
  backstopPositions: BackstopPosition[] | null | undefined,
  lpTokenPrice: number | null | undefined,
  // Per-wallet supply amounts for multi-wallet yield calculation
  perWalletSupplyAmounts?: PerWalletSupplyAmounts,
): TotalYieldBreakdown {
  // Normalize addresses to array
  const addressArray = useMemo(() => {
    if (!userAddresses) return []
    return Array.isArray(userAddresses) ? userAddresses : [userAddresses]
  }, [userAddresses])

  // CRITICAL FIX: Track how many positions we have
  // This helps detect if data is partially loaded (only some wallets)
  const positionCount = blendPositions?.length ?? 0

  const addressesKey = addressArray.slice().sort().join(',')

  // Build SDK prices map from blend positions
  const sdkPrices = useMemo(() => {
    const prices: Record<string, number> = {}
    if (!blendPositions) return prices

    blendPositions.forEach(pos => {
      if (pos.assetId && pos.price?.usdPrice && pos.price.usdPrice > 0) {
        prices[pos.assetId] = pos.price.usdPrice
      }
    })

    return prices
  }, [blendPositions])

  // Build current balances map from blend positions (token amounts, not USD)
  // For multi-wallet: SUM tokens from all wallets for the same pool-asset
  // Key format MUST match API's compositeKey: "poolId-assetAddress"
  const currentBalances = useMemo(() => {
    const balances = new Map<string, { tokens: number; usdPrice: number }>()
    if (!blendPositions) return balances

    blendPositions.forEach(pos => {
      const poolId = pos.poolId
      if (pos.supplyAmount > 0 && pos.assetId && poolId) {
        const usdPrice = pos.price?.usdPrice || 0
        // Construct key to match API's compositeKey format: "poolId-assetAddress"
        const compositeKey = `${poolId}-${pos.assetId}`
        const existing = balances.get(compositeKey)
        if (existing) {
          // SUM tokens from multiple wallets for the same pool-asset
          balances.set(compositeKey, {
            tokens: existing.tokens + pos.supplyAmount,
            usdPrice, // price should be same across wallets
          })
        } else {
          balances.set(compositeKey, { tokens: pos.supplyAmount, usdPrice })
        }
      }
    })

    return balances
  }, [blendPositions, addressArray.length])

  // MULTI-WALLET FIX: Fetch cost basis PER WALLET separately
  // This is critical because weighted average prices don't commute with aggregation.
  // Combined avg price != sum of per-wallet avg prices weighted by position
  // So we must calculate yield per wallet, then sum.
  const isMultiWallet = addressArray.length > 1 && perWalletSupplyAmounts && perWalletSupplyAmounts.size > 0

  // Per-wallet queries (only used for multi-wallet)
  const perWalletCostBasisQueries = useQueries({
    queries: isMultiWallet ? addressArray.map(walletAddress => ({
      queryKey: ['historical-cost-basis-wallet', walletAddress, Object.keys(sdkPrices).sort().join(',')],
      queryFn: () => fetchCostBasisForWallet(walletAddress, sdkPrices),
      enabled: Object.keys(sdkPrices).length > 0,
      staleTime: 5 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
    })) : [],
  })

  // Single query for single wallet (backward compatible - don't break existing behavior)
  const singleWalletCostBasisQuery = useQuery({
    queryKey: ['historical-cost-basis', addressesKey, Object.keys(sdkPrices).sort().join(','), positionCount],
    queryFn: async () => {
      const params = new URLSearchParams({
        userAddresses: addressArray.join(','),
        sdkPrices: JSON.stringify(sdkPrices),
      })
      const response = await fetchWithTimeout(`/api/cost-basis-historical?${params}`)
      if (!response.ok) {
        throw new Error('Failed to fetch historical cost basis')
      }
      return response.json() as Promise<CostBasisHistoricalResponse>
    },
    // Only enable for single wallet OR when perWalletSupplyAmounts not provided
    enabled: addressArray.length > 0 && Object.keys(sdkPrices).length > 0 && !isMultiWallet,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  })

  // Fetch backstop events with historical LP prices
  const hasBackstopPositions = Boolean(backstopPositions && backstopPositions.length > 0)
  const backstopEventsQuery = useQuery({
    queryKey: ['backstop-events-with-prices', addressesKey, lpTokenPrice],
    queryFn: () => fetchBackstopHistoricalCostBasis(addressArray, lpTokenPrice || 0),
    enabled: addressArray.length > 0 && Boolean(lpTokenPrice) && (lpTokenPrice ?? 0) > 0 && hasBackstopPositions,
    staleTime: 5 * 60 * 1000, // 5 minutes - historical events change slowly
    gcTime: 15 * 60 * 1000, // 15 minutes
  })

  // Check if prerequisites are ready for cost basis query
  const isCostBasisQueryEnabled = addressArray.length > 0 && Object.keys(sdkPrices).length > 0
  const isBackstopQueryEnabled = addressArray.length > 0 && Boolean(lpTokenPrice) && (lpTokenPrice ?? 0) > 0 && hasBackstopPositions

  // Calculate full yield breakdowns using SDK current balances + historical cost basis
  const yieldBreakdowns = useMemo((): TotalYieldBreakdown => {
    const byAsset = new Map<string, AssetYieldBreakdown>()

    let totalCostBasisHistorical = 0
    let totalProtocolYieldUsd = 0
    let totalPriceChangeUsd = 0
    let totalEarnedUsd = 0
    let totalCurrentValueUsd = 0

    if (isMultiWallet) {
      // MULTI-WALLET: Calculate yield per wallet, then sum
      // This is the correct approach because weighted averages don't commute with aggregation

      // Build per-wallet cost basis data map
      const perWalletCostBasis = new Map<string, CostBasisHistoricalResponse>()
      addressArray.forEach((walletAddress, idx) => {
        const queryResult = perWalletCostBasisQueries[idx]
        if (queryResult?.data) {
          perWalletCostBasis.set(walletAddress, queryResult.data)
        }
      })

      // Get all composite keys from perWalletSupplyAmounts
      const allCompositeKeys = new Set<string>()
      perWalletSupplyAmounts!.forEach((_, compositeKey) => {
        allCompositeKeys.add(compositeKey)
      })

      // For each pool-asset, calculate yield per wallet and sum
      for (const compositeKey of allCompositeKeys) {
        const walletAmounts = perWalletSupplyAmounts!.get(compositeKey)
        if (!walletAmounts || walletAmounts.size === 0) continue

        let assetCostBasis = 0
        let assetProtocolYield = 0
        let assetPriceChange = 0
        let assetTotalEarned = 0
        let assetCurrentValue = 0
        let assetAddress = ''
        let poolId = ''
        let totalNetDeposited = 0
        let totalWeightedAvgPrice = 0
        let totalProtocolYieldTokens = 0

        // Calculate for each wallet that has this position
        for (const [walletAddress, { tokens: walletCurrentTokens, usdPrice }] of walletAmounts) {
          if (walletCurrentTokens <= 0) continue

          // Get this wallet's cost basis for this asset
          const walletCostBasis = perWalletCostBasis.get(walletAddress)
          const walletAssetData = walletCostBasis?.byAsset[compositeKey]

          if (!walletAssetData) continue

          assetAddress = walletAssetData.assetAddress
          poolId = walletAssetData.poolId

          // Calculate yield for THIS wallet using ITS current tokens and ITS cost basis
          const breakdown = calculateHistoricalYieldBreakdown(
            walletCurrentTokens,
            usdPrice,
            [{
              date: '',
              tokens: walletAssetData.netDepositedTokens,
              priceAtDeposit: walletAssetData.weightedAvgDepositPrice,
              usdValue: walletAssetData.costBasisHistorical
            }],
            []
          )

          // Sum this wallet's contribution
          assetCostBasis += breakdown.costBasisHistorical
          assetProtocolYield += breakdown.protocolYieldUsd
          assetPriceChange += breakdown.priceChangeUsd
          assetTotalEarned += breakdown.totalEarnedUsd
          assetCurrentValue += breakdown.currentValueUsd
          totalNetDeposited += breakdown.netDepositedTokens
          totalProtocolYieldTokens += breakdown.protocolYieldTokens
          totalWeightedAvgPrice += walletAssetData.weightedAvgDepositPrice * walletAssetData.costBasisHistorical
        }

        // Calculate weighted average deposit price for the combined asset
        const combinedWeightedAvgPrice = assetCostBasis > 0
          ? totalWeightedAvgPrice / assetCostBasis
          : 0

        if (assetAddress && poolId) {
          const assetBreakdown: AssetYieldBreakdown = {
            costBasisHistorical: assetCostBasis,
            weightedAvgDepositPrice: combinedWeightedAvgPrice,
            netDepositedTokens: totalNetDeposited,
            protocolYieldTokens: totalProtocolYieldTokens,
            protocolYieldUsd: assetProtocolYield,
            priceChangeUsd: assetPriceChange,
            priceChangePercent: assetCostBasis > 0 ? (assetPriceChange / assetCostBasis) * 100 : 0,
            currentValueUsd: assetCurrentValue,
            totalEarnedUsd: assetTotalEarned,
            totalEarnedPercent: assetCostBasis > 0 ? (assetTotalEarned / assetCostBasis) * 100 : 0,
            assetAddress,
            poolId,
            compositeKey,
          }

          byAsset.set(compositeKey, assetBreakdown)

          totalCostBasisHistorical += assetCostBasis
          totalProtocolYieldUsd += assetProtocolYield
          totalPriceChangeUsd += assetPriceChange
          totalEarnedUsd += assetTotalEarned
          totalCurrentValueUsd += assetCurrentValue
        }
      }
    } else if (singleWalletCostBasisQuery.data?.byAsset) {
      // SINGLE WALLET: Use existing logic (don't break what works)
      for (const [compositeKey, historicalData] of Object.entries(singleWalletCostBasisQuery.data.byAsset)) {
        const currentBalance = currentBalances.get(compositeKey)

        // Skip if no current position - nothing to calculate yield for
        if (!currentBalance) {
          continue
        }

        const currentTokens = currentBalance.tokens
        const currentPrice = currentBalance.usdPrice

        const breakdown = calculateHistoricalYieldBreakdown(
          currentTokens,
          currentPrice,
          [{ date: '', tokens: historicalData.netDepositedTokens, priceAtDeposit: historicalData.weightedAvgDepositPrice, usdValue: historicalData.costBasisHistorical }],
          [] // Withdrawals already factored into netDepositedTokens
        )

        const assetBreakdown: AssetYieldBreakdown = {
          ...breakdown,
          assetAddress: historicalData.assetAddress,
          poolId: historicalData.poolId,
          compositeKey,
        }

        byAsset.set(compositeKey, assetBreakdown)

        totalCostBasisHistorical += breakdown.costBasisHistorical
        totalProtocolYieldUsd += breakdown.protocolYieldUsd
        totalPriceChangeUsd += breakdown.priceChangeUsd
        totalEarnedUsd += breakdown.totalEarnedUsd
        totalCurrentValueUsd += breakdown.currentValueUsd
      }
    }

    // Calculate per-pool backstop breakdowns using historical LP prices
    const byBackstop = new Map<string, BackstopYieldBreakdown>()
    if (backstopPositions && backstopPositions.length > 0 && lpTokenPrice && lpTokenPrice > 0) {
      const backstopEvents = backstopEventsQuery.data

      // Pre-aggregate backstop positions by poolId (for multi-wallet support)
      // This ensures we sum LP tokens from all wallets for the same pool
      const aggregatedBackstopByPool = new Map<string, { lpTokens: number; q4wLpTokens: number; costBasisLp: number }>()
      for (const bp of backstopPositions) {
        const existing = aggregatedBackstopByPool.get(bp.poolId)
        if (existing) {
          existing.lpTokens += bp.lpTokens
          existing.q4wLpTokens += bp.q4wLpTokens || 0
          existing.costBasisLp += bp.costBasisLp || 0
        } else {
          aggregatedBackstopByPool.set(bp.poolId, {
            lpTokens: bp.lpTokens,
            q4wLpTokens: bp.q4wLpTokens || 0,
            costBasisLp: bp.costBasisLp || 0,
          })
        }
      }

      // Process each aggregated pool's backstop position
      for (const [poolId, aggregatedBp] of aggregatedBackstopByPool) {
        // Include Q4W (queued withdrawal) LP tokens - they're still the user's tokens
        // and still earning yield, just locked for 21 days
        const totalLpTokens = aggregatedBp.lpTokens + aggregatedBp.q4wLpTokens
        if (totalLpTokens <= 0) continue

        // Filter events for this specific pool
        const poolDeposits = backstopEvents?.deposits.filter(d => d.poolAddress === poolId) || []
        const poolWithdrawals = backstopEvents?.withdrawals.filter(w => w.poolAddress === poolId) || []

        let poolBreakdown: BackstopYieldBreakdown

        if (poolDeposits.length > 0 || poolWithdrawals.length > 0) {
          // Calculate from actual historical events with historical prices for this pool
          const deposits = poolDeposits.map(d => ({
            date: d.date,
            tokens: d.lpTokens,
            priceAtDeposit: d.priceAtEvent,
            usdValue: d.usdValue,
          }))
          const withdrawals = poolWithdrawals.map(w => ({
            date: w.date,
            tokens: w.lpTokens,
            priceAtDeposit: w.priceAtEvent,
            usdValue: w.usdValue,
          }))

          const breakdown = calculateHistoricalYieldBreakdown(
            totalLpTokens,
            lpTokenPrice,
            deposits,
            withdrawals
          )

          poolBreakdown = {
            ...breakdown,
            poolAddress: poolId,
          }
        } else {
          // Fallback: use cost basis from position (no historical prices for this pool)
          // costBasisLp represents the net deposited LP tokens (deposits - withdrawals in LP terms)
          const costBasisLp = aggregatedBp.costBasisLp
          const netDepositedLpTokens = costBasisLp > 0 ? costBasisLp : totalLpTokens

          // Since we don't have historical LP prices, we estimate the deposit price
          // by using the current price. This means protocol yield will be calculated
          // based on the difference between current LP tokens and net deposited.
          // Price change will be 0 since we don't know the historical price.
          // The protocol yield = (current LP - net deposited) × current price
          const yieldLpTokens = totalLpTokens - netDepositedLpTokens
          const protocolYieldUsd = yieldLpTokens * lpTokenPrice
          const currentValueUsd = totalLpTokens * lpTokenPrice

          // Since we don't have historical price, assume same as current (no price change)
          // Cost basis = net deposited tokens × current price (best estimate)
          const costBasisHistorical = netDepositedLpTokens * lpTokenPrice

          poolBreakdown = {
            costBasisHistorical,
            weightedAvgDepositPrice: lpTokenPrice,
            netDepositedTokens: netDepositedLpTokens,
            protocolYieldTokens: yieldLpTokens,
            protocolYieldUsd,
            priceChangeUsd: 0, // Unknown without historical prices
            priceChangePercent: 0,
            currentValueUsd,
            totalEarnedUsd: protocolYieldUsd, // Only protocol yield when no historical prices
            totalEarnedPercent: costBasisHistorical > 0 ? (protocolYieldUsd / costBasisHistorical) * 100 : 0,
            poolAddress: poolId,
          }
        }

        byBackstop.set(poolId, poolBreakdown)

        // Add to totals
        totalCostBasisHistorical += poolBreakdown.costBasisHistorical
        totalProtocolYieldUsd += poolBreakdown.protocolYieldUsd
        totalPriceChangeUsd += poolBreakdown.priceChangeUsd
        totalEarnedUsd += poolBreakdown.totalEarnedUsd
        totalCurrentValueUsd += poolBreakdown.currentValueUsd
      }
    }

    // isLoading is true when:
    // 1. Cost basis query is enabled but loading or has no data yet
    // 2. Backstop query is enabled but loading or has no data yet
    let isCostBasisLoading: boolean
    let costBasisError: Error | null = null

    if (isMultiWallet) {
      // Multi-wallet: check all per-wallet queries
      isCostBasisLoading = perWalletCostBasisQueries.some(q => q.isLoading || q.isPending)
      costBasisError = perWalletCostBasisQueries.find(q => q.error)?.error as Error | null
    } else {
      // Single wallet: check single query
      isCostBasisLoading = isCostBasisQueryEnabled && (singleWalletCostBasisQuery.isLoading || (!singleWalletCostBasisQuery.data && singleWalletCostBasisQuery.isPending))
      costBasisError = singleWalletCostBasisQuery.error as Error | null
    }

    const isBackstopLoading = isBackstopQueryEnabled && (backstopEventsQuery.isLoading || (!backstopEventsQuery.data && backstopEventsQuery.isPending))

    return {
      totalCostBasisHistorical,
      totalProtocolYieldUsd,
      totalPriceChangeUsd,
      totalEarnedUsd,
      totalCurrentValueUsd,
      byAsset,
      byBackstop,
      isLoading: isCostBasisLoading || isBackstopLoading,
      error: costBasisError,
    }
  }, [isMultiWallet, perWalletCostBasisQueries, singleWalletCostBasisQuery.data, singleWalletCostBasisQuery.isLoading, singleWalletCostBasisQuery.error, singleWalletCostBasisQuery.isPending, backstopEventsQuery.data, backstopEventsQuery.isLoading, backstopEventsQuery.isPending, currentBalances, backstopPositions, lpTokenPrice, isCostBasisQueryEnabled, isBackstopQueryEnabled, sdkPrices, addressArray, perWalletSupplyAmounts])

  return yieldBreakdowns
}
