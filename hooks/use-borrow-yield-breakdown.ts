"use client"

import { useQuery } from "@tanstack/react-query"
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

async function fetchBorrowCostBasis(
  userAddress: string,
  sdkPrices: Record<string, number>
): Promise<BorrowCostBasisHistoricalResponse> {
  const params = new URLSearchParams({
    userAddress,
    sdkPrices: JSON.stringify(sdkPrices),
  })

  const response = await fetchWithTimeout(`/api/borrow-cost-basis-historical?${params}`)
  if (!response.ok) {
    throw new Error('Failed to fetch borrow cost basis')
  }

  return response.json()
}

/**
 * Hook to calculate borrow cost breakdown for all user borrow positions.
 *
 * Key concepts:
 * - Cost basis = net borrowed amount at borrow-time prices (principal)
 * - Interest accrued = current debt - principal (protocol cost)
 * - Price change on debt = how market price movement affects debt value
 *   (price increase = BAD for borrower, debt is more expensive to repay)
 *
 * @param userAddress User's wallet address
 * @param borrowPositions Array of borrow positions from SDK
 * @returns TotalBorrowBreakdown with per-asset and aggregate data
 */
export function useBorrowYieldBreakdown(
  userAddress: string | null | undefined,
  borrowPositions: BlendBorrowPosition[] | null | undefined,
): TotalBorrowBreakdown {
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

  // Fetch historical borrow cost basis data
  const costBasisQuery = useQuery({
    queryKey: ['borrow-cost-basis', userAddress, Object.keys(sdkPrices).sort().join(',')],
    queryFn: () => fetchBorrowCostBasis(userAddress!, sdkPrices),
    enabled: !!userAddress && Object.keys(sdkPrices).length > 0,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  })

  // Calculate full borrow breakdowns using SDK current debts + historical cost basis
  const borrowBreakdowns = useMemo((): TotalBorrowBreakdown => {
    const byAsset = new Map<string, AssetBorrowBreakdown>()

    let totalBorrowCostBasisUsd = 0
    let totalInterestAccruedUsd = 0
    let totalPriceChangeOnDebtUsd = 0
    let totalCurrentDebtUsd = 0
    let totalCostUsd = 0

    if (costBasisQuery.data?.byAsset) {
      for (const [compositeKey, historicalData] of Object.entries(costBasisQuery.data.byAsset)) {
        const currentDebt = currentDebts.get(compositeKey)

        if (!currentDebt) {
          // No current debt, skip
          continue
        }

        const { tokens: currentDebtTokens, usdPrice: currentPrice } = currentDebt

        // Calculate full breakdown using historical cost basis + current debt/price
        // We reconstruct the borrow event from the historical data
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

    return {
      totalBorrowCostBasisUsd,
      totalInterestAccruedUsd,
      totalPriceChangeOnDebtUsd,
      totalCurrentDebtUsd,
      totalCostUsd,
      byAsset,
      isLoading: costBasisQuery.isLoading,
      error: costBasisQuery.error as Error | null,
    }
  }, [costBasisQuery.data, costBasisQuery.isLoading, costBasisQuery.error, currentDebts])

  return borrowBreakdowns
}
