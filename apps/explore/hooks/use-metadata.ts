"use client"

import { useQuery } from "@tanstack/react-query"
import type { Pool, Token } from "@/lib/db/types"

export interface MetadataResponse {
  pools?: Pool[]
  tokens?: Token[]
}

/**
 * Hook to fetch pool and token metadata from the database
 *
 * Returns pools and tokens dictionaries for display purposes
 * (names, symbols, icons, etc.)
 */
export function useMetadata(enabled = true) {
  const query = useQuery({
    queryKey: ["metadata"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/metadata", { signal })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || "Failed to fetch metadata")
      }

      return response.json() as Promise<MetadataResponse>
    },
    enabled,
    staleTime: 60 * 60 * 1000, // 1 hour - metadata rarely changes
    refetchOnWindowFocus: false,
    retry: 2,
  })

  return {
    isLoading: query.isLoading,
    error: query.error as Error | null,
    pools: query.data?.pools || [],
    tokens: query.data?.tokens || [],
    refetch: query.refetch,
  }
}

/**
 * Hook to get a specific pool by ID
 */
export function usePool(poolId: string | undefined, enabled = true) {
  const { pools, isLoading, error } = useMetadata(enabled && !!poolId)

  const pool = pools.find((p) => p.pool_id === poolId) || null

  return { pool, isLoading, error }
}

/**
 * Hook to get a specific token by address
 */
export function useToken(assetAddress: string | undefined, enabled = true) {
  const { tokens, isLoading, error } = useMetadata(enabled && !!assetAddress)

  const token = tokens.find((t) => t.asset_address === assetAddress) || null

  return { token, isLoading, error }
}

/**
 * Create lookup maps for pools and tokens
 */
export function useMetadataLookup(enabled = true) {
  const { pools, tokens, isLoading, error } = useMetadata(enabled)

  const poolsMap = new Map<string, Pool>()
  pools.forEach((p) => poolsMap.set(p.pool_id, p))

  const tokensMap = new Map<string, Token>()
  tokens.forEach((t) => tokensMap.set(t.asset_address, t))

  return {
    poolsMap,
    tokensMap,
    getPool: (poolId: string) => poolsMap.get(poolId),
    getToken: (assetAddress: string) => tokensMap.get(assetAddress),
    isLoading,
    error,
  }
}
