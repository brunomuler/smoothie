"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip as RechartsTooltip } from "recharts"
import { fetchWithTimeout } from "@/lib/fetch-utils"
import { TrendingUp, TrendingDown } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface PriceDataPoint {
  date: string
  price: number
}

interface TokenSparklineProps {
  tokenAddress: string
  className?: string
}

async function fetchTokenPriceHistory(tokenAddress: string): Promise<PriceDataPoint[]> {
  const params = new URLSearchParams({
    token: tokenAddress,
    days: "30",
  })

  const response = await fetchWithTimeout(`/api/token-price-history?${params}`)
  if (!response.ok) {
    return []
  }

  const data = await response.json()
  return data.history || []
}

// Format price for display
function formatPrice(price: number): string {
  if (price >= 1) {
    return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  } else if (price >= 0.01) {
    return `$${price.toFixed(4)}`
  } else {
    return `$${price.toFixed(6)}`
  }
}

// Format date for tooltip
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

// Custom tooltip component
function SparklineTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: PriceDataPoint }> }) {
  if (!active || !payload?.length) {
    return null
  }

  const data = payload[0].payload
  return (
    <div className="rounded-md bg-zinc-900 border border-zinc-700 px-2 py-1 shadow-lg">
      <p className="text-xs text-zinc-400">{formatDate(data.date)}</p>
      <p className="text-sm font-medium text-white">{formatPrice(data.price)}</p>
    </div>
  )
}

// Calculate 30d change percentage
function calculate30dChange(priceHistory: PriceDataPoint[]): { percentage: number; trend: "up" | "down" | "unchanged" } {
  if (!priceHistory?.length || priceHistory.length < 2) {
    return { percentage: 0, trend: "unchanged" }
  }
  const startPrice = priceHistory[0].price
  const endPrice = priceHistory[priceHistory.length - 1].price

  if (startPrice === 0) {
    return { percentage: 0, trend: "unchanged" }
  }

  const percentage = ((endPrice - startPrice) / startPrice) * 100

  // Consider changes less than 0.01% as unchanged
  if (Math.abs(percentage) < 0.01) {
    return { percentage: 0, trend: "unchanged" }
  }

  return {
    percentage,
    trend: percentage > 0 ? "up" : "down"
  }
}

// Inline sparkline component
export function TokenSparkline({
  tokenAddress,
  className = "",
}: TokenSparklineProps) {
  const { data: priceHistory } = useQuery({
    queryKey: ["token-sparkline", tokenAddress],
    queryFn: () => fetchTokenPriceHistory(tokenAddress),
    staleTime: 60 * 60 * 1000, // 1 hour
    refetchInterval: false,
  })

  const { trend } = useMemo(() => calculate30dChange(priceHistory || []), [priceHistory])

  if (!priceHistory?.length) {
    return null
  }

  const strokeColor = trend === "up" ? "#22c55e" : trend === "down" ? "#f87171" : "rgba(255, 255, 255, 0.12)" // green-500, red-400, white with low opacity

  return (
    <div className={`h-6 w-full max-w-48 ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={priceHistory}
          margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
        >
          <YAxis domain={["dataMin", "dataMax"]} hide />
          <RechartsTooltip
            content={<SparklineTooltip />}
            cursor={{ stroke: "rgba(255, 255, 255, 0.2)", strokeWidth: 1 }}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke={strokeColor}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: strokeColor }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// 30d change indicator component
export function Token30dChange({
  tokenAddress,
}: {
  tokenAddress: string
}) {
  const { data: priceHistory } = useQuery({
    queryKey: ["token-sparkline", tokenAddress],
    queryFn: () => fetchTokenPriceHistory(tokenAddress),
    staleTime: 60 * 60 * 1000, // 1 hour
    refetchInterval: false,
  })

  const { percentage, trend } = useMemo(() => calculate30dChange(priceHistory || []), [priceHistory])

  if (!priceHistory?.length) {
    return null
  }

  const colorClass = trend === "up" ? "text-green-500" : trend === "down" ? "text-red-400" : "text-white/25"
  const Icon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`flex items-center gap-0.5 text-xs ${colorClass} cursor-default`}>
          {Icon && <Icon className="h-3 w-3" />}
          <span>{Math.abs(percentage).toFixed(1)}%</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>30-day price change</TooltipContent>
    </Tooltip>
  )
}

// Legacy export for backwards compatibility
export const TokenSparklineBg = TokenSparkline
