"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { LineChart, Line, Tooltip, ResponsiveContainer, YAxis } from "recharts"
import { format } from "date-fns"
import { fetchWithTimeout } from "@/lib/fetch-utils"

interface ApyDataPoint {
  date: string
  apy: number
}

interface BackstopApySparklineProps {
  poolId: string
  currentApy?: number // SDK APY to use for latest day
  className?: string
}

// Get today's date in user's local timezone as YYYY-MM-DD
function getTodayInTimezone(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function fetchBackstopApyHistory(poolId: string): Promise<ApyDataPoint[]> {
  const params = new URLSearchParams({
    pool: poolId,
    days: "180", // 6 months
  })

  const response = await fetchWithTimeout(`/api/backstop-apy-history?${params}`)
  if (!response.ok) {
    throw new Error("Failed to fetch backstop APY history")
  }

  const data = await response.json()
  return data.history || []
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; payload: ApyDataPoint }>
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) {
    return null
  }

  const data = payload[0]
  const date = data.payload.date
  const apy = data.value

  // Parse date as local time by adding T12:00:00 to avoid timezone issues
  // new Date("2026-01-20") parses as UTC midnight, which shows as previous day in timezones behind UTC
  const localDate = new Date(date + "T12:00:00")

  return (
    <div className="bg-black text-white border border-zinc-800 rounded-md px-2 py-1.5 shadow-md text-[11px] whitespace-nowrap">
      <p className="text-zinc-400">
        {format(localDate, "MMM d, yyyy")}
      </p>
      <p className="font-medium text-emerald-400">{formatPercent(apy)} APR</p>
    </div>
  )
}

export function BackstopApySparkline({
  poolId,
  currentApy,
  className = "",
}: BackstopApySparklineProps) {
  const { data: apyHistory, isLoading } = useQuery({
    queryKey: ["backstop-apy-history", poolId],
    queryFn: () => fetchBackstopApyHistory(poolId),
    staleTime: 60 * 60 * 1000, // 1 hour
    refetchInterval: false,
  })

  // Compute today outside useMemo so it's fresh on every render
  const today = getTodayInTimezone()

  // Filter out future dates and replace today's APY with the SDK APY
  const chartData = useMemo(() => {
    if (!apyHistory?.length) return []

    // Filter out any dates that are "in the future" from user's timezone perspective
    // This handles the case where server (UTC) is ahead of the user's timezone
    const filteredHistory = apyHistory.filter(d => d.date <= today)

    if (!filteredHistory.length) return []
    if (currentApy === undefined) return filteredHistory

    const data = [...filteredHistory]

    // Use SDK APY for today's data point
    const todayIndex = data.findIndex(d => d.date === today)
    if (todayIndex !== -1) {
      data[todayIndex] = {
        ...data[todayIndex],
        apy: currentApy,
      }
    } else {
      data.push({
        date: today,
        apy: currentApy,
      })
    }

    return data
  }, [apyHistory, currentApy, today])

  // Calculate min/max for better visualization and 6mo average
  const { avgApy } = useMemo(() => {
    if (!chartData?.length) return { minApy: 0, maxApy: 10, avgApy: 0 }

    const values = chartData.map((d) => d.apy)
    const min = Math.min(...values)
    const max = Math.max(...values)

    // Calculate average from all valid data points
    const sum = values.reduce((acc, val) => acc + val, 0)
    const avg = sum / values.length

    // Add some padding
    const padding = (max - min) * 0.1 || 1
    return {
      minApy: Math.max(0, min - padding),
      maxApy: max + padding,
      avgApy: avg,
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
              dataKey="apy"
              stroke="#34d399"
              strokeWidth={1}
              dot={false}
              activeDot={{
                r: 2,
                fill: "#34d399",
                stroke: "#34d399",
              }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="shrink-0 text-right">
        {currentApy !== undefined && (
          <p className="text-sm font-semibold text-emerald-400 mb-1">{formatPercent(currentApy)}</p>
        )}
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">6mo avg</p>
        <p className="text-xs text-foreground">{formatPercent(avgApy)}</p>
      </div>
    </div>
  )
}
