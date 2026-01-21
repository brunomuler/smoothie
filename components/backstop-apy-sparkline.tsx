"use client"

import { useQuery } from "@tanstack/react-query"
import { fetchWithTimeout } from "@/lib/fetch-utils"
import { formatPercent } from "@/lib/format-utils"
import { BaseSparkline } from "@/components/charts/sparkline/base-sparkline"
import type { SparklineConfig } from "@/components/charts/sparkline/types"

interface ApyDataPoint {
  date: string
  apy: number
}

interface BackstopApySparklineProps {
  poolId: string
  currentApy?: number // SDK APY to use for latest day
  className?: string
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

const BACKSTOP_APY_CONFIG: SparklineConfig = {
  dataKey: "apy",
  color: "#34d399", // emerald-400
  label: "APR",
  formatValue: formatPercent,
  tooltipColorClass: "text-emerald-400",
  averageLabel: "6mo avg",
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

  return (
    <BaseSparkline
      data={apyHistory || []}
      currentValue={currentApy}
      config={BACKSTOP_APY_CONFIG}
      className={className}
      isLoading={isLoading}
    />
  )
}
