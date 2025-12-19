"use client"

import { useMemo } from "react"
import {
  calculatePeriodYieldBreakdown,
  PeriodYieldBreakdown,
} from "@/lib/balance-history-utils"
import type { UserBalance } from "@/lib/db/types"
import type { ChartHistoricalPrices } from "@/hooks/use-chart-historical-prices"

export type PeriodType = "1W" | "1M" | "1Y" | "All"

interface BlendPosition {
  id: string  // Format: poolId-assetAddress
  supplyAmount: number  // Current token balance
  price?: { usdPrice?: number } | null
  assetId?: string
}

interface BackstopPosition {
  poolId: string
  lpTokens: number
}

interface BalanceHistoryDataEntry {
  rawData: unknown[]  // Cast to UserBalance[] when needed
  chartData: Array<{ date: string }>
}

export interface PeriodYieldBreakdownTotals {
  // Per-asset breakdowns
  byAsset: Map<string, PeriodYieldBreakdown & { assetAddress: string; poolId: string }>

  // Aggregate totals
  totalValueAtStart: number  // Sum of all positions at period start
  totalValueNow: number      // Current total balance (should match displayed balance)

  // Breakdown of the change
  totalProtocolYieldUsd: number  // Token growth × current price
  totalPriceChangeUsd: number    // Tokens at start × price difference
  totalEarnedUsd: number         // Protocol Yield + Price Change
  totalEarnedPercent: number     // As percentage of value at start

  // Period info
  periodStartDate: string
  periodDays: number

  // Loading state
  isLoading: boolean
}

/**
 * Format a date to YYYY-MM-DD in local timezone.
 * Avoids UTC conversion issues with toISOString().
 */
function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Get the date string for period start in local timezone.
 * Uses local date to ensure consistency with displayed dates.
 */
function getPeriodStartDate(period: PeriodType): string {
  const today = new Date()
  let periodStart: Date

  switch (period) {
    case "1W":
      periodStart = new Date(today)
      periodStart.setDate(periodStart.getDate() - 7)
      break
    case "1M":
      periodStart = new Date(today)
      periodStart.setDate(periodStart.getDate() - 30)
      break
    case "1Y":
      periodStart = new Date(today)
      periodStart.setFullYear(periodStart.getFullYear() - 1)
      break
    case "All":
    default:
      // For "All", use a very old date (will fall back to first available data)
      periodStart = new Date("2020-01-01")
      break
  }

  // Use local date formatting to avoid UTC conversion issues
  return formatLocalDate(periodStart)
}

/**
 * Get period days for display
 */
function getPeriodDays(period: PeriodType): number {
  switch (period) {
    case "1W": return 7
    case "1M": return 30
    case "1Y": return 365
    case "All": return 0 // Will be calculated from actual data
  }
}

/**
 * Find token balance at a specific date from history
 * Returns the closest balance on or before the target date
 */
function findBalanceAtDate(
  rawData: unknown[],
  targetDate: string,
  poolId?: string
): { supplyTokens: number; collateralTokens: number; date: string } | null {
  // Cast to UserBalance[] - the data comes from the API with this shape
  const typedData = rawData as UserBalance[]

  // Sort by date descending (newest first)
  const sorted = [...typedData].sort((a, b) =>
    b.snapshot_date.localeCompare(a.snapshot_date)
  )

  // Filter by pool if specified
  const filtered = poolId
    ? sorted.filter(r => r.pool_id === poolId)
    : sorted

  // Find the first record on or before the target date
  for (const record of filtered) {
    if (record.snapshot_date <= targetDate) {
      return {
        supplyTokens: record.supply_balance + record.collateral_balance,
        collateralTokens: record.collateral_balance,
        date: record.snapshot_date,
      }
    }
  }

  // If no record found before target date, user didn't have position at period start
  if (filtered.length > 0) {
    return {
      supplyTokens: 0,
      collateralTokens: 0,
      date: targetDate,
    }
  }

  return null
}

/**
 * Hook to calculate period-specific yield breakdown.
 *
 * Calculates:
 * - Protocol Yield: (tokensNow - tokensAtStart) × currentPrice
 * - Price Change: tokensAtStart × (currentPrice - priceAtStart)
 * - Total Earned: Protocol Yield + Price Change
 *
 * Note: Protocol Yield can be negative if user withdrew during the period.
 * This is expected behavior - the breakdown shows net token changes.
 */
