"use client"

import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { useDisplayPreferences } from "@/contexts/display-preferences-context"
import { fetchWithTimeout } from "@/lib/fetch-utils"
import type { PnlChangeChartResponse, PnlChangeDataPoint, PnlPeriodType } from "@/app/api/pnl-change-chart/route"

export type { PnlChangeDataPoint, PnlPeriodType }

// Blend position type for building SDK data
interface BlendPosition {
  poolId: string
  assetId?: string
  supplyAmount: number
  borrowAmount: number
  price?: { usdPrice?: number } | null
}

// Backstop position type for building SDK data
interface BackstopPosition {
  poolId: string
  lpTokens: number
  shares: bigint
  q4wLpTokens?: number
  q4wShares?: bigint
  emissionApy?: number
  lpTokensUsd?: number
}

interface UsePnlChangeChartMultiOptions {
  publicKeys: string[] | undefined
  period: PnlPeriodType
  enabled?: boolean
  // SDK data for accurate live bar calculation
  blendPositions?: BlendPosition[]
  backstopPositions?: BackstopPosition[]
  blndPrice?: number | null
  lpTokenPrice?: number | null
  weightedBlndApy?: number
}

interface UsePnlChangeChartMultiResult {
  data: PnlChangeDataPoint[] | undefined
  isLoading: boolean
  error: Error | null
  granularity: 'daily' | 'monthly' | undefined
}

// Backstop position with both LP tokens and shares for consistent yield calculation
interface BackstopPositionData {
  lpTokens: number
  shares: number
}

async function fetchPnlChangeChartMulti(params: {
  userAddresses: string[]
  period: PnlPeriodType
  timezone: string
  useHistoricalBlndPrices: boolean
  sdkPrices: Record<string, number>
  sdkBlndPrice: number
  sdkLpPrice: number
  currentBalances: Record<string, number>
  currentBorrowBalances: Record<string, number>
  backstopPositions: Record<string, BackstopPositionData>
  blndApy: number
  backstopBlndApy: number
}): Promise<PnlChangeChartResponse> {
  const queryParams = new URLSearchParams({
    userAddresses: params.userAddresses.join(','),
    period: params.period,
    timezone: params.timezone,
    useHistoricalBlndPrices: params.useHistoricalBlndPrices.toString(),
    sdkPrices: JSON.stringify(params.sdkPrices),
    sdkBlndPrice: params.sdkBlndPrice.toString(),
    sdkLpPrice: params.sdkLpPrice.toString(),
    currentBalances: JSON.stringify(params.currentBalances),
    currentBorrowBalances: JSON.stringify(params.currentBorrowBalances),
    backstopPositions: JSON.stringify(params.backstopPositions),
    blndApy: params.blndApy.toString(),
    backstopBlndApy: params.backstopBlndApy.toString(),
  })

  const response = await fetchWithTimeout(`/api/pnl-change-chart?${queryParams}`)

  if (!response.ok) {
    throw new Error('Failed to fetch P&L change chart data')
  }

  return response.json()
}

/**
 * Hook to fetch aggregated P&L change chart data for multiple wallets.
 *
 * Now includes SDK data for accurate live bar calculation (same as single wallet).
 */
