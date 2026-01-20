"use client"

import { useMemo, useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { LineChart, Line, Tooltip, ResponsiveContainer, YAxis } from "recharts"
import { format } from "date-fns"
import { fetchWithTimeout } from "@/lib/fetch-utils"

interface Q4wDataPoint {
  date: string
  q4wPercent: number
}

interface Q4wSparklineProps {
  poolId: string
  currentQ4w?: number // SDK Q4W percent to use for latest day
  className?: string
}

// Get user's timezone for API calls
function getUserTimezone(): string {
  if (typeof window === 'undefined') return 'UTC'
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

// Get today's date in user's local timezone as YYYY-MM-DD
// Uses the browser's local date (getFullYear/getMonth/getDate use local time)
function getLocalToday(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function fetchQ4wHistory(poolId: string): Promise<Q4wDataPoint[]> {
  const params = new URLSearchParams({
    pool: poolId,
    days: "180", // 6 months
    timezone: getUserTimezone(),
  })

  const response = await fetchWithTimeout(`/api/backstop-q4w-history?${params}`)
  if (!response.ok) {
    throw new Error("Failed to fetch Q4W history")
  }

  const data = await response.json()
  return data.history || []
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; payload: Q4wDataPoint }>
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) {
    return null
  }

  const data = payload[0]
  const date = data.payload.date
  const q4w = data.value

  // Parse date as local time by adding T12:00:00 to avoid timezone issues
  // new Date("2026-01-20") parses as UTC midnight, which shows as previous day in timezones behind UTC
  const localDate = new Date(date + "T12:00:00")

  return (
    <div className="bg-black text-white border border-zinc-800 rounded-md px-2 py-1.5 shadow-md text-[11px] whitespace-nowrap">
      <p className="text-zinc-400">
        {format(localDate, "MMM d, yyyy")}
      </p>
      <p className="font-medium text-amber-400">{formatPercent(q4w)} Q4W</p>
    </div>
  )
}

export function Q4wSparkline({
  poolId,
  currentQ4w,
  className = "",
}: Q4wSparklineProps) {
  // Track if component has mounted (client-side)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const { data: q4wHistory, isLoading } = useQuery({
    queryKey: ["backstop-q4w-history", poolId],
    queryFn: () => fetchQ4wHistory(poolId),
    staleTime: 60 * 60 * 1000, // 1 hour
    refetchInterval: false,
  })

  // Compute today's date only on the client (after mount)
  // This ensures we use the user's actual local date, not the server's date
  const today = mounted ? getLocalToday() : null

  // Filter out future dates and use SDK value for today
  const chartData = useMemo(() => {
    if (!q4wHistory?.length) return []

    // During SSR (today is null), just return the raw history
    if (!today) return q4wHistory

    // Filter out any dates that are "in the future" from user's timezone perspective
    const filteredHistory = q4wHistory.filter(d => d.date <= today)

    if (!filteredHistory.length) return []
    if (currentQ4w === undefined) return filteredHistory

    const data = [...filteredHistory]

    // Use SDK Q4W for today's data point
    const todayIndex = data.findIndex(d => d.date === today)
    if (todayIndex !== -1) {
      // Replace today's value with SDK
      data[todayIndex] = {
        ...data[todayIndex],
        q4wPercent: currentQ4w,
      }
    } else {
      // Add today with SDK value
      data.push({
        date: today,
        q4wPercent: currentQ4w,
      })
    }

    return data
  }, [q4wHistory, currentQ4w, today])

  // Calculate 6mo average
  const { avgQ4w } = useMemo(() => {
    if (!chartData?.length) return { avgQ4w: 0 }

    const values = chartData.map((d) => d.q4wPercent)
    const sum = values.reduce((acc, val) => acc + val, 0)
    const avg = sum / values.length

    return { avgQ4w: avg }
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
              dataKey="q4wPercent"
              stroke="#f59e0b"
              strokeWidth={1}
              dot={false}
              activeDot={{
                r: 2,
                fill: "#f59e0b",
                stroke: "#f59e0b",
              }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="shrink-0 text-right">
        {currentQ4w !== undefined && (
          <p className="text-sm font-semibold text-amber-400 mb-1">{formatPercent(currentQ4w)}</p>
        )}
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">6mo avg</p>
        <p className="text-xs text-foreground">{formatPercent(avgQ4w)}</p>
      </div>
    </div>
  )
}
