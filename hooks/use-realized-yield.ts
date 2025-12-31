"use client"

import { useQuery } from "@tanstack/react-query"
import { fetchWithTimeout } from "@/lib/fetch-utils"
import type { RealizedYieldResponse } from "@/app/api/performance/route"

export interface UseRealizedYieldOptions {
  publicKey: string | undefined
  sdkBlndPrice?: number
  sdkLpPrice?: number
  sdkPrices?: Record<string, number>
  enabled?: boolean
}

export interface UseRealizedYieldResult {
  data: RealizedYieldResponse | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

/**
 * Hook to fetch realized yield data for a user.
 *
 * Realized yield = Total withdrawn (at historical prices) - Total deposited (at historical prices)
 *
 * This tracks actual profits that have left the protocol, not paper gains.
 */
export function useRealizedYield({
  publicKey,
  sdkBlndPrice = 0,
  sdkLpPrice = 0,
  sdkPrices = {},
  enabled = true,
}: UseRealizedYieldOptions): UseRealizedYieldResult {
  const query = useQuery({
    // Include SDK prices in query key so we refetch when prices become available
    queryKey: ["performance", publicKey, sdkBlndPrice, sdkLpPrice],
    queryFn: async ({ signal }) => {
      if (!publicKey) {
        throw new Error("No public key provided")
      }

      const params = new URLSearchParams({
        userAddress: publicKey,
      })

      if (sdkBlndPrice > 0) {
        params.set("sdkBlndPrice", sdkBlndPrice.toString())
      }

      if (sdkLpPrice > 0) {
        params.set("sdkLpPrice", sdkLpPrice.toString())
      }

      if (Object.keys(sdkPrices).length > 0) {
        params.set("sdkPrices", JSON.stringify(sdkPrices))
      }

      const response = await fetchWithTimeout(
        `/api/performance?${params.toString()}`,
        { signal }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || "Failed to fetch realized yield data")
      }

      return response.json() as Promise<RealizedYieldResponse>
    },
    enabled: enabled && !!publicKey,
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: false,
    retry: 2,
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  }
}