export function usePnlChangeChartMulti(
  options: UsePnlChangeChartMultiOptions
): UsePnlChangeChartMultiResult {
  const {
    publicKeys,
    period,
    enabled = true,
    blendPositions,
    backstopPositions: backstopPositionsData,
    blndPrice,
    lpTokenPrice,
    weightedBlndApy,
  } = options

  // Get display preferences for settings
  const { preferences } = useDisplayPreferences()

  // Get user's timezone
  const timezone = useMemo(() => {
    if (typeof window === 'undefined') return 'UTC'
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  }, [])

  // Build SDK prices map from blend positions
  // For multi-wallet: positions from all wallets are already flattened
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

  // Build current balances map from blend positions (supply)
  // For multi-wallet: SUM balances for the same pool-asset across wallets
  const currentBalances = useMemo(() => {
    const balances: Record<string, number> = {}
    if (!blendPositions) return balances

    blendPositions.forEach(pos => {
      if (pos.supplyAmount > 0 && pos.assetId) {
        const compositeKey = `${pos.poolId}-${pos.assetId}`
        balances[compositeKey] = (balances[compositeKey] || 0) + pos.supplyAmount
      }
    })

    return balances
  }, [blendPositions])

  // Build current borrow balances map from blend positions (debt)
  // For multi-wallet: SUM balances for the same pool-asset across wallets
  const currentBorrowBalances = useMemo(() => {
    const balances: Record<string, number> = {}
    if (!blendPositions) return balances

    blendPositions.forEach(pos => {
      if (pos.borrowAmount > 0 && pos.assetId) {
        const compositeKey = `${pos.poolId}-${pos.assetId}`
        balances[compositeKey] = (balances[compositeKey] || 0) + pos.borrowAmount
      }
    })

    return balances
  }, [blendPositions])

  // Build backstop positions map with BOTH lpTokens AND shares from SDK.
  // For multi-wallet: SUM lpTokens and shares for the same pool across wallets
  const backstopPositions = useMemo(() => {
    const positions: Record<string, BackstopPositionData> = {}
    if (!backstopPositionsData) return positions

    backstopPositionsData.forEach(bp => {
      // Include both regular and Q4W (queued withdrawal) - they're still user's assets
      const totalLpTokens = bp.lpTokens + (bp.q4wLpTokens || 0)
      // Convert bigint shares to number, scaled by 1e7 to match historical data format
      const totalShares = Number(bp.shares + (bp.q4wShares || BigInt(0))) / 1e7

      if (totalLpTokens > 0 && totalShares > 0) {
        const existing = positions[bp.poolId]
        if (existing) {
          // SUM across wallets
          positions[bp.poolId] = {
            lpTokens: existing.lpTokens + totalLpTokens,
            shares: existing.shares + totalShares,
          }
        } else {
          positions[bp.poolId] = {
            lpTokens: totalLpTokens,
            shares: totalShares,
          }
        }
      }
    })

    return positions
  }, [backstopPositionsData])

  // Calculate weighted backstop BLND APY
  const backstopBlndApy = useMemo(() => {
    if (!backstopPositionsData || backstopPositionsData.length === 0) return 0

    let totalValue = 0
    let weightedApy = 0

    backstopPositionsData.forEach(bp => {
      if (bp.lpTokensUsd && bp.lpTokensUsd > 0 && bp.emissionApy && bp.emissionApy > 0) {
        totalValue += bp.lpTokensUsd
        weightedApy += bp.lpTokensUsd * bp.emissionApy
      }
    })

    return totalValue > 0 ? weightedApy / totalValue : 0
  }, [backstopPositionsData])

  // Create stable key for public keys
  const publicKeysKey = publicKeys?.slice().sort().join(',') ?? ''

  // Check if SDK data is ready
  const sdkReady = blendPositions !== undefined

  // Fetch chart data from API
  const query = useQuery({
    queryKey: [
      'pnl-change-chart-multi',
      publicKeysKey,
      period,
      timezone,
      preferences.useHistoricalBlndPrices,
      // Include SDK data in key to refetch when positions change
      Object.keys(currentBalances).sort().join(','),
      Object.keys(currentBorrowBalances).sort().join(','),
      Object.keys(backstopPositions).sort().join(','),
    ],
    queryFn: () =>
      fetchPnlChangeChartMulti({
        userAddresses: publicKeys!,
        period,
        timezone,
        useHistoricalBlndPrices: preferences.useHistoricalBlndPrices,
        sdkPrices,
        sdkBlndPrice: blndPrice ?? 0,
        sdkLpPrice: lpTokenPrice ?? 0,
        currentBalances,
        currentBorrowBalances,
        backstopPositions,
        blndApy: weightedBlndApy ?? 0,
        backstopBlndApy,
      }),
    enabled: enabled && !!publicKeys?.length && sdkReady,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  })

  return {
    data: query.data?.data,
    isLoading: !sdkReady || query.isLoading,
    error: query.error as Error | null,
    granularity: query.data?.granularity,
  }
}
