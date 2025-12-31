"use client"

import { useMemo, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchWithTimeout } from "@/lib/fetch-utils"
import { fillMissingDates, detectPositionChanges, calculateEarningsStats } from "@/lib/balance-history-utils"
import type { AssetCardData } from "@/types/asset-card"

// localStorage cache for instant repeat loads
const HISTORY_CACHE_KEY = "balance-history-cache"
const HISTORY_CACHE_MAX_AGE = 4 * 60 * 60 * 1000 // 4 hours (historical data changes slowly)

interface HistoryCache {
  data: { results: BalanceHistoryResult[] }
  timestamp: number
  publicKey: string
  assets: string
}

function getCachedHistory(publicKey: string, assets: string): { results: BalanceHistoryResult[] } | undefined {
  if (typeof window === "undefined") return undefined
  try {
    const cached = localStorage.getItem(HISTORY_CACHE_KEY)
    if (!cached) return undefined
    const parsed: HistoryCache = JSON.parse(cached)
    // Validate cache: same wallet, same assets, and not expired
    if (parsed.publicKey !== publicKey) return undefined
    if (parsed.assets !== assets) return undefined
    if (Date.now() - parsed.timestamp > HISTORY_CACHE_MAX_AGE) {
      localStorage.removeItem(HISTORY_CACHE_KEY)
      return undefined
    }
    return parsed.data
  } catch {
    return undefined
  }
}

function setCachedHistory(publicKey: string, assets: string, data: { results: BalanceHistoryResult[] }): void {
  if (typeof window === "undefined") return
  try {
    const cache: HistoryCache = { data, timestamp: Date.now(), publicKey, assets }
    localStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // localStorage full or unavailable - ignore
  }
}

interface BalanceHistoryResult {
  asset_address: string
  history: unknown[]
  firstEventDate: string | null
  error: string | null
}

interface BalanceHistoryQueryResult {
  data: { history: unknown[]; firstEventDate: string | null } | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
}

interface BalanceChartDataPoint {
  date: string
  total?: number
  deposit?: number
  yield?: number
  borrow?: number
  pools?: Array<{
    balance: number
    deposit: number
    yield: number
    borrow?: number
  }>
  [key: string]: unknown
}

interface BalanceHistoryDataEntry {
  chartData: BalanceChartDataPoint[]
  positionChanges: unknown[]
  earningsStats: unknown
  rawData: unknown[]
  isLoading: boolean
  error: Error | null
}

interface BackstopHistoryPoint {
  date: string
  lp_tokens: number
}

interface BackstopBalanceHistoryData {
  history: BackstopHistoryPoint[]
}

export interface UseBalanceHistoryDataReturn {
  uniqueAssetAddresses: string[]
  balanceHistoryQueries: BalanceHistoryQueryResult[]
  backstopBalanceHistoryQuery: {
    data: BackstopBalanceHistoryData | undefined
    isLoading: boolean
    isError: boolean
    error: Error | null
  }
  poolAssetCostBasisMap: Map<string, number>
  poolAssetBorrowCostBasisMap: Map<string, number>
  balanceHistoryDataMap: Map<string, BalanceHistoryDataEntry>
}