export function usePeriodYieldBreakdown(
  selectedPeriod: PeriodType,
  balanceHistoryDataMap: Map<string, BalanceHistoryDataEntry>,
  historicalPrices: ChartHistoricalPrices,
  blendPositions: BlendPosition[] | null | undefined,
  backstopPositions: BackstopPosition[] | null | undefined,
  lpTokenPrice: number | null | undefined,
): PeriodYieldBreakdownTotals {

  return useMemo(() => {
    const byAsset = new Map<string, PeriodYieldBreakdown & { assetAddress: string; poolId: string }>()

    const periodStartDate = getPeriodStartDate(selectedPeriod)
    const periodDays = getPeriodDays(selectedPeriod)

    // Check if we have the data we need
    const isLoading = historicalPrices.isLoading || !blendPositions

    if (isLoading || !blendPositions) {
      return {
        byAsset,
        totalValueAtStart: 0,
        totalValueNow: 0,
        totalProtocolYieldUsd: 0,
        totalPriceChangeUsd: 0,
        totalEarnedUsd: 0,
        totalEarnedPercent: 0,
        periodStartDate,
        periodDays,
        isLoading: true,
      }
    }

    // Aggregate totals
    let totalValueAtStart = 0
    let totalValueNow = 0
    let totalProtocolYieldUsd = 0
    let totalPriceChangeUsd = 0

    // Process each blend position
    for (const position of blendPositions) {
      if (position.supplyAmount <= 0) continue

      const assetId = position.assetId
      const currentPrice = position.price?.usdPrice || 0

      // Skip positions without price
      if (currentPrice <= 0) continue

      // Current value
      const tokensNow = position.supplyAmount
      const valueNow = tokensNow * currentPrice
      totalValueNow += valueNow

      // If no assetId, we can't get history - assume position is new (value at start = 0)
      if (!assetId) {
        // No history available - treat as new position
        totalProtocolYieldUsd += valueNow // All current value is "yield" (new position)
        continue
      }

      // Get historical balance data for this asset
      const historyEntry = balanceHistoryDataMap.get(assetId)

      // Parse composite key to get poolId
      const [poolId] = position.id.split('-')

      let tokensAtStart = 0
      let priceAtStart = currentPrice

      if (historyEntry?.rawData && historyEntry.rawData.length > 0) {
        // Find balance at period start
        const balanceAtStart = findBalanceAtDate(
          historyEntry.rawData,
          periodStartDate,
          poolId
        )

        if (balanceAtStart) {
          tokensAtStart = balanceAtStart.supplyTokens
          priceAtStart = historicalPrices.getPrice(assetId, balanceAtStart.date)
        }
      }

      const valueAtStart = tokensAtStart * priceAtStart
      totalValueAtStart += valueAtStart

      // Calculate breakdown for this position
      // Protocol Yield = token growth × current price
      const protocolYieldUsd = (tokensNow - tokensAtStart) * currentPrice
      // Price Change = tokens at start × price difference
      const priceChangeUsd = tokensAtStart * (currentPrice - priceAtStart)

      totalProtocolYieldUsd += protocolYieldUsd
      totalPriceChangeUsd += priceChangeUsd

      // Store per-asset breakdown
      const breakdown = calculatePeriodYieldBreakdown(
        tokensAtStart,
        priceAtStart,
        tokensNow,
        currentPrice
      )

      byAsset.set(position.id, {
        ...breakdown,
        assetAddress: assetId,
        poolId,
      })
    }

    // Add backstop positions if available
    if (backstopPositions && lpTokenPrice && lpTokenPrice > 0) {
      for (const backstop of backstopPositions) {
        if (backstop.lpTokens <= 0) continue

        const backstopValueNow = backstop.lpTokens * lpTokenPrice
        totalValueNow += backstopValueNow

        // For backstop, we don't have historical LP token balance
        // So we add it to current value but can't calculate breakdown
        // This means totalValueAtStart won't include backstop historical value
        // TODO: Add backstop balance history support if needed
      }
    }

    // Total earned = Protocol Yield + Price Change
    const totalEarnedUsd = totalProtocolYieldUsd + totalPriceChangeUsd
    const totalEarnedPercent = totalValueAtStart > 0
      ? (totalEarnedUsd / totalValueAtStart) * 100
      : 0

    console.log('[PeriodYield] Totals:', {
      period: selectedPeriod,
      periodStartDate,
      totalValueAtStart,
      totalValueNow,
      totalProtocolYieldUsd,
      totalPriceChangeUsd,
      totalEarnedUsd,
      totalEarnedPercent: totalEarnedPercent.toFixed(2) + '%',
      assetsProcessed: byAsset.size,
    })

    return {
      byAsset,
      totalValueAtStart,
      totalValueNow,
      totalProtocolYieldUsd,
      totalPriceChangeUsd,
      totalEarnedUsd,
      totalEarnedPercent,
      periodStartDate,
      periodDays,
      isLoading: false,
    }
  }, [selectedPeriod, balanceHistoryDataMap, historicalPrices, blendPositions, backstopPositions, lpTokenPrice])
}
