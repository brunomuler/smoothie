"use client"

import { useQuery } from "@tanstack/react-query"
import { Flame } from "lucide-react"
import { fetchWithTimeout } from "@/lib/fetch-utils"
import { formatPercent } from "@/lib/format-utils"
import { BaseSparkline } from "@/components/charts/sparkline/base-sparkline"
import type { SparklineConfig } from "@/components/charts/sparkline/types"

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

const BLND_APY_CONFIG: SparklineConfig = {
  dataKey: "apy",
  color: "#a855f7", // purple-500
  label: "BLND APY",
  formatValue: formatPercent,
  tooltipColorClass: "text-purple-400",
  averageLabel: "30d avg",
  tooltipIcon: <Flame className="h-3 w-3" />,
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

  return (
    <BaseSparkline
      data={data?.history || []}
      currentValue={currentApy}
      config={BLND_APY_CONFIG}
      className={className}
      isLoading={isLoading}
    />
  )
}
