"use client"

import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import type { HistoricalPriceResult, HistoricalPricesResponse } from "@/app/api/historical-prices/route"

interface UseChartHistoricalPricesParams {
  tokenAddresses: string[]
  dates: string[]
  sdkPrices: Map<string, number>  // Current SDK prices for fallback
  enabled?: boolean
}

export interface ChartHistoricalPrices {
  // Map: tokenAddress -> date -> price
  prices: Map<string, Map<string, number>>
  // Get price for a specific token on a specific date
  getPrice: (tokenAddress: string, date: string) => number
  // Whether we're using historical prices or SDK fallback
  hasHistoricalData: boolean
  isLoading: boolean
  error: Error | null
}

async function fetchHistoricalPrices(
  tokenAddresses: string[],
  dates: string[],
  sdkPrices: Record<string, number>
): Promise<HistoricalPricesResponse> {
  // IMPORTANT: SDK prices must be in the same order as tokenAddresses
  const orderedSdkPrices = tokenAddresses.map(addr => sdkPrices[addr] || 0)

  const params = new URLSearchParams({
    tokens: tokenAddresses.join(','),
    dates: dates.join(','),
    sdkPrices: orderedSdkPrices.join(','),
  })

  const response = await fetch(`/api/historical-prices?${params}`)
  if (!response.ok) {
    throw new Error('Failed to fetch historical prices')
  }

  return response.json()
}

export function useChartHistoricalPrices({
  tokenAddresses,
  dates,
  sdkPrices,
  enabled = true,
}: UseChartHistoricalPricesParams): ChartHistoricalPrices {
  // Convert SDK prices map to object for the API call
  const sdkPricesObj = useMemo(() => {
    const obj: Record<string, number> = {}
    sdkPrices.forEach((price, address) => {
      obj[address] = price
    })
    return obj
  }, [sdkPrices])

  // Create a stable key for the query
  const queryKey = useMemo(() => {
    const tokensKey = tokenAddresses.slice().sort().join(',')
    const datesKey = dates.length > 0 ? `${dates[0]}-${dates[dates.length - 1]}` : ''
    return ['chart-historical-prices', tokensKey, datesKey]
  }, [tokenAddresses, dates])

  const query = useQuery({
    queryKey,
    queryFn: () => fetchHistoricalPrices(tokenAddresses, dates, sdkPricesObj),
    enabled: enabled && tokenAddresses.length > 0 && dates.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  })

  // Build the prices map
  const pricesMap = useMemo(() => {
    const map = new Map<string, Map<string, number>>()

    if (query.data?.prices) {
      for (const [tokenAddress, dateMap] of Object.entries(query.data.prices)) {
        const tokenMap = new Map<string, number>()
        for (const [date, priceResult] of Object.entries(dateMap)) {
          tokenMap.set(date, (priceResult as HistoricalPriceResult).price)
        }
        map.set(tokenAddress, tokenMap)
      }
    }

    return map
  }, [query.data])

  // Helper function to get price for a token on a date
  const getPrice = useMemo(() => {
    return (tokenAddress: string, date: string): number => {
      // Today's date should ALWAYS use SDK price (most accurate)
      // Use local date to match the user's timezone
      const now = new Date()
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      if (date >= today) {
        return sdkPrices.get(tokenAddress) || 1
      }

      // For past dates, check if we have historical price data
      const tokenPrices = pricesMap.get(tokenAddress)
      if (tokenPrices) {
        const price = tokenPrices.get(date)
        if (price !== undefined) {
          return price
        }
      }

      // Fallback to SDK price if no historical data for past date
      return sdkPrices.get(tokenAddress) || 1
    }
  }, [pricesMap, sdkPrices])

  return {
    prices: pricesMap,
    getPrice,
    hasHistoricalData: pricesMap.size > 0,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  }
}
