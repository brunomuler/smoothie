"use client"

import { useQuery, useInfiniteQuery } from "@tanstack/react-query"
import type { UserAction, ActionType } from "@/lib/db/types"
import { fetchWithTimeout } from "@/lib/fetch-utils"

export interface UserActionsResponse {
  user_address: string
  count: number
  limit: number
  offset: number
  actions: UserAction[]
}

export interface UseUserActionsOptions {
  publicKey: string
  limit?: number
  offset?: number
  actionTypes?: ActionType[]
  poolId?: string
  assetAddress?: string
  enabled?: boolean
  /** Only subscribe to actions array changes, ignoring count/offset changes */
  selectActionsOnly?: boolean
}

export interface UseUserActionsResult {
  isLoading: boolean
  error: Error | null
  data: UserActionsResponse | undefined
  actions: UserAction[]
  refetch: () => void
  hasMore: boolean
}

/**
 * Hook to fetch user action history from the database
 *
 * Returns all user actions (supply, withdraw, borrow, repay, claim, etc.)
 * with pool and token metadata included
 */
export function useUserActions({
  publicKey,
  limit = 50,
  offset = 0,
  actionTypes,
  poolId,
  assetAddress,
  enabled = true,
  selectActionsOnly = false,
}: UseUserActionsOptions): UseUserActionsResult {
  const query = useQuery({
    queryKey: [
      "user-actions",
      publicKey,
      limit,
      offset,
      actionTypes?.join(","),
      poolId,
      assetAddress,
    ],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        user: publicKey,
        limit: limit.toString(),
        offset: offset.toString(),
      })

      if (actionTypes && actionTypes.length > 0) {
        params.set("actionTypes", actionTypes.join(","))
      }

      if (poolId) {
        params.set("pool", poolId)
      }

      if (assetAddress) {
        params.set("asset", assetAddress)
      }

      const response = await fetchWithTimeout(`/api/user-actions?${params.toString()}`, { signal })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || "Failed to fetch user actions")
      }

      return response.json() as Promise<UserActionsResponse>
    },
    // Use select to only re-render when actions change (not count/offset metadata)
    select: selectActionsOnly ? (data) => ({ ...data, actions: data.actions }) : undefined,
    enabled: enabled && !!publicKey,
    staleTime: 30 * 1000, // 30 seconds - actions update more frequently
    refetchOnWindowFocus: false, // Disabled to reduce unnecessary refetches
    retry: 2,
  })

  return {
    isLoading: query.isLoading,
    error: query.error as Error | null,
    data: query.data,
    actions: query.data?.actions || [],
    refetch: query.refetch,
    hasMore: (query.data?.count || 0) >= limit,
  }
}

export interface UseInfiniteUserActionsOptions {
  publicKey: string
  limit?: number
  actionTypes?: ActionType[]
  poolId?: string
  assetAddress?: string
  startDate?: string
  endDate?: string
  enabled?: boolean
}

export interface UseInfiniteUserActionsResult {
  isLoading: boolean
  isFetchingNextPage: boolean
  error: Error | null
  actions: UserAction[]
  fetchNextPage: () => void
  hasNextPage: boolean
  refetch: () => void
}

/**
 * Hook to fetch user action history with infinite scroll pagination
 */
export function useInfiniteUserActions({
  publicKey,
  limit = 50,
  actionTypes,
  poolId,
  assetAddress,
  startDate,
  endDate,
  enabled = true,
}: UseInfiniteUserActionsOptions): UseInfiniteUserActionsResult {
  const query = useInfiniteQuery({
    queryKey: [
      "user-actions-infinite",
      publicKey,
      limit,
      actionTypes?.join(","),
      poolId,
      assetAddress,
      startDate,
      endDate,
    ],
    queryFn: async ({ pageParam = 0, signal }) => {
      const params = new URLSearchParams({
        user: publicKey,
        limit: limit.toString(),
        offset: pageParam.toString(),
      })

      if (actionTypes && actionTypes.length > 0) {
        params.set("actionTypes", actionTypes.join(","))
      }

      if (poolId) {
        params.set("pool", poolId)
      }

      if (assetAddress) {
        params.set("asset", assetAddress)
      }

      if (startDate) {
        params.set("startDate", startDate)
      }

      if (endDate) {
        params.set("endDate", endDate)
      }

      const response = await fetchWithTimeout(`/api/user-actions?${params.toString()}`, { signal })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || "Failed to fetch user actions")
      }

      return response.json() as Promise<UserActionsResponse>
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      // If we got fewer results than the limit, there are no more pages
      if (lastPage.count < limit) {
        return undefined
      }
      // Calculate the next offset
      const totalLoaded = allPages.reduce((sum, page) => sum + page.count, 0)
      return totalLoaded
    },
    enabled: enabled && !!publicKey,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false, // Disabled to reduce unnecessary refetches
    retry: 2,
  })

  // Flatten all pages into a single array of actions
  const actions = query.data?.pages.flatMap((page) => page.actions) || []

  return {
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    error: query.error as Error | null,
    actions,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    refetch: query.refetch,
  }
}
