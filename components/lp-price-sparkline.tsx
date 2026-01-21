"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { LineChart, Line, Tooltip, ResponsiveContainer, YAxis } from "recharts"
import { format } from "date-fns"
import { fetchWithTimeout } from "@/lib/fetch-utils"
import { getUserTimezone, getTodayInUserTimezone } from "@/lib/date-utils"

interface PriceDataPoint {
  date: string
  price: number
}

interface PriceDataPointInput {
  date: string
  price: number
}

interface LpPriceSparklineProps {
  currentPrice?: number // SDK price to use for latest day
  priceHistory?: PriceDataPointInput[] // Pre-fetched price history (avoids multiple API calls)
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

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; payload: PriceDataPoint }>
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) {
    return null
  }

  const data = payload[0]
  const date = data.payload.date
  const price = data.value

  // Parse date as local time to avoid timezone shift
  // "2026-01-02" should display as "Jan 2, 2026" regardless of timezone
  const [year, month, day] = date.split('-').map(Number)
  const localDate = new Date(year, month - 1, day)

  return (
    <div className="bg-black text-white border border-zinc-800 rounded-md px-2 py-1.5 shadow-md text-[11px] whitespace-nowrap">
      <p className="text-zinc-400">
        {format(localDate, "MMM d, yyyy")}
      </p>
      <p className="font-medium text-purple-400">{formatPrice(price)}</p>
    </div>
  )
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

  // Filter out future dates and replace today's price with the SDK price
  const chartData = useMemo(() => {
    if (!priceHistory?.length) return []

    const today = getTodayInUserTimezone()

    // Filter out any dates that are "in the future" from user's timezone perspective
    // This handles the case where server (UTC) is ahead of the user's timezone
    const filteredData = priceHistory.filter(d => d.date <= today)

    if (!filteredData.length) return []
    if (currentPrice === undefined) return filteredData

    const data = [...filteredData]

    // Use SDK price for today's data point
    const todayIndex = data.findIndex(d => d.date === today)
    if (todayIndex !== -1) {
      data[todayIndex] = {
        ...data[todayIndex],
        price: currentPrice,
      }
    } else {
      data.push({
        date: today,
        price: currentPrice,
      })
    }

    return data
  }, [priceHistory, currentPrice])

  // Calculate price change percentage
  const { priceChange, priceChangePercent } = useMemo(() => {
    if (!chartData?.length || chartData.length < 2) {
      return { priceChange: 0, priceChangePercent: 0 }
    }

    const startPrice = chartData[0].price
    const endPrice = chartData[chartData.length - 1].price
    const change = endPrice - startPrice
    const changePercent = startPrice > 0 ? (change / startPrice) * 100 : 0

    return {
      priceChange: change,
      priceChangePercent: changePercent,
    }
  }, [chartData])

  // Default size if not specified via className
  const defaultSize = !className?.includes("w-") && !className?.includes("h-")
    ? "h-8 w-16"
    : ""

  if (isLoading) {
    return (
      <div
        className={`bg-muted/30 animate-pulse rounded ${defaultSize} ${className}`}
      />
    )
  }

  if (!chartData?.length) {
    return null
  }

  const isPositive = priceChangePercent >= 0

  return (
    <div className="flex items-center gap-3">
      <div className={`${defaultSize} ${className} flex-1`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
          >
            <YAxis domain={['dataMin', 'dataMax']} hide />
            <Tooltip
              content={<CustomTooltip />}
              cursor={false}
              allowEscapeViewBox={{ x: true, y: true }}
              wrapperStyle={{ zIndex: 50 }}
              position={{ y: -50 }}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#c084fc"
              strokeWidth={1}
              dot={false}
              activeDot={{
                r: 2,
                fill: "#c084fc",
                stroke: "#c084fc",
              }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="shrink-0 text-right">
        {currentPrice !== undefined && (
          <p className="text-sm font-semibold text-purple-400 mb-1">{formatPrice(currentPrice)}</p>
        )}
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">6mo</p>
        <p className={`text-xs ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
          {isPositive ? "+" : ""}{priceChangePercent.toFixed(1)}%
        </p>
      </div>
    </div>
  )
}
