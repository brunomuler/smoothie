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

// Get user's timezone
function getUserTimezone(): string {
  if (typeof window === 'undefined') return 'UTC'
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

// Get today's date in user's timezone as YYYY-MM-DD
function getTodayInTimezone(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: getUserTimezone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(new Date())
}

type SparklinePeriod = "24h" | "7d" | "1mo"

interface TokenSparklineProps {
  tokenAddress: string
  currentPrice?: number // Latest oracle price to use for the most recent data point
  period?: SparklinePeriod
  className?: string
}

async function fetchTokenPriceHistory(tokenAddress: string, period: SparklinePeriod = "1mo"): Promise<PriceDataPoint[]> {
  const daysMap = {
    "24h": "1",
    "7d": "7",
    "1mo": "30",
  }

  const params = new URLSearchParams({
    token: tokenAddress,
    days: daysMap[period],
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
  // Parse date as local time to avoid timezone shift
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
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

// Calculate price change percentage for given period
function calculatePriceChange(priceHistory: PriceDataPoint[]): { percentage: number; trend: "up" | "down" | "unchanged" } {
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
  currentPrice,
  period = "1mo",
  className = "",
}: TokenSparklineProps) {
  // Don't show sparkline for 24h period
  if (period === "24h") {
    return null
  }

  const { data: priceHistory } = useQuery({
    queryKey: ["token-sparkline", tokenAddress, period],
    queryFn: () => fetchTokenPriceHistory(tokenAddress, period),
    staleTime: 5 * 60 * 1000, // 5 minutes - match oracle refresh rate
    refetchInterval: false,
  })

  // Add current oracle price if provided, filtering out future dates
  const chartData = useMemo(() => {
    if (!priceHistory?.length) return []

    const today = getTodayInTimezone()

    // Filter out any dates that are "in the future" from user's timezone perspective
    // This handles the case where server (UTC) is ahead of the user's timezone
    const filteredData = priceHistory.filter(d => d.date <= today)

    if (!filteredData.length) return []
    if (currentPrice === undefined) return filteredData

    const data = [...filteredData]

    // Find today's entry and replace with SDK price
    const todayIndex = data.findIndex(d => d.date === today)
    if (todayIndex !== -1) {
      data[todayIndex] = {
        ...data[todayIndex],
        price: currentPrice,
      }
    } else if (data.length > 0) {
      // If today isn't in the data yet, replace the last entry with SDK price
      data[data.length - 1] = {
        ...data[data.length - 1],
        price: currentPrice,
      }
    }

    return data
  }, [priceHistory, currentPrice, tokenAddress, period])

  const { trend } = useMemo(() => calculatePriceChange(chartData), [chartData])

  if (!chartData?.length) {
    return null
  }

  const strokeColor = trend === "up" ? "#22c55e" : trend === "down" ? "#ff3b30" : "rgba(255, 255, 255, 0.25)" // green-500, vibrant red

  return (
    <div className={`h-6 w-full max-w-48 ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
        >
          <YAxis domain={["dataMin", "dataMax"]} hide />
          <RechartsTooltip
            content={<SparklineTooltip />}
            cursor={{ stroke: "rgba(255, 255, 255, 0.2)", strokeWidth: 1 }}
            wrapperStyle={{ zIndex: 50 }}
            position={{ y: -50 }}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke={strokeColor}
            strokeWidth={1}
            dot={false}
            activeDot={{ r: 2, fill: strokeColor }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// Price change indicator component
export function Token30dChange({
  tokenAddress,
  currentPrice,
  period = "1mo",
  showPrice = false,
  onToggle,
}: {
  tokenAddress: string
  currentPrice?: number // Latest oracle price to use for the most recent data point
  period?: SparklinePeriod
  showPrice?: boolean // Toggle to show current price instead of percentage
  onToggle?: () => void // Callback when tapped to toggle display mode
}) {
  const { data: priceHistory } = useQuery({
    queryKey: ["token-sparkline", tokenAddress, period],
    queryFn: () => fetchTokenPriceHistory(tokenAddress, period),
    staleTime: 5 * 60 * 1000, // 5 minutes - match oracle refresh rate
    refetchInterval: false,
  })

  // Add current oracle price if provided, filtering out future dates
  const chartData = useMemo(() => {
    if (!priceHistory?.length) return []

    const today = getTodayInTimezone()

    // Filter out any dates that are "in the future" from user's timezone perspective
    // This handles the case where server (UTC) is ahead of the user's timezone
    const filteredData = priceHistory.filter(d => d.date <= today)

    if (!filteredData.length) return []
    if (currentPrice === undefined) return filteredData

    const data = [...filteredData]

    // Find today's entry and replace with SDK price
    const todayIndex = data.findIndex(d => d.date === today)
    if (todayIndex !== -1) {
      data[todayIndex] = {
        ...data[todayIndex],
        price: currentPrice,
      }
    } else if (data.length > 0) {
      // If today isn't in the data yet, replace the last entry with SDK price
      data[data.length - 1] = {
        ...data[data.length - 1],
        price: currentPrice,
      }
    }

    return data
  }, [priceHistory, currentPrice, tokenAddress, period])

  const { percentage, trend } = useMemo(() => calculatePriceChange(chartData), [chartData])

  if (!chartData?.length) {
    return null
  }

  const colorClass = trend === "up" ? "text-green-500" : trend === "down" ? "text-[#ff3b30]" : "text-white/25"
  const Icon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : null

  // Label based on period
  const periodLabel = period === "24h" ? "24h" : period === "7d" ? "7d" : "30d"

  // Get the display price (use currentPrice if available, otherwise last price from history)
  const displayPrice = currentPrice ?? chartData[chartData.length - 1]?.price

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`flex items-center gap-0.5 text-xs ${colorClass} ${onToggle ? "cursor-pointer active:opacity-70" : "cursor-default"}`}
          onClick={onToggle}
        >
          {showPrice ? (
            <span>{formatPrice(displayPrice)}</span>
          ) : (
            <>
              {Icon && <Icon className="h-3 w-3" />}
              <span>{Math.abs(percentage).toFixed(1)}%</span>
            </>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>{showPrice ? "Current price" : `${periodLabel} price change`}</TooltipContent>
    </Tooltip>
  )
}

// Legacy export for backwards compatibility
export const TokenSparklineBg = TokenSparkline
