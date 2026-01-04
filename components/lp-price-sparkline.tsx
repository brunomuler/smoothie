"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { LineChart, Line, Tooltip, ResponsiveContainer, YAxis } from "recharts"
import { format } from "date-fns"
import { fetchWithTimeout } from "@/lib/fetch-utils"

interface PriceDataPoint {
  date: string
  price: number
}

interface LpPriceSparklineProps {
  currentPrice?: number // SDK price to use for latest day
  className?: string
}

async function fetchLpPriceHistory(): Promise<PriceDataPoint[]> {
  const params = new URLSearchParams({
    days: "180", // 6 months
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
  className = "",
}: LpPriceSparklineProps) {
  const { data: priceHistory, isLoading } = useQuery({
    queryKey: ["lp-price-history"],
    queryFn: () => fetchLpPriceHistory(),
    staleTime: 60 * 60 * 1000, // 1 hour
    refetchInterval: false,
  })

  // Replace the latest day's price with the SDK price if provided
  const chartData = useMemo(() => {
    if (!priceHistory?.length) return []
    if (currentPrice === undefined) return priceHistory

    // Replace the last data point with current SDK price
    const data = [...priceHistory]
    if (data.length > 0) {
      data[data.length - 1] = {
        ...data[data.length - 1],
        price: currentPrice,
      }
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
    <div className="flex items-center gap-2">
      <div className={`${defaultSize} ${className}`}>
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
              offset={-70}
              position={{ y: -50 }}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#c084fc"
              strokeWidth={1.5}
              dot={false}
              activeDot={{
                r: 3,
                fill: "#c084fc",
                stroke: "#c084fc",
              }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="text-[10px] text-muted-foreground whitespace-nowrap">
        6mo:<br />
        <span className={isPositive ? "text-emerald-400" : "text-red-400"}>
          {isPositive ? "+" : ""}{priceChangePercent.toFixed(1)}%
        </span>
      </div>
    </div>
  )
}
