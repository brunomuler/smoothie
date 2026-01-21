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

const APY_SPARKLINE_CONFIG: SparklineConfig = {
  dataKey: "apy",
  color: "#34d399", // emerald-400
  label: "APY",
  formatValue: formatPercent,
  tooltipColorClass: "text-emerald-400",
  averageLabel: "6mo avg",
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

  return (
    <BaseSparkline
      data={apyHistory || []}
      currentValue={currentApy}
      config={APY_SPARKLINE_CONFIG}
      className={className}
      isLoading={isLoading}
    />
  )
}
