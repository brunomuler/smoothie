"use client"

import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import {
  calculateHistoricalYieldBreakdown,
  HistoricalYieldBreakdown,
} from "@/lib/balance-history-utils"
import type { CostBasisHistoricalResponse } from "@/app/api/cost-basis-historical/route"

interface BlendPosition {
  id: string  // Format: poolId-assetAddress
  supplyAmount: number
  price?: { usdPrice?: number } | null
  assetId?: string
  rawBalance?: number  // Raw token balance
}

interface BackstopPosition {
  poolId: string
  lpTokens: number
  lpTokensUsd: number
  costBasisLp?: number
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

async function fetchHistoricalCostBasis(
  userAddress: string,
  sdkPrices: Record<string, number>
): Promise<CostBasisHistoricalResponse> {
  const params = new URLSearchParams({
    userAddress,
    sdkPrices: JSON.stringify(sdkPrices),
  })

  const response = await fetch(`/api/cost-basis-historical?${params}`)
  if (!response.ok) {
    throw new Error('Failed to fetch historical cost basis')
  }

  return response.json()
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
  userAddress: string,
  sdkLpPrice: number
): Promise<{
  deposits: BackstopEventWithPrice[]
  withdrawals: BackstopEventWithPrice[]
}> {
  const response = await fetch(`/api/backstop-events-with-prices?userAddress=${userAddress}&sdkLpPrice=${sdkLpPrice}`)
  if (!response.ok) {
    return { deposits: [], withdrawals: [] }
  }
  return response.json()
}

export function useHistoricalYieldBreakdown(
  userAddress: string | null | undefined,
  blendPositions: BlendPosition[] | null | undefined,
  backstopPositions: BackstopPosition[] | null | undefined,
  lpTokenPrice: number | null | undefined,
): TotalYieldBreakdown {
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
  const currentBalances = useMemo(() => {
    const balances = new Map<string, { tokens: number; usdPrice: number }>()
    if (!blendPositions) return balances

    blendPositions.forEach(pos => {
      if (pos.supplyAmount > 0 && pos.assetId) {
        const usdPrice = pos.price?.usdPrice || 0
        // supplyAmount is already in tokens (from SDK), NOT USD
        // Use it directly as token balance
        balances.set(pos.id, { tokens: pos.supplyAmount, usdPrice })
      }
    })

    return balances
  }, [blendPositions])

  // Fetch historical cost basis data
  const costBasisQuery = useQuery({
    queryKey: ['historical-cost-basis', userAddress, Object.keys(sdkPrices).sort().join(',')],
    queryFn: () => fetchHistoricalCostBasis(userAddress!, sdkPrices),
    enabled: !!userAddress && Object.keys(sdkPrices).length > 0,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  })

  // Fetch backstop events with historical LP prices
  const hasBackstopPositions = Boolean(backstopPositions && backstopPositions.length > 0)
  const backstopEventsQuery = useQuery({
    queryKey: ['backstop-events-with-prices', userAddress, lpTokenPrice],
    queryFn: () => fetchBackstopHistoricalCostBasis(userAddress!, lpTokenPrice || 0),
    enabled: Boolean(userAddress) && Boolean(lpTokenPrice) && (lpTokenPrice ?? 0) > 0 && hasBackstopPositions,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  })

  // Calculate full yield breakdowns using SDK current balances + historical cost basis
  const yieldBreakdowns = useMemo((): TotalYieldBreakdown => {
    const byAsset = new Map<string, AssetYieldBreakdown>()

    let totalCostBasisHistorical = 0
    let totalProtocolYieldUsd = 0
    let totalPriceChangeUsd = 0
    let totalEarnedUsd = 0
    let totalCurrentValueUsd = 0

    if (costBasisQuery.data?.byAsset) {
      for (const [compositeKey, historicalData] of Object.entries(costBasisQuery.data.byAsset)) {
        const currentBalance = currentBalances.get(compositeKey)

        if (!currentBalance) {
          // No current position, skip
          continue
        }

        const { tokens: currentTokens, usdPrice: currentPrice } = currentBalance

        // Calculate full breakdown using historical cost basis + current balance/price
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

      // Process each pool's backstop position separately
      for (const bp of backstopPositions) {
        if (!bp.lpTokens || bp.lpTokens <= 0) continue

        const poolId = bp.poolId

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
            bp.lpTokens,
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
          const costBasisLp = bp.costBasisLp || 0
          const netDepositedLpTokens = costBasisLp > 0 ? costBasisLp : bp.lpTokens

          // Since we don't have historical LP prices, we estimate the deposit price
          // by using the current price. This means protocol yield will be calculated
          // based on the difference between current LP tokens and net deposited.
          // Price change will be 0 since we don't know the historical price.
          // The protocol yield = (current LP - net deposited) × current price
          const yieldLpTokens = bp.lpTokens - netDepositedLpTokens
          const protocolYieldUsd = yieldLpTokens * lpTokenPrice
          const currentValueUsd = bp.lpTokens * lpTokenPrice

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

    return {
      totalCostBasisHistorical,
      totalProtocolYieldUsd,
      totalPriceChangeUsd,
      totalEarnedUsd,
      totalCurrentValueUsd,
      byAsset,
      byBackstop,
      isLoading: costBasisQuery.isLoading || backstopEventsQuery.isLoading,
      error: costBasisQuery.error as Error | null,
    }
  }, [costBasisQuery.data, costBasisQuery.isLoading, costBasisQuery.error, backstopEventsQuery.data, backstopEventsQuery.isLoading, currentBalances, backstopPositions, lpTokenPrice])

  return yieldBreakdowns
}
