"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchWithTimeout } from "@/lib/fetch-utils"
import { getUserTimezone } from "@/lib/date-utils"
import { BaseSparkline } from "@/components/charts/sparkline/base-sparkline"
import type { SparklineConfig } from "@/components/charts/sparkline/types"

interface PriceDataPoint {
  date: string
  price: number
}

interface LpPriceSparklineProps {
  currentPrice?: number // SDK price to use for latest day
  priceHistory?: PriceDataPoint[] // Pre-fetched price history (avoids multiple API calls)
  className?: string
}

async function fetchLpPriceHistory(timezone: string): Promise<PriceDataPoint[]> {
  const params = new URLSearchParams({
    days: "180", // 6 months
    timezone,
  })

  const response = await fetchWithTimeout(`/api/lp-price-history?${params}`)
  if (!response.ok) {
    throw new Error("Failed to fetch LP price history")
  }

  const data = await response.json()
  return data.history || []
}

function formatPrice(value: number): string {
  return `$${value.toFixed(4)}`
}

const LP_PRICE_CONFIG: SparklineConfig = {
  dataKey: "price",
  color: "#c084fc", // purple-400
  label: "Price",
  formatValue: formatPrice,
  tooltipColorClass: "text-purple-400",
  periodLabel: "6mo",
  statsMode: "change",
}

export function LpPriceSparkline({
  currentPrice,
  priceHistory: providedHistory,
  className = "",
}: LpPriceSparklineProps) {
  // Get user's timezone for consistent date handling
  const timezone = useMemo(() => getUserTimezone(), [])

  // Only fetch if no priceHistory was provided
  const { data: fetchedHistory, isLoading: isFetching } = useQuery({
    queryKey: ["lp-price-history", timezone],
    queryFn: () => fetchLpPriceHistory(timezone),
    staleTime: 60 * 60 * 1000, // 1 hour
    refetchInterval: false,
    enabled: !providedHistory, // Skip fetch if history is provided
  })

  // Use provided history or fetched history
  const priceHistory = providedHistory ?? fetchedHistory
  const isLoading = !providedHistory && isFetching

  return (
    <BaseSparkline
      data={priceHistory || []}
      currentValue={currentPrice}
      config={LP_PRICE_CONFIG}
      className={className}
      isLoading={isLoading}
    />
  )
}
