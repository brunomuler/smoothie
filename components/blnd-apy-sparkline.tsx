"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { LineChart, Line, Tooltip, ResponsiveContainer, YAxis } from "recharts"
import { format } from "date-fns"
import { Flame } from "lucide-react"
import { fetchWithTimeout } from "@/lib/fetch-utils"

interface EmissionApyDataPoint {
  date: string
  apy: number
}

interface EmissionApyHistoryResponse {
  history: EmissionApyDataPoint[]
  avg30d: number
}

interface BlndApySparklineProps {
  poolId: string
  type: 'backstop' | 'lending_supply'
  assetAddress?: string // Required for lending_supply type
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

async function fetchEmissionApyHistory(
  poolId: string,
  type: 'backstop' | 'lending_supply',
  assetAddress?: string
): Promise<EmissionApyHistoryResponse> {
  const params = new URLSearchParams({
    pool: poolId,
    type,
    days: "30",
  })

  if (assetAddress) {
    params.set('asset', assetAddress)
  }

  const response = await fetchWithTimeout(`/api/emission-apy-history?${params}`)
  if (!response.ok) {
    throw new Error("Failed to fetch emission APY history")
  }

  return response.json()
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; payload: EmissionApyDataPoint }>
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
      <p className="font-medium text-purple-400 flex items-center gap-1">
        <Flame className="h-3 w-3" />
        {formatPercent(apy)} BLND APY
      </p>
    </div>
  )
}

export function BlndApySparkline({
  poolId,
  type,
  assetAddress,
  currentApy,
  className = "",
}: BlndApySparklineProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["emission-apy-history", poolId, type, assetAddress],
    queryFn: () => fetchEmissionApyHistory(poolId, type, assetAddress),
    staleTime: 60 * 60 * 1000, // 1 hour
    refetchInterval: false,
    enabled: type === 'backstop' || !!assetAddress,
  })

  // Compute today outside useMemo so it's fresh on every render
  const today = getTodayInTimezone()

  // Filter out future dates and replace today's APY with the SDK APY
  const chartData = useMemo(() => {
    if (!data?.history?.length) return []

    // Filter out any dates that are "in the future" from user's timezone perspective
    // This handles the case where server (UTC) is ahead of the user's timezone
    const filteredHistory = data.history.filter(d => d.date <= today)

    if (!filteredHistory.length) return []
    if (currentApy === undefined) return filteredHistory

    const history = [...filteredHistory]

    // Use SDK APY for today's data point
    const todayIndex = history.findIndex(d => d.date === today)
    if (todayIndex !== -1) {
      history[todayIndex] = {
        ...history[todayIndex],
        apy: currentApy,
      }
    } else {
      history.push({
        date: today,
        apy: currentApy,
      })
    }

    return history
  }, [data?.history, currentApy, today])

  // Calculate 30-day average (use server-provided or calculate from data)
  const avg30d = useMemo(() => {
    if (data?.avg30d !== undefined) {
      // If currentApy is provided, recalculate to include it
      if (currentApy !== undefined && chartData.length > 0) {
        const sum = chartData.reduce((acc, d) => acc + d.apy, 0)
        return sum / chartData.length
      }
      return data.avg30d
    }
    if (!chartData.length) return 0
    return chartData.reduce((acc, d) => acc + d.apy, 0) / chartData.length
  }, [data?.avg30d, chartData, currentApy])

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
              stroke="#a855f7"
              strokeWidth={1}
              dot={false}
              activeDot={{
                r: 2,
                fill: "#a855f7",
                stroke: "#a855f7",
              }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="shrink-0 text-right">
        {currentApy !== undefined && (
          <p className="text-sm font-semibold text-purple-400 mb-1">{formatPercent(currentApy)}</p>
        )}
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">30d avg</p>
        <p className="text-xs text-foreground">{formatPercent(avg30d)}</p>
      </div>
    </div>
  )
}
