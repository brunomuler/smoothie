"use client"

import { useQuery } from "@tanstack/react-query"
import {
  ExploreFilters,
  ExploreResponse,
  ExploreQueryType,
  TimeRangePreset,
} from "@/types/explore"

interface UseExploreParams {
  query: ExploreQueryType
  assetAddress?: string
  poolId?: string
  minAmount?: number
  minCount?: number
  inUsd?: boolean
  eventTypes?: string[]
  timeRange?: TimeRangePreset
  startDate?: string
  endDate?: string
  orderBy?: "amount" | "count" | "date"
  orderDir?: "asc" | "desc"
  limit?: number
  offset?: number
  enabled?: boolean
}

/**
 * Build query string from params
 */
function buildQueryString(params: UseExploreParams): string {
  const searchParams = new URLSearchParams()

  searchParams.set("query", params.query)

  if (params.assetAddress) searchParams.set("asset", params.assetAddress)
  if (params.poolId) searchParams.set("pool", params.poolId)
  if (params.minAmount !== undefined) searchParams.set("minAmount", params.minAmount.toString())
  if (params.minCount !== undefined) searchParams.set("minCount", params.minCount.toString())
  if (params.inUsd) searchParams.set("inUsd", "true")
  if (params.eventTypes?.length) searchParams.set("eventTypes", params.eventTypes.join(","))
  if (params.timeRange) searchParams.set("timeRange", params.timeRange)
  if (params.startDate) searchParams.set("startDate", params.startDate)
  if (params.endDate) searchParams.set("endDate", params.endDate)
  if (params.orderBy) searchParams.set("orderBy", params.orderBy)
  if (params.orderDir) searchParams.set("orderDir", params.orderDir)
  if (params.limit) searchParams.set("limit", params.limit.toString())
  if (params.offset) searchParams.set("offset", params.offset.toString())

  return searchParams.toString()
}

/**
 * Hook to fetch explore data from the API
 */
export function useExplore(params: UseExploreParams) {
  const {
    query,
    assetAddress,
    poolId,
    minAmount,
    minCount,
    inUsd = false,
    eventTypes,
    timeRange,
    startDate,
    endDate,
    orderBy = "amount",
    orderDir = "desc",
    limit = 50,
    offset = 0,
    enabled = true,
  } = params

  // Build a stable query key
  const queryKey = [
    "explore",
    query,
    assetAddress,
    poolId,
    minAmount,
    minCount,
    inUsd,
    eventTypes?.join(","),
    timeRange,
    startDate,
    endDate,
    orderBy,
    orderDir,
    limit,
    offset,
  ]

  const result = useQuery({
    queryKey,
    queryFn: async () => {
      const queryString = buildQueryString({
        query,
        assetAddress,
        poolId,
        minAmount,
        minCount,
        inUsd,
        eventTypes,
        timeRange,
        startDate,
        endDate,
        orderBy,
        orderDir,
        limit,
        offset,
      })

      const response = await fetch(`/api/explore?${queryString}`)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || "Failed to fetch explore data")
      }

      return response.json() as Promise<ExploreResponse>
    },
    enabled,
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: false,
    retry: 2,
  })

  return {
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error as Error | null,
    data: result.data,
    refetch: result.refetch,
  }
}

/**
 * Hook to fetch aggregate data only
 */
export function useExploreAggregates(params: {
  timeRange?: TimeRangePreset
  poolId?: string
  assetAddress?: string
  enabled?: boolean
}) {
  return useExplore({
    query: "aggregates",
    timeRange: params.timeRange,
    poolId: params.poolId,
    assetAddress: params.assetAddress,
    enabled: params.enabled,
  })
}

/**
 * Hook for deposits query
 */
export function useExploreDeposits(params: {
  assetAddress: string
  minAmount: number
  inUsd?: boolean
  orderDir?: "asc" | "desc"
  limit?: number
  offset?: number
  enabled?: boolean
}) {
  return useExplore({
    query: "deposits",
    ...params,
  })
}

/**
 * Hook for events query
 */
export function useExploreEvents(params: {
  assetAddress?: string
  eventTypes?: string[]
  minCount: number
  orderDir?: "asc" | "desc"
  limit?: number
  offset?: number
  enabled?: boolean
}) {
  return useExplore({
    query: "events",
    ...params,
  })
}

/**
 * Hook for balance query
 */
export function useExploreBalance(params: {
  assetAddress: string
  minAmount: number
  inUsd?: boolean
  orderDir?: "asc" | "desc"
  limit?: number
  offset?: number
  enabled?: boolean
}) {
  return useExplore({
    query: "balance",
    ...params,
  })
}

/**
 * Hook for top depositors query
 */
export function useExploreTopDepositors(params: {
  poolId: string
  assetAddress?: string
  limit?: number
  enabled?: boolean
}) {
  return useExplore({
    query: "top-depositors",
    ...params,
  })
}