export function useBalanceHistoryData(
  publicKey: string | undefined,
  assetCards: AssetCardData[],
  blendSnapshot: { positions: Array<{ borrowAmount: number; assetId?: string; poolId: string }> } | null | undefined
): UseBalanceHistoryDataReturn {
  // Get user's timezone for correct date handling in balance history
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  // Get unique asset addresses from both supply and borrow positions
  const uniqueAssetAddresses = useMemo(() => {
    const addresses = new Set<string>()
    // Include assets from supply positions (assetCards)
    assetCards.forEach((asset) => {
      const assetAddress = asset.id.includes('-') ? asset.id.split('-')[1] : asset.id
      addresses.add(assetAddress)
    })
    // Also include assets from borrow positions
    if (blendSnapshot?.positions) {
      blendSnapshot.positions.forEach((position) => {
        if (position.borrowAmount > 0 && position.assetId) {
          addresses.add(position.assetId)
        }
      })
    }
    return Array.from(addresses)
  }, [assetCards, blendSnapshot?.positions])

  // Create stable assets key for caching
  const assetsKey = uniqueAssetAddresses.join(',')

  // Get cached data for instant display on repeat visits
  const cachedData = useMemo(
    () => publicKey && assetsKey ? getCachedHistory(publicKey, assetsKey) : undefined,
    [publicKey, assetsKey]
  )

  // Batch fetch balance history for all assets in a single request
  // This reduces HTTP overhead by consolidating multiple requests into one
  const balanceHistoryBatchQuery = useQuery({
    queryKey: ["balance-history-batch", publicKey || '', assetsKey, 365, userTimezone],
    queryFn: async ({ signal }) => {
      if (uniqueAssetAddresses.length === 0) {
        return { results: [] }
      }

      const params = new URLSearchParams({
        user: publicKey || '',
        assets: assetsKey,
        days: '365',
        timezone: userTimezone,
      })

      const response = await fetchWithTimeout(`/api/balance-history-batch?${params.toString()}`, { signal })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || "Failed to fetch balance history")
      }

      return response.json()
    },
    enabled: !!publicKey && uniqueAssetAddresses.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes (historical data doesn't change frequently)
    refetchOnWindowFocus: false,
    retry: 2,
    placeholderData: cachedData, // Show cached data instantly while fetching
  })

  // Update localStorage cache when fresh data arrives
  useEffect(() => {
    if (publicKey && assetsKey && balanceHistoryBatchQuery.data && !balanceHistoryBatchQuery.isPlaceholderData) {
      setCachedHistory(publicKey, assetsKey, balanceHistoryBatchQuery.data)
    }
  }, [publicKey, assetsKey, balanceHistoryBatchQuery.data, balanceHistoryBatchQuery.isPlaceholderData])

  // Transform batch results into the same format as the old useQueries result
  // This maintains compatibility with existing code that uses balanceHistoryQueries
  const balanceHistoryQueries = useMemo(() => {
    if (!balanceHistoryBatchQuery.data?.results) {
      return uniqueAssetAddresses.map(() => ({
        data: undefined,
        isLoading: balanceHistoryBatchQuery.isLoading,
        isError: balanceHistoryBatchQuery.isError,
        error: balanceHistoryBatchQuery.error,
      }))
    }

    // Create a map for quick lookup
    const resultMap = new Map<string, BalanceHistoryResult>(
      (balanceHistoryBatchQuery.data.results as BalanceHistoryResult[]).map((r) => [r.asset_address, r])
    )

    return uniqueAssetAddresses.map((assetAddress) => {
      const result = resultMap.get(assetAddress)
      if (!result) {
        return {
          data: { history: [], firstEventDate: null },
          isLoading: false,
          isError: false,
          error: null,
        }
      }

      return {
        data: {
          history: result.history,
          firstEventDate: result.firstEventDate,
        },
        isLoading: false,
        isError: !!result.error,
        error: result.error ? new Error(result.error) : null,
      }
    })
  }, [balanceHistoryBatchQuery.data, balanceHistoryBatchQuery.isLoading, balanceHistoryBatchQuery.isError, balanceHistoryBatchQuery.error, uniqueAssetAddresses])

  // Fetch backstop balance history (LP tokens over time)
  const backstopBalanceHistoryQuery = useQuery({
    queryKey: ["backstop-balance-history", publicKey || '', userTimezone],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        user: publicKey || '',
        days: '365',
        timezone: userTimezone,
      })

      const response = await fetchWithTimeout(`/api/backstop-balance-history?${params.toString()}`, { signal })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || "Failed to fetch backstop balance history")
      }

      return response.json()
    },
    enabled: !!publicKey,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 2,
  })

  // Build a mapping from composite key (poolId-assetAddress) to cost basis (from database)
  const poolAssetCostBasisMap = useMemo(() => {
    const map = new Map<string, number>()

    balanceHistoryQueries.forEach((query, index) => {
      if (!query.data?.history || query.data.history.length === 0) return

      const assetAddress = uniqueAssetAddresses[index]

      // Get latest cost_basis for each pool from this asset's history
      const latestByPool = new Map<string, number>()
      query.data.history.forEach((record: any) => {
        if (record.total_cost_basis !== null && record.total_cost_basis !== undefined) {
          // Since records are sorted newest first, first occurrence is the latest
          if (!latestByPool.has(record.pool_id)) {
            latestByPool.set(record.pool_id, record.total_cost_basis)
          }
        }
      })

      // Add to the overall map using composite key: poolId-assetAddress
      latestByPool.forEach((costBasis, poolId) => {
        const compositeKey = `${poolId}-${assetAddress}`
        map.set(compositeKey, costBasis)
      })
    })

    return map
  }, [balanceHistoryQueries, uniqueAssetAddresses])

  // Build a mapping from composite key (poolId-assetAddress) to borrow cost basis (from database)
  const poolAssetBorrowCostBasisMap = useMemo(() => {
    const map = new Map<string, number>()

    balanceHistoryQueries.forEach((query, index) => {
      if (!query.data?.history || query.data.history.length === 0) return

      const assetAddress = uniqueAssetAddresses[index]

      // Get latest borrow_cost_basis for each pool from this asset's history
      const latestByPool = new Map<string, number>()
      query.data.history.forEach((record: any) => {
        if (record.borrow_cost_basis !== null && record.borrow_cost_basis !== undefined) {
          // Since records are sorted newest first, first occurrence is the latest
          if (!latestByPool.has(record.pool_id)) {
            latestByPool.set(record.pool_id, record.borrow_cost_basis)
          }
        }
      })

      // Add to the overall map using composite key: poolId-assetAddress
      latestByPool.forEach((borrowCostBasis, poolId) => {
        const compositeKey = `${poolId}-${assetAddress}`
        map.set(compositeKey, borrowCostBasis)
      })
    })

    return map
  }, [balanceHistoryQueries, uniqueAssetAddresses])

  // Build a mapping from assetAddress to balance history data
  // This prevents redundant fetches in child components
  const balanceHistoryDataMap = useMemo(() => {
    const map = new Map<string, BalanceHistoryDataEntry>()

    uniqueAssetAddresses.forEach((assetAddress, index) => {
      const query = balanceHistoryQueries[index]
      if (query?.data) {
        // Cast history to any[] for the utility functions that expect specific types
        const historyData = query.data.history as any[]
        const chartData = fillMissingDates(historyData, true, query.data.firstEventDate) as unknown as BalanceChartDataPoint[]
        const positionChanges = detectPositionChanges(historyData)
        const earningsStats = calculateEarningsStats(chartData as any, positionChanges)

        map.set(assetAddress, {
          chartData,
          positionChanges,
          earningsStats,
          rawData: query.data.history as unknown[],
          isLoading: query.isLoading,
          error: query.error,
        })
      }
    })

    return map
  }, [uniqueAssetAddresses, balanceHistoryQueries])

  return {
    uniqueAssetAddresses,
    balanceHistoryQueries,
    backstopBalanceHistoryQuery: {
      data: backstopBalanceHistoryQuery.data as BackstopBalanceHistoryData | undefined,
      isLoading: backstopBalanceHistoryQuery.isLoading,
      isError: backstopBalanceHistoryQuery.isError,
      error: backstopBalanceHistoryQuery.error,
    },
    poolAssetCostBasisMap,
    poolAssetBorrowCostBasisMap,
    balanceHistoryDataMap,
  }
}
