"use client"

import { useQuery, useQueries } from "@tanstack/react-query"
import { useMemo } from "react"
import {
  calculateHistoricalBorrowBreakdown,
  HistoricalBorrowBreakdown,
} from "@/lib/balance-history-utils"
import { fetchWithTimeout } from "@/lib/fetch-utils"
import type { BorrowCostBasisHistoricalResponse } from "@/app/api/borrow-cost-basis-historical/route"

interface BlendBorrowPosition {
  id: string  // Format: poolId-assetAddress
  borrowAmount: number
  price?: { usdPrice?: number } | null
  assetId?: string
}

export interface AssetBorrowBreakdown extends HistoricalBorrowBreakdown {
  assetAddress: string
  poolId: string
  compositeKey: string
  symbol?: string
}

export interface TotalBorrowBreakdown {
  // Aggregate totals
  totalBorrowCostBasisUsd: number      // Total principal borrowed at borrow-time prices
  totalInterestAccruedUsd: number      // Total interest owed beyond principal
  totalPriceChangeOnDebtUsd: number    // Total price change impact on debt (positive = bad)
  totalCurrentDebtUsd: number          // Total current debt value
  totalCostUsd: number                 // Total cost = interest + price change

  // Per-asset breakdowns
  byAsset: Map<string, AssetBorrowBreakdown>

  // Loading state
  isLoading: boolean
  error: Error | null
}

// Fetch borrow cost basis for a single wallet
async function fetchBorrowCostBasisSingle(
  userAddress: string,
  sdkPrices: Record<string, number>
): Promise<BorrowCostBasisHistoricalResponse> {
  const params = new URLSearchParams({
    userAddresses: userAddress,
    sdkPrices: JSON.stringify(sdkPrices),
  })

  const response = await fetchWithTimeout(`/api/borrow-cost-basis-historical?${params}`)
  if (!response.ok) {
    throw new Error('Failed to fetch borrow cost basis')
  }

  return response.json()
}

/**
 * Per-wallet borrow amounts for accurate interest calculation.
 * Structure: compositeKey -> walletAddress -> { tokens, usdPrice }
 */
export type PerWalletBorrowAmounts = Map<string, Map<string, { tokens: number; usdPrice: number }>>

/**
 * Hook to calculate borrow cost breakdown for all user borrow positions.
 * Supports both single address and array of addresses for multi-wallet aggregation.
 *
 * Key concepts:
 * - Cost basis = net borrowed amount at borrow-time prices (principal)
 * - Interest accrued = current debt - principal (protocol cost)
 * - Price change on debt = how market price movement affects debt value
 *   (price increase = BAD for borrower, debt is more expensive to repay)
 *
 * @param userAddresses User's wallet address(es)
 * @param borrowPositions Array of borrow positions from SDK
 * @param perWalletBorrowAmounts Per-wallet borrow amounts for accurate interest calculation
 * @returns TotalBorrowBreakdown with per-asset and aggregate data
 */
