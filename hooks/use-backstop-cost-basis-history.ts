"use client"

import { useQuery } from "@tanstack/react-query"
import { fetchWithTimeout } from "@/lib/fetch-utils"
import { useMemo } from "react"

interface BackstopEventWithPrice {
  date: string
  lpTokens: number
  priceAtEvent: number
  usdValue: number
  poolAddress: string
  priceSource: string
}

interface BackstopEventsWithPricesResponse {
  deposits: BackstopEventWithPrice[]
  withdrawals: BackstopEventWithPrice[]
}

export interface UseBackstopCostBasisHistoryReturn {
  /**
   * Map of date -> cumulative cost basis in LP tokens
   * Cost basis is calculated as: sum of deposits - sum of withdrawals (in LP tokens)
   */
  historicalCostBasis: Map<string, number>
  isLoading: boolean
  error: Error | null
}

/**
 * Hook to build historical cost basis for backstop positions.
 *
 * Cost basis tracks the cumulative LP tokens deposited minus withdrawn over time.
 * This allows accurate yield calculation at any historical date.
 */
export function useBackstopCostBasisHistory(
  publicKey: string | undefined,
  sdkLpPrice: number = 0,
  enabled: boolean = true
): UseBackstopCostBasisHistoryReturn {
  const query = useQuery({
    queryKey: ["backstop-events-with-prices", publicKey, sdkLpPrice],
    queryFn: async ({ signal }) => {
      if (!publicKey) {
        throw new Error("No public key provided")
      }

      const params = new URLSearchParams({ userAddress: publicKey })
      if (sdkLpPrice > 0) {
        params.set("sdkLpPrice", sdkLpPrice.toString())
      }

      const response = await fetchWithTimeout(
        `/api/backstop-events-with-prices?${params.toString()}`,
        { signal }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || "Failed to fetch backstop events")
      }

      return response.json() as Promise<BackstopEventsWithPricesResponse>
    },
    enabled: enabled && !!publicKey,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 2,
  })

  // Build cumulative cost basis by date
  const historicalCostBasis = useMemo(() => {
    const costBasisMap = new Map<string, number>()

    if (!query.data) return costBasisMap

    // Combine deposits and withdrawals into a single list with signs
    const events: Array<{ date: string; lpTokens: number; type: "deposit" | "withdrawal" }> = [
      ...query.data.deposits.map(d => ({ date: d.date, lpTokens: d.lpTokens, type: "deposit" as const })),
      ...query.data.withdrawals.map(w => ({ date: w.date, lpTokens: w.lpTokens, type: "withdrawal" as const })),
    ]

    // Sort by date
    events.sort((a, b) => a.date.localeCompare(b.date))

    // Build cumulative cost basis
    let cumulativeCostBasis = 0

    for (const event of events) {
      if (event.type === "deposit") {
        cumulativeCostBasis += event.lpTokens
      } else {
        cumulativeCostBasis -= event.lpTokens
      }
      // Ensure cost basis doesn't go negative
      cumulativeCostBasis = Math.max(0, cumulativeCostBasis)

      // Store the cumulative value at this date
      costBasisMap.set(event.date, cumulativeCostBasis)
    }

    return costBasisMap
  }, [query.data])

  return {
    historicalCostBasis,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  }
}
