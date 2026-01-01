"use client"

import { useQuery } from "@tanstack/react-query"
import { fetchWithTimeout } from "@/lib/fetch-utils"
import type { ApyPeriod, ExploreData, ExploreFilters } from "@/types/explore"

async function fetchExploreData(
  period: ApyPeriod,
  signal?: AbortSignal
): Promise<ExploreData> {
  const url = `/api/explore?period=${period}`
  const response = await fetchWithTimeout(url, { signal })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || "Failed to fetch explore data")
  }

  return response.json()
}

/**
 * Hook to fetch explore page data (supply positions and backstops)
 */
export function useExplore(filters: ExploreFilters) {
  const query = useQuery({
    queryKey: ["explore", filters.period],
    queryFn: ({ signal }) => fetchExploreData(filters.period, signal),
    staleTime: 30_000, // 30 seconds
    refetchOnWindowFocus: false,
    retry: 2,
  })

  // Filter supply items by token if needed
  const filteredSupplyItems = query.data?.supplyItems.filter((item) => {
    if (filters.tokenFilter === "usdc") {
      return item.tokenSymbol === "USDC"
    }
    return true
  }) ?? []

  return {
    isLoading: query.isLoading,
    error: query.error as Error | null,
    period: query.data?.period ?? filters.period,
    supplyItems: filteredSupplyItems,
    backstopItems: query.data?.backstopItems ?? [],
    refetch: query.refetch,
  }
}
