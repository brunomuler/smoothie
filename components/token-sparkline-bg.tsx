"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { AreaChart, Area, ResponsiveContainer, YAxis } from "recharts"
import { fetchWithTimeout } from "@/lib/fetch-utils"

interface PriceDataPoint {
  date: string
  price: number
}

interface TokenSparklineBgProps {
  tokenAddress: string
  className?: string
}

async function fetchTokenPriceHistory(tokenAddress: string): Promise<PriceDataPoint[]> {
  const params = new URLSearchParams({
    token: tokenAddress,
    days: "30", // 30 days for background sparkline
  })

  const response = await fetchWithTimeout(`/api/token-price-history?${params}`)
  if (!response.ok) {
    return []
  }

  const data = await response.json()
  return data.history || []
}

export function TokenSparklineBg({
  tokenAddress,
  className = "",
}: TokenSparklineBgProps) {
  const { data: priceHistory } = useQuery({
    queryKey: ["token-sparkline-bg", tokenAddress],
    queryFn: () => fetchTokenPriceHistory(tokenAddress),
    staleTime: 60 * 60 * 1000, // 1 hour
    refetchInterval: false,
  })

  // Determine if trend is positive or negative
  const isPositive = useMemo(() => {
    if (!priceHistory?.length || priceHistory.length < 2) return true
    const startPrice = priceHistory[0].price
    const endPrice = priceHistory[priceHistory.length - 1].price
    return endPrice >= startPrice
  }, [priceHistory])

  if (!priceHistory?.length) {
    return null
  }

  const strokeColor = isPositive ? "#22c55e" : "#ef4444" // green-500 or red-500
  const fillColor = isPositive ? "#22c55e" : "#ef4444"

  return (
    <div className={`absolute top-1/2 -translate-y-1/2 h-8 left-[-16px] right-[70px] overflow-visible pointer-events-none ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={priceHistory}
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        >
            <defs>
              <linearGradient id={`gradient-${tokenAddress}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={fillColor} stopOpacity={0.15} />
                <stop offset="100%" stopColor={fillColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis domain={["dataMin", "dataMax"]} hide />
            <Area
              type="monotone"
              dataKey="price"
              stroke={strokeColor}
              strokeWidth={1}
              strokeOpacity={0.3}
              fill={`url(#gradient-${tokenAddress})`}
              isAnimationActive={false}
            />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
