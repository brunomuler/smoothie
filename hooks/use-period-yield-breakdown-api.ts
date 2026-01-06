"use client"

import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { fetchWithTimeout } from "@/lib/fetch-utils"
import type { PeriodYieldBreakdownResponse, PeriodType } from "@/app/api/period-yield-breakdown/route"

interface BlendPosition {
  id: string  // Format: poolId-assetAddress
  supplyAmount: number
  price?: { usdPrice?: number } | null
  assetId?: string
}

interface BackstopPosition {
  poolId: string
  lpTokens: number
  q4wLpTokens?: number  // LP tokens in queue-for-withdrawal (21-day lock)
}

interface UsePeriodYieldBreakdownAPIParams {
  userAddress: string | undefined
  period: PeriodType
  blendPositions: BlendPosition[] | null | undefined
  backstopPositions?: BackstopPosition[] | null
  lpTokenPrice?: number | null
  enabled?: boolean
}

export interface PeriodYieldBreakdownAPIResult {
  data: PeriodYieldBreakdownResponse | null
  isLoading: boolean
  isFetching: boolean // True whenever fetching, even with cached data
  error: Error | null
  // Convenience accessors
  totals: {
    valueAtStart: number
    valueNow: number
    protocolYieldUsd: number
    priceChangeUsd: number
    totalEarnedUsd: number
    totalEarnedPercent: number
  }
  periodStartDate: string
  periodDays: number
}

async function fetchPeriodYieldBreakdown(
  userAddress: string,
  period: PeriodType,
  sdkPrices: Record<string, number>,
  currentBalances: Record<string, number>,
  backstopPositions: Record<string, number>,
  lpTokenPrice: number,
  timezone: string
): Promise<PeriodYieldBreakdownResponse> {
  const params = new URLSearchParams({
    userAddress,
    period,
    sdkPrices: JSON.stringify(sdkPrices),
    currentBalances: JSON.stringify(currentBalances),
    backstopPositions: JSON.stringify(backstopPositions),
    lpTokenPrice: lpTokenPrice.toString(),
    timezone, // Pass user's timezone for consistent date handling with chart
  })

  const response = await fetchWithTimeout(`/api/period-yield-breakdown?${params}`)
  if (!response.ok) {
    throw new Error('Failed to fetch period yield breakdown')
  }

  return response.json()
}

export function usePeriodYieldBreakdownAPI({
  userAddress,
  period,
  blendPositions,
  backstopPositions,
  lpTokenPrice,
  enabled = true,
}: UsePeriodYieldBreakdownAPIParams): PeriodYieldBreakdownAPIResult {
  // Get user's timezone for consistent date handling with chart
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  // Build SDK prices map and current balances from blend positions
  const { sdkPrices, currentBalances, hasData } = useMemo(() => {
    const prices: Record<string, number> = {}
    const balances: Record<string, number> = {}
    let hasAnyData = false

    if (blendPositions) {
      for (const position of blendPositions) {
        if (!position.assetId || position.supplyAmount <= 0) continue

        const price = position.price?.usdPrice || 0
        if (price <= 0) continue

        prices[position.assetId] = price
        balances[position.id] = position.supplyAmount
        hasAnyData = true
      }
    }

    return {
      sdkPrices: prices,
      currentBalances: balances,
      hasData: hasAnyData,
    }
  }, [blendPositions])

  // Build backstop positions map (poolId -> lpTokens)
  // Include Q4W (queued withdrawal) LP tokens - they're still the user's tokens
  // and still earning yield, just locked for 21 days
  const { backstopPositionsMap, hasBackstopData } = useMemo(() => {
    const positionsMap: Record<string, number> = {}
    let hasData = false

    if (backstopPositions && lpTokenPrice && lpTokenPrice > 0) {
      for (const position of backstopPositions) {
        const totalLpTokens = position.lpTokens + (position.q4wLpTokens || 0)
        if (totalLpTokens > 0) {
          positionsMap[position.poolId] = totalLpTokens
          hasData = true
        }
      }
    }

    return {
      backstopPositionsMap: positionsMap,
      hasBackstopData: hasData,
    }
  }, [backstopPositions, lpTokenPrice])

  // Create stable query key - include backstop positions and timezone
  const queryKey = useMemo(() => {
    const positionsKey = blendPositions
      ? blendPositions
          .filter(p => p.supplyAmount > 0)
          .map(p => `${p.id}:${p.supplyAmount.toFixed(4)}`)
          .sort()
          .join(',')
      : ''
    const backstopKey = backstopPositions
      ? backstopPositions
          .filter(p => p.lpTokens > 0)
          .map(p => `${p.poolId}:${p.lpTokens.toFixed(4)}`)
          .sort()
          .join(',')
      : ''
    return ['period-yield-breakdown', userAddress, period, positionsKey, backstopKey, lpTokenPrice, userTimezone]
  }, [userAddress, period, blendPositions, backstopPositions, lpTokenPrice, userTimezone])

  const query = useQuery({
    queryKey,
    queryFn: () => fetchPeriodYieldBreakdown(
      userAddress!,
      period,
      sdkPrices,
      currentBalances,
      backstopPositionsMap,
      lpTokenPrice || 0,
      userTimezone
    ),
    enabled: enabled && !!userAddress && (hasData || hasBackstopData),
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  })

  // Default totals when no data
  const defaultTotals = {
    valueAtStart: 0,
    valueNow: 0,
    protocolYieldUsd: 0,
    priceChangeUsd: 0,
    totalEarnedUsd: 0,
    totalEarnedPercent: 0,
  }

  // Return API totals directly (includes both supply and backstop positions)
  const combinedTotals = useMemo(() => {
    if (!query.data?.totals) return defaultTotals
    return query.data.totals
  }, [query.data?.totals])

  return {
    data: query.data || null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error as Error | null,
    totals: combinedTotals,
    periodStartDate: query.data?.periodStartDate || '',
    periodDays: query.data?.periodDays || 0,
  }
}
