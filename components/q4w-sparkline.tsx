"use client"

import { useState, useEffect, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchWithTimeout } from "@/lib/fetch-utils"
import { getUserTimezone, getTodayInUserTimezone } from "@/lib/date-utils"
import { formatPercent } from "@/lib/format-utils"
import { BaseSparkline } from "@/components/charts/sparkline/base-sparkline"
import type { SparklineConfig } from "@/components/charts/sparkline/types"

interface Q4wDataPoint {
  date: string
  q4wPercent: number
}

interface Q4wSparklineProps {
  poolId: string
  currentQ4w?: number // SDK Q4W percent to use for latest day
  className?: string
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

const Q4W_SPARKLINE_CONFIG: SparklineConfig = {
  dataKey: "q4wPercent",
  color: "#f59e0b", // amber-500
  label: "Q4W",
  formatValue: formatPercent,
  tooltipColorClass: "text-amber-400",
  averageLabel: "6mo avg",
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
  const today = mounted ? getTodayInUserTimezone() : null

  // Filter data for SSR compatibility
  const filteredData = useMemo(() => {
    if (!q4wHistory?.length) return []
    // During SSR (today is null), just return the raw history
    if (!today) return q4wHistory
    return q4wHistory.filter(d => d.date <= today)
  }, [q4wHistory, today])

  return (
    <BaseSparkline
      data={filteredData}
      currentValue={currentQ4w}
      config={Q4W_SPARKLINE_CONFIG}
      className={className}
      isLoading={isLoading}
    />
  )
}
