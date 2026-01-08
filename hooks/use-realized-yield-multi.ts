"use client"

import { useQuery } from "@tanstack/react-query"
import { fetchWithTimeout } from "@/lib/fetch-utils"
import type { RealizedYieldResponse } from "@/app/api/performance/route"

export interface UseRealizedYieldMultiOptions {
  publicKeys: string[] | undefined
  sdkBlndPrice?: number
  sdkLpPrice?: number
  sdkPrices?: Record<string, number>
  enabled?: boolean
}

export interface UseRealizedYieldMultiResult {
  data: RealizedYieldResponse | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

/**
 * Hook to fetch aggregated realized yield data for multiple wallets.
 *
 * Realized yield = Total withdrawn (at historical prices) - Total deposited (at historical prices)
 *
 * This tracks actual profits that have left the protocol across all selected wallets.
 */
export function useRealizedYieldMulti({
  publicKeys,
  sdkBlndPrice = 0,
  sdkLpPrice = 0,
  sdkPrices = {},
  enabled = true,
}: UseRealizedYieldMultiOptions): UseRealizedYieldMultiResult {
  // Create a stable cache key from publicKeys and sdkPrices
  const publicKeysKey = publicKeys?.slice().sort().join(',') ?? ''
  const sdkPricesKey = Object.keys(sdkPrices).sort().map(k => `${k}:${sdkPrices[k]?.toFixed(6)}`).join(',')

  const query = useQuery({
    // Include all keys in query key so we refetch when addresses or prices change
    queryKey: ["performance-multi", publicKeysKey, sdkBlndPrice, sdkLpPrice, sdkPricesKey],
    queryFn: async ({ signal }) => {
      if (!publicKeys?.length) {
        throw new Error("No public keys provided")
      }

      const params = new URLSearchParams({
        userAddresses: publicKeys.join(','),
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
    enabled: enabled && !!publicKeys?.length,
    staleTime: 5 * 60 * 1000, // 5 minutes - historical yield data changes slowly
    gcTime: 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: false,
    retry: 2,
  })

  // Include pending state (query disabled or not yet started)
  const isQueryEnabled = enabled && !!publicKeys?.length

  return {
    data: query.data,
    isLoading: !isQueryEnabled || query.isLoading || (!query.data && query.isPending),
    error: query.error as Error | null,
    refetch: query.refetch,
  }
}
