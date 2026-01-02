"use client"

import { useQuery } from "@tanstack/react-query"
import { fetchWithTimeout } from "@/lib/fetch-utils"
import type { DailyPnlDataPoint, PerformanceHistoryResponse } from '@/app/api/performance-history/route'

interface UsePerformanceHistoryOptions {
  publicKey: string | undefined | null
  sdkPrices: Record<string, number>
  lpTokenPrice: number
  enabled?: boolean
}

/**
 * Hook to fetch daily P&L history for a user.
 *
 * Returns daily snapshots of:
 * - Portfolio value (calculated from balance history + historical prices)
 * - Cost basis (running total from deposits/withdrawals)
 * - Unrealized P&L (portfolio value - cost basis)
 * - Realized P&L (cumulative emissions claims)
 * - Total P&L (unrealized + realized)
 */
export function usePerformanceHistory({
  publicKey,
  sdkPrices,
  lpTokenPrice,
  enabled = true,
}: UsePerformanceHistoryOptions) {
  const query = useQuery({
    queryKey: ["performance-history", publicKey, lpTokenPrice],
    queryFn: async ({ signal }) => {
      if (!publicKey) {
        throw new Error("No public key provided")
      }

      const params = new URLSearchParams({
        userAddress: publicKey,
        days: '365',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })

      if (Object.keys(sdkPrices).length > 0) {
        params.set('sdkPrices', JSON.stringify(sdkPrices))
      }

      if (lpTokenPrice > 0) {
        params.set('lpTokenPrice', lpTokenPrice.toString())
      }

      const response = await fetchWithTimeout(
        `/api/performance-history?${params.toString()}`,
        { signal }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || "Failed to fetch performance history")
      }

      return response.json() as Promise<PerformanceHistoryResponse>
    },
    enabled: enabled && !!publicKey,
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: false,
    retry: 2,
  })

  return {
    data: query.data,
    history: query.data?.history || [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
  }
}

export type { DailyPnlDataPoint, PerformanceHistoryResponse }