export function useBorrowYieldBreakdown(
  userAddresses: string | string[] | null | undefined,
  borrowPositions: BlendBorrowPosition[] | null | undefined,
  perWalletBorrowAmounts?: PerWalletBorrowAmounts,
): TotalBorrowBreakdown {
  // Normalize addresses to array
  const addressArray = useMemo(() => {
    if (!userAddresses) return []
    return Array.isArray(userAddresses) ? userAddresses : [userAddresses]
  }, [userAddresses])

  const addressesKey = addressArray.slice().sort().join(',')

  // Build SDK prices map from borrow positions
  const sdkPrices = useMemo(() => {
    const prices: Record<string, number> = {}
    if (!borrowPositions) return prices

    borrowPositions.forEach(pos => {
      if (pos.assetId && pos.price?.usdPrice && pos.price.usdPrice > 0) {
        prices[pos.assetId] = pos.price.usdPrice
      }
    })

    return prices
  }, [borrowPositions])

  // Build current debt balances map from borrow positions (token amounts)
  const currentDebts = useMemo(() => {
    const debts = new Map<string, { tokens: number; usdPrice: number }>()
    if (!borrowPositions) return debts

    borrowPositions.forEach(pos => {
      if (pos.borrowAmount > 0 && pos.assetId) {
        const usdPrice = pos.price?.usdPrice || 0
        debts.set(pos.id, { tokens: pos.borrowAmount, usdPrice })
      }
    })

    return debts
  }, [borrowPositions])

  // Track position count to ensure we don't fetch cost basis before positions are loaded
  const positionCount = borrowPositions?.length ?? 0

  // MULTI-WALLET FIX: Fetch cost basis PER WALLET separately
  // This is critical because weighted average prices don't commute with aggregation.
  const isMultiWallet = addressArray.length > 1 && perWalletBorrowAmounts && perWalletBorrowAmounts.size > 0

  // Per-wallet queries (only used for multi-wallet)
  const perWalletCostBasisQueries = useQueries({
    queries: isMultiWallet ? addressArray.map(walletAddress => ({
      queryKey: ['borrow-cost-basis-wallet', walletAddress, Object.keys(sdkPrices).sort().join(',')],
      queryFn: () => fetchBorrowCostBasisSingle(walletAddress, sdkPrices),
      enabled: Object.keys(sdkPrices).length > 0,
      staleTime: 5 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
    })) : [],
  })

  // Single query for single wallet (backward compatible - don't break existing behavior)
  const singleWalletCostBasisQuery = useQuery({
    queryKey: ['borrow-cost-basis', addressesKey, Object.keys(sdkPrices).sort().join(','), positionCount],
    queryFn: () => fetchBorrowCostBasisSingle(addressArray.join(','), sdkPrices),
    // Only enable for single wallet OR when perWalletBorrowAmounts not provided
    enabled: addressArray.length > 0 && Object.keys(sdkPrices).length > 0 && !isMultiWallet,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  })

  // Calculate full borrow breakdowns using SDK current debts + historical cost basis
  const borrowBreakdowns = useMemo((): TotalBorrowBreakdown => {
    const byAsset = new Map<string, AssetBorrowBreakdown>()

    let totalBorrowCostBasisUsd = 0
    let totalInterestAccruedUsd = 0
    let totalPriceChangeOnDebtUsd = 0
    let totalCurrentDebtUsd = 0
    let totalCostUsd = 0

    if (isMultiWallet) {
      // MULTI-WALLET: Calculate interest per wallet, then sum
      // This is the correct approach because weighted averages don't commute with aggregation

      // Build per-wallet cost basis data map
      const perWalletCostBasis = new Map<string, BorrowCostBasisHistoricalResponse>()
      addressArray.forEach((walletAddress, idx) => {
        const queryResult = perWalletCostBasisQueries[idx]
        if (queryResult?.data) {
          perWalletCostBasis.set(walletAddress, queryResult.data)
        }
      })

      // Get all composite keys from perWalletBorrowAmounts
      const allCompositeKeys = new Set<string>()
      perWalletBorrowAmounts!.forEach((_, compositeKey) => {
        allCompositeKeys.add(compositeKey)
      })

      // For each pool-asset, calculate interest per wallet and sum
      for (const compositeKey of allCompositeKeys) {
        const walletAmounts = perWalletBorrowAmounts!.get(compositeKey)
        if (!walletAmounts || walletAmounts.size === 0) continue

        let assetCostBasis = 0
        let assetInterestAccrued = 0
        let assetPriceChange = 0
        let assetCurrentDebt = 0
        let assetTotalCost = 0
        let assetAddress = ''
        let poolId = ''
        let totalNetBorrowed = 0
        let totalWeightedAvgPrice = 0
        let totalInterestTokens = 0

        // Calculate for each wallet that has this borrow position
        for (const [walletAddress, { tokens: walletDebtTokens, usdPrice }] of walletAmounts) {
          if (walletDebtTokens <= 0) continue

          // Get this wallet's cost basis for this asset
          const walletCostBasis = perWalletCostBasis.get(walletAddress)
          const walletAssetData = walletCostBasis?.byAsset[compositeKey]

          if (!walletAssetData) continue

          assetAddress = walletAssetData.assetAddress
          poolId = walletAssetData.poolId

          // Calculate interest for THIS wallet using ITS current debt and ITS cost basis
          const breakdown = calculateHistoricalBorrowBreakdown(
            walletDebtTokens,
            usdPrice,
            [{
              date: '',
              tokens: walletAssetData.netBorrowedTokens,
              priceAtBorrow: walletAssetData.weightedAvgBorrowPrice,
              usdValue: walletAssetData.borrowCostBasisUsd
            }],
            []
          )

          // Sum this wallet's contribution
          assetCostBasis += breakdown.borrowCostBasisUsd
          assetInterestAccrued += breakdown.interestAccruedUsd
          assetPriceChange += breakdown.priceChangeOnDebtUsd
          assetCurrentDebt += breakdown.currentDebtUsd
          assetTotalCost += breakdown.totalCostUsd
          totalNetBorrowed += breakdown.netBorrowedTokens
          totalInterestTokens += breakdown.interestAccruedTokens
          totalWeightedAvgPrice += walletAssetData.weightedAvgBorrowPrice * walletAssetData.borrowCostBasisUsd
        }

        // Calculate weighted average borrow price for the combined asset
        const combinedWeightedAvgPrice = assetCostBasis > 0
          ? totalWeightedAvgPrice / assetCostBasis
          : 0

        if (assetAddress && poolId) {
          const assetBreakdown: AssetBorrowBreakdown = {
            borrowCostBasisUsd: assetCostBasis,
            weightedAvgBorrowPrice: combinedWeightedAvgPrice,
            netBorrowedTokens: totalNetBorrowed,
            interestAccruedTokens: totalInterestTokens,
            interestAccruedUsd: assetInterestAccrued,
            priceChangeOnDebtUsd: assetPriceChange,
            priceChangePercent: assetCostBasis > 0 ? (assetPriceChange / assetCostBasis) * 100 : 0,
            currentDebtTokens: 0, // Will be recalculated if needed
            currentDebtUsd: assetCurrentDebt,
            totalCostUsd: assetTotalCost,
            totalCostPercent: assetCostBasis > 0 ? (assetTotalCost / assetCostBasis) * 100 : 0,
            assetAddress,
            poolId,
            compositeKey,
          }

          byAsset.set(compositeKey, assetBreakdown)

          totalBorrowCostBasisUsd += assetCostBasis
          totalInterestAccruedUsd += assetInterestAccrued
          totalPriceChangeOnDebtUsd += assetPriceChange
          totalCurrentDebtUsd += assetCurrentDebt
          totalCostUsd += assetTotalCost
        }
      }
    } else if (singleWalletCostBasisQuery.data?.byAsset) {
      // SINGLE WALLET: Use existing logic (don't break what works)
      for (const [compositeKey, historicalData] of Object.entries(singleWalletCostBasisQuery.data.byAsset)) {
        const currentDebt = currentDebts.get(compositeKey)

        // Skip if no current debt - nothing to calculate interest for
        if (!currentDebt) {
          continue
        }

        const { tokens: currentDebtTokens, usdPrice: currentPrice } = currentDebt

        const breakdown = calculateHistoricalBorrowBreakdown(
          currentDebtTokens,
          currentPrice,
          [{
            date: '',
            tokens: historicalData.netBorrowedTokens,
            priceAtBorrow: historicalData.weightedAvgBorrowPrice,
            usdValue: historicalData.borrowCostBasisUsd
          }],
          [] // Repays already factored into netBorrowedTokens
        )

        const assetBreakdown: AssetBorrowBreakdown = {
          ...breakdown,
          assetAddress: historicalData.assetAddress,
          poolId: historicalData.poolId,
          compositeKey,
        }

        byAsset.set(compositeKey, assetBreakdown)

        totalBorrowCostBasisUsd += breakdown.borrowCostBasisUsd
        totalInterestAccruedUsd += breakdown.interestAccruedUsd
        totalPriceChangeOnDebtUsd += breakdown.priceChangeOnDebtUsd
        totalCurrentDebtUsd += breakdown.currentDebtUsd
        totalCostUsd += breakdown.totalCostUsd
      }
    }

    // Determine loading state
    let isLoading: boolean
    let error: Error | null = null

    if (isMultiWallet) {
      isLoading = perWalletCostBasisQueries.some(q => q.isLoading || q.isPending)
      error = perWalletCostBasisQueries.find(q => q.error)?.error as Error | null
    } else {
      isLoading = singleWalletCostBasisQuery.isLoading
      error = singleWalletCostBasisQuery.error as Error | null
    }

    return {
      totalBorrowCostBasisUsd,
      totalInterestAccruedUsd,
      totalPriceChangeOnDebtUsd,
      totalCurrentDebtUsd,
      totalCostUsd,
      byAsset,
      isLoading,
      error,
    }
  }, [isMultiWallet, perWalletCostBasisQueries, singleWalletCostBasisQuery.data, singleWalletCostBasisQuery.isLoading, singleWalletCostBasisQuery.error, currentDebts, addressArray, perWalletBorrowAmounts])

  return borrowBreakdowns
}
