"use client"

import { useQuery } from "@tanstack/react-query"
import type { UserAction, ActionType } from "@/lib/db/types"

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
    queryFn: async () => {
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

      const response = await fetch(`/api/user-actions?${params.toString()}`)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || "Failed to fetch user actions")
      }

      return response.json() as Promise<UserActionsResponse>
    },
    enabled: enabled && !!publicKey,
    staleTime: 30 * 1000, // 30 seconds - actions update more frequently
    refetchOnWindowFocus: true,
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
