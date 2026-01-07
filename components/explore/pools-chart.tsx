"use client"

import { useMemo } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import { ArrowUpRight, ArrowDownLeft } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { PoolLogo } from "@/components/pool-logo"
import { useTooltipDismiss } from "@/hooks/use-tooltip-dismiss"
import type { PoolExploreItem } from "@/types/explore"

interface PoolsChartProps {
  items: PoolExploreItem[]
  isLoading: boolean
}

function formatUsdCompact(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`
  }
  return `$${value.toFixed(0)}`
}

interface ChartDataPoint {
  name: string
  poolName: string
  poolId: string
  supply: number
  borrow: number
  total: number
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: any[]
}) {
  if (!active || !payload || !payload.length) {
    return null
  }

  const data = payload[0].payload as ChartDataPoint

  return (
    <div className="bg-black text-white border border-zinc-800 rounded-md shadow-lg p-2.5 min-w-[140px] select-none z-50">
      <div className="font-medium text-[11px] mb-1.5">{data.poolName}</div>
      <div className="space-y-1 text-[11px]">
        <div className="flex justify-between gap-4">
          <span className="text-zinc-400">Supply TVL:</span>
          <span className="font-medium text-emerald-400">
            {formatUsdCompact(data.supply)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-400">Borrow TVL:</span>
          <span className="font-medium text-orange-400">
            {formatUsdCompact(data.borrow)}
          </span>
        </div>
        <div className="flex justify-between pt-1 border-t border-zinc-700 gap-4">
          <span className="text-zinc-300 font-medium">Total:</span>
          <span className="font-medium text-white">
            {formatUsdCompact(data.total)}
          </span>
        </div>
      </div>
    </div>
  )
}

export function PoolsChart({ items, isLoading }: PoolsChartProps) {
  const { containerRef, shouldRenderTooltip } = useTooltipDismiss()

  const chartData = useMemo(() => {
    // Sort by total TVL and take top 5
    const sorted = [...items].sort((a, b) => b.totalTvl - a.totalTvl)
    const top5 = sorted.slice(0, 5)

    return top5.map((item) => ({
      name: item.poolId,
      poolName: item.poolName,
      poolId: item.poolId,
      supply: item.totalTvl,
      borrow: item.totalBorrowed,
      total: item.totalTvl + item.totalBorrowed,
    }))
  }, [items])

  const maxValue = useMemo(() => {
    if (chartData.length === 0) return 100
    // Max of any individual bar (supply or borrow), not total
    const maxSupply = Math.max(...chartData.map((d) => d.supply), 0)
    const maxBorrow = Math.max(...chartData.map((d) => d.borrow), 0)
    return Math.max(maxSupply, maxBorrow, 1) * 1.1
  }, [chartData])

  if (isLoading) {
    return (
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">Pools by TVL</h2>
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (chartData.length === 0) {
    return null
  }

  return (
    <div ref={containerRef} className="mb-6">
      <h2 className="text-lg font-semibold mb-3">Pools by TVL</h2>
      {/* Value labels row */}
      <div className="flex px-4">
        {chartData.map((item) => (
          <div key={item.name} className="flex-1 flex flex-col items-center">
            <div className="flex items-center gap-0.5">
              <ArrowUpRight className="h-2.5 w-2.5 text-green-500" />
              <span className="text-[10px] font-semibold">
                {formatUsdCompact(item.supply)}
              </span>
            </div>
            <div className="flex items-center gap-0.5">
              <ArrowDownLeft className="h-2.5 w-2.5 text-orange-500" />
              <span className="text-[10px] font-semibold">
                {formatUsdCompact(item.borrow)}
              </span>
            </div>
          </div>
        ))}
      </div>
      {/* Bar chart */}
      <div className="h-24 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 4, right: 16, left: 16, bottom: 4 }}
            barCategoryGap="20%"
          >
            <defs>
              <linearGradient id="poolSupplyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(142 76% 46%)" stopOpacity={1} />
                <stop offset="100%" stopColor="hsl(142 70% 38%)" stopOpacity={0.8} />
              </linearGradient>
              <linearGradient id="poolBorrowGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(25 95% 53%)" stopOpacity={1} />
                <stop offset="100%" stopColor="hsl(25 90% 45%)" stopOpacity={0.8} />
              </linearGradient>
            </defs>

            <XAxis dataKey="name" hide />
            <YAxis hide domain={[0, maxValue]} />

            <Bar
              dataKey="supply"
              fill="url(#poolSupplyGradient)"
              radius={[4, 4, 4, 4]}
              maxBarSize={24}
              isAnimationActive={false}
            />
            <Bar
              dataKey="borrow"
              fill="url(#poolBorrowGradient)"
              radius={[4, 4, 4, 4]}
              maxBarSize={24}
              isAnimationActive={false}
            />

            {shouldRenderTooltip && (
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: "transparent" }}
                wrapperStyle={{ zIndex: 50 }}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Pool icons row */}
      <div className="flex mt-2 px-4">
        {chartData.map((item) => (
          <div key={item.name} className="flex-1 flex flex-col items-center">
            <PoolLogo poolName={item.poolName} size={32} />
            <span className="text-[10px] font-medium mt-1 truncate max-w-[60px] text-center">
              {item.poolName}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
