"use client"

import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { useBlendPositions } from "./use-blend-positions"
import { useDisplayPreferences } from "@/contexts/display-preferences-context"
import type { PnlChangeChartResponse, PnlChangeDataPoint, PnlPeriodType } from "@/app/api/pnl-change-chart/route"

export type { PnlChangeDataPoint, PnlPeriodType }

interface UsePnlChangeChartOptions {
  publicKey: string | null | undefined
  period: PnlPeriodType
  enabled?: boolean
}

interface UsePnlChangeChartResult {
  data: PnlChangeDataPoint[] | undefined
  isLoading: boolean
  error: Error | null
  granularity: 'daily' | 'monthly' | undefined
}

async function fetchPnlChangeChart(params: {
  userAddress: string
  period: PnlPeriodType
  timezone: string
  sdkPrices: Record<string, number>
  sdkBlndPrice: number
  sdkLpPrice: number
  currentBalances: Record<string, number>
  backstopPositions: Record<string, number>
  useHistoricalBlndPrices: boolean
  blndApy: number
  backstopBlndApy: number
}): Promise<PnlChangeChartResponse> {
  const queryParams = new URLSearchParams({
    userAddress: params.userAddress,
    period: params.period,
    timezone: params.timezone,
    sdkPrices: JSON.stringify(params.sdkPrices),
    sdkBlndPrice: params.sdkBlndPrice.toString(),
    sdkLpPrice: params.sdkLpPrice.toString(),
    currentBalances: JSON.stringify(params.currentBalances),
    backstopPositions: JSON.stringify(params.backstopPositions),
    useHistoricalBlndPrices: params.useHistoricalBlndPrices.toString(),
    blndApy: params.blndApy.toString(),
    backstopBlndApy: params.backstopBlndApy.toString(),
  })

  const response = await fetch(`/api/pnl-change-chart?${queryParams}`)

  if (!response.ok) {
    throw new Error('Failed to fetch P&L change chart data')
  }

  return response.json()
}

export function usePnlChangeChart(
  options: UsePnlChangeChartOptions
): UsePnlChangeChartResult {
  const { publicKey, period, enabled = true } = options

  // Get current SDK data for live updates
  const {
    data: blendSnapshot,
    blndPrice,
    lpTokenPrice,
    backstopPositions: backstopPositionsData,
    isLoading: isLoadingPositions,
  } = useBlendPositions(publicKey ?? undefined)

  // Get display preferences for settings
  const { preferences } = useDisplayPreferences()

  // Get user's timezone
  const timezone = useMemo(() => {
    if (typeof window === 'undefined') return 'UTC'
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  }, [])

  // Build SDK prices map from blend positions
  const sdkPrices = useMemo(() => {
    const prices: Record<string, number> = {}
    if (!blendSnapshot?.positions) return prices

    blendSnapshot.positions.forEach(pos => {
      if (pos.assetId && pos.price?.usdPrice && pos.price.usdPrice > 0) {
        prices[pos.assetId] = pos.price.usdPrice
      }
    })

    return prices
  }, [blendSnapshot?.positions])

  // Build current balances map from blend positions
  const currentBalances = useMemo(() => {
    const balances: Record<string, number> = {}
    if (!blendSnapshot?.positions) return balances

    blendSnapshot.positions.forEach(pos => {
      if (pos.supplyAmount > 0 && pos.assetId) {
        const compositeKey = `${pos.poolId}-${pos.assetId}`
        balances[compositeKey] = pos.supplyAmount
      }
    })

    return balances
  }, [blendSnapshot?.positions])

  // Build backstop positions map
  const backstopPositions = useMemo(() => {
    const positions: Record<string, number> = {}
    if (!backstopPositionsData) return positions

    backstopPositionsData.forEach(bp => {
      if (bp.lpTokens > 0) {
        positions[bp.poolId] = bp.lpTokens
      }
    })

    return positions
  }, [backstopPositionsData])

  // Calculate weighted BLND APY from positions
  const blndApy = useMemo(() => {
    if (!blendSnapshot?.weightedBlndApy) return 0
    return blendSnapshot.weightedBlndApy
  }, [blendSnapshot?.weightedBlndApy])

  // Calculate weighted backstop BLND APY
  const backstopBlndApy = useMemo(() => {
    if (!backstopPositionsData || backstopPositionsData.length === 0) return 0

    let totalValue = 0
    let weightedApy = 0

    backstopPositionsData.forEach(bp => {
      if (bp.lpTokensUsd > 0 && bp.emissionApy > 0) {
        totalValue += bp.lpTokensUsd
        weightedApy += bp.lpTokensUsd * bp.emissionApy
      }
    })

    return totalValue > 0 ? weightedApy / totalValue : 0
  }, [backstopPositionsData])

  // Wait for SDK data to be ready
  const sdkReady = !isLoadingPositions && blendSnapshot !== undefined

  // Fetch chart data from API
  const query = useQuery({
    queryKey: [
      'pnl-change-chart',
      publicKey,
      period,
      timezone,
      preferences.useHistoricalBlndPrices,
      // Include SDK data in key to refetch when positions change
      Object.keys(currentBalances).sort().join(','),
      Object.keys(backstopPositions).sort().join(','),
    ],
    queryFn: () =>
      fetchPnlChangeChart({
        userAddress: publicKey!,
        period,
        timezone,
        sdkPrices,
        sdkBlndPrice: blndPrice ?? 0,
        sdkLpPrice: lpTokenPrice ?? 0,
        currentBalances,
        backstopPositions,
        useHistoricalBlndPrices: preferences.useHistoricalBlndPrices,
        blndApy,
        backstopBlndApy,
      }),
    enabled: enabled && !!publicKey && sdkReady,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  })

  return {
    data: query.data?.data,
    isLoading: isLoadingPositions || query.isLoading,
    error: query.error as Error | null,
    granularity: query.data?.granularity,
  }
}
