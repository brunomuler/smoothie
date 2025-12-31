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

interface ApySparklineProps {
  poolId: string
  assetAddress: string
  currentApy?: number // SDK APY to use for latest day
  className?: string
}

async function fetchApyHistory(
  poolId: string,
  assetAddress: string
): Promise<ApyDataPoint[]> {
  const params = new URLSearchParams({
    pool: poolId,
    asset: assetAddress,
    days: "180", // 6 months
  })

  const response = await fetchWithTimeout(`/api/apy-history?${params}`)
  if (!response.ok) {
    throw new Error("Failed to fetch APY history")
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

  return (
    <div className="bg-black text-white border border-zinc-800 rounded-md px-2 py-1.5 shadow-md text-[11px] whitespace-nowrap">
      <p className="text-zinc-400">
        {format(new Date(date), "MMM d, yyyy")}
      </p>
      <p className="font-medium text-emerald-400">{formatPercent(apy)} APY</p>
    </div>
  )
}

export function ApySparkline({
  poolId,
  assetAddress,
  currentApy,
  className = "",
}: ApySparklineProps) {
  const { data: apyHistory, isLoading } = useQuery({
    queryKey: ["apy-history", poolId, assetAddress],
    queryFn: () => fetchApyHistory(poolId, assetAddress),
    staleTime: 60 * 60 * 1000, // 1 hour
    refetchInterval: false,
  })

  // Replace the latest day's APY with the SDK APY if provided
  const chartData = useMemo(() => {
    if (!apyHistory?.length) return []
    if (currentApy === undefined) return apyHistory

    // Replace the last data point with current SDK APY
    const data = [...apyHistory]
    if (data.length > 0) {
      data[data.length - 1] = {
        ...data[data.length - 1],
        apy: currentApy,
      }
    }
    return data
  }, [apyHistory, currentApy])

  // Calculate min/max for better visualization and 6mo average
  const { minApy, maxApy, avgApy } = useMemo(() => {
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
              dataKey="apy"
              stroke="#34d399"
              strokeWidth={1.5}
              dot={false}
              activeDot={{
                r: 3,
                fill: "#34d399",
                stroke: "#34d399",
              }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="text-[10px] text-muted-foreground whitespace-nowrap">
        6mo avg:<br />{formatPercent(avgApy)}
      </div>
    </div>
  )
}
