"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchWithTimeout } from "@/lib/fetch-utils"
import { BaseSparkline } from "@/components/charts/sparkline/base-sparkline"
import type { SparklineConfig } from "@/components/charts/sparkline/types"

interface PriceDataPoint {
  date: string
  price: number
}

interface TokenPriceSparklineProps {
  tokenAddress: string
  tokenSymbol: string
  currentPrice?: number // SDK price to use for latest day
  className?: string
}

async function fetchTokenPriceHistory(
  tokenAddress: string,
): Promise<PriceDataPoint[]> {
  const params = new URLSearchParams({
    token: tokenAddress,
    days: "180", // 6 months
  })

  const response = await fetchWithTimeout(`/api/token-price-history?${params}`)
  if (!response.ok) {
    throw new Error("Failed to fetch token price history")
  }

  const data = await response.json()
  return data.history || []
}

function formatPrice(value: number): string {
  if (value >= 1) {
    return `$${value.toFixed(2)}`
  }
  if (value >= 0.01) {
    return `$${value.toFixed(4)}`
  }
  return `$${value.toFixed(6)}`
}

function createConfig(tokenSymbol: string): SparklineConfig {
  return {
    dataKey: "price",
    color: "#3b82f6", // blue-500
    label: tokenSymbol,
    formatValue: formatPrice,
    tooltipColorClass: "text-blue-400",
    periodLabel: "6mo",
    statsMode: "change",
  }
}

export function TokenPriceSparkline({
  tokenAddress,
  tokenSymbol,
  currentPrice,
  className = "",
}: TokenPriceSparklineProps) {
  const { data: priceHistory, isLoading } = useQuery({
    queryKey: ["token-price-history", tokenAddress],
    queryFn: () => fetchTokenPriceHistory(tokenAddress),
    staleTime: 60 * 60 * 1000, // 1 hour
    refetchInterval: false,
  })

  const config = useMemo(() => createConfig(tokenSymbol), [tokenSymbol])

  return (
    <BaseSparkline
      data={priceHistory || []}
      currentValue={currentPrice}
      config={config}
      className={className}
      isLoading={isLoading}
    />
  )
}
