"use client"

import { useQuery } from "@tanstack/react-query"
import { PricesResponse, TokenPrice } from "@/types/explore"

/**
 * Hook to fetch token prices
 */
export function usePrices(assetAddresses?: string[], enabled = true) {
  const query = useQuery({
    queryKey: ["prices", assetAddresses?.join(",")],
    queryFn: async () => {
      let url = "/api/prices"
      if (assetAddresses?.length) {
        url += `?assets=${assetAddresses.join(",")}`
      }

      const response = await fetch(url)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || "Failed to fetch prices")
      }

      return response.json() as Promise<PricesResponse>
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    retry: 2,
  })

  const pricesMap = new Map<string, TokenPrice>()
  if (query.data?.prices) {
    Object.entries(query.data.prices).forEach(([address, price]) => {
      pricesMap.set(address, price)
    })
  }

  return {
    isLoading: query.isLoading,
    error: query.error as Error | null,
    prices: query.data?.prices || {},
    pricesMap,
    getPrice: (assetAddress: string) => pricesMap.get(assetAddress)?.usd || 0,
    refetch: query.refetch,
  }
}
