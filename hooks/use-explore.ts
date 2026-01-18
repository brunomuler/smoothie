"use client"

import { useQuery } from "@tanstack/react-query"
import { fetchWithTimeout } from "@/lib/fetch-utils"
import type { ApyPeriod, ExploreData, ExploreFilters, Pool24hChange, PoolExploreItem, PoolTokenItem, SupplyExploreItem } from "@/types/explore"

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
 * Aggregate supply items by pool to get pool-level TVL and borrow totals
 */
function computePoolItems(
  supplyItems: SupplyExploreItem[],
  pool24hChanges: Pool24hChange[]
): PoolExploreItem[] {
  const poolMap = new Map<string, PoolExploreItem>()

  // Create a map of 24h changes by poolId for quick lookup
  const changesMap = new Map<string, Pool24hChange>()
  for (const change of pool24hChanges) {
    changesMap.set(change.poolId, change)
  }

  for (const item of supplyItems) {
    const token: PoolTokenItem = {
      assetAddress: item.assetAddress,
      tokenSymbol: item.tokenSymbol,
      iconUrl: item.iconUrl,
      totalSupplied: item.totalSupplied ?? 0,
      totalBorrowed: item.totalBorrowed ?? 0,
    }

    const existing = poolMap.get(item.poolId)
    if (existing) {
      existing.totalTvl += item.totalSupplied ?? 0
      existing.totalBorrowed += item.totalBorrowed ?? 0
      existing.tokens.push(token)
    } else {
      const changes = changesMap.get(item.poolId)
      poolMap.set(item.poolId, {
        poolId: item.poolId,
        poolName: item.poolName,
        iconUrl: item.iconUrl,
        totalTvl: item.totalSupplied ?? 0,
        totalBorrowed: item.totalBorrowed ?? 0,
        tokens: [token],
        supplyChange24h: changes?.supplyChange ?? 0,
        borrowChange24h: changes?.borrowChange ?? 0,
      })
    }
  }

  // Sort pools by TVL descending with 10k threshold: pools with >=10k ranked before pools with <10k
  const pools = Array.from(poolMap.values())
  for (const pool of pools) {
    pool.tokens.sort((a, b) => b.totalSupplied - a.totalSupplied)
  }
  return pools.sort((a, b) => {
    const aAboveThreshold = a.totalTvl >= 10000
    const bAboveThreshold = b.totalTvl >= 10000

    if (aAboveThreshold && !bAboveThreshold) return -1
    if (!aAboveThreshold && bAboveThreshold) return 1

    return b.totalTvl - a.totalTvl
  })
}

/**
 * Hook to fetch explore page data (supply positions and backstops)
 */
export function useExplore(filters: ExploreFilters) {
  const query = useQuery({
    queryKey: ["explore", filters.period],
    queryFn: ({ signal }) => fetchExploreData(filters.period, signal),
    staleTime: 60_000, // 1 minute - pool TVL data changes slowly
    gcTime: 10 * 60 * 1000, // 10 minutes
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

  // Compute pool items from all supply items (not filtered) with 24h changes
  const poolItems = computePoolItems(
    query.data?.supplyItems ?? [],
    query.data?.pool24hChanges ?? []
  )

  return {
    isLoading: query.isLoading,
    error: query.error as Error | null,
    period: query.data?.period ?? filters.period,
    supplyItems: filteredSupplyItems,
    backstopItems: query.data?.backstopItems ?? [],
    poolItems,
    lpTokenPrice: query.data?.lpTokenPrice ?? null,
    lpPriceHistory: query.data?.lpPriceHistory ?? [],
    refetch: query.refetch,
  }
}
