"use client"

import { useMemo } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Rectangle,
} from "recharts"
import { Shield } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import type { BackstopExploreItem } from "@/types/explore"

interface BackstopChartProps {
  items: BackstopExploreItem[]
  isLoading: boolean
}

interface ChartDataPoint {
  name: string
  poolName: string
  apr: number
  blnd: number
  total: number
}

// Custom shape for APR bar - full rounded corners when no BLND, bottom only when BLND exists
function AprBarShape(props: any) {
  const { payload } = props
  const hasBlnd = payload.blnd > 0
  const radius = hasBlnd ? [0, 0, 4, 4] : [4, 4, 4, 4]
  return <Rectangle {...props} radius={radius} />
}

// Custom shape for BLND bar - top rounded corners
function BlndBarShape(props: any) {
  return <Rectangle {...props} radius={[4, 4, 0, 0]} />
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
      <div className="font-medium text-[11px] mb-1.5">
        {data.poolName}
      </div>
      <div className="space-y-1 text-[11px]">
        {data.apr > 0 && (
          <div className="flex justify-between">
            <span className="text-zinc-400">APR:</span>
            <span className="font-medium text-emerald-400">{data.apr.toFixed(2)}%</span>
          </div>
        )}
        {data.blnd > 0 && (
          <div className="flex justify-between">
            <span className="text-zinc-400">BLND:</span>
            <span className="font-medium text-purple-400">{data.blnd.toFixed(2)}%</span>
          </div>
        )}
        <div className="flex justify-between pt-1 border-t border-zinc-700">
          <span className="text-zinc-300 font-medium">Total:</span>
          <span className="font-medium text-white">{data.total.toFixed(2)}%</span>
        </div>
      </div>
    </div>
  )
}

export function BackstopChart({ items, isLoading }: BackstopChartProps) {
  const chartData = useMemo(() => {
    // Sort by total APY and take top 5
    const sorted = [...items].sort((a, b) => b.totalApy - a.totalApy)
    const top5 = sorted.slice(0, 5)

    return top5.map((item) => ({
      name: item.poolId,
      poolName: item.poolName,
      apr: item.interestApr,
      blnd: item.emissionApy,
      total: item.totalApy,
    }))
  }, [items])

  const maxValue = useMemo(() => {
    if (chartData.length === 0) return 10
    return Math.max(...chartData.map((d) => d.total), 1) * 1.1
  }, [chartData])

  const hasAnyApr = useMemo(() => {
    return chartData.some((d) => d.apr > 0)
  }, [chartData])

  const hasAnyBlnd = useMemo(() => {
    return chartData.some((d) => d.blnd > 0)
  }, [chartData])

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />
  }

  if (chartData.length === 0) {
    return null
  }

  return (
    <div>
      {/* Bar chart */}
      <div className="h-32 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 16, left: 16, bottom: 4 }}
            barCategoryGap="20%"
          >
            <defs>
              <linearGradient id="backstopAprGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(142 76% 46%)" stopOpacity={1} />
                <stop offset="100%" stopColor="hsl(142 70% 38%)" stopOpacity={0.8} />
              </linearGradient>
              <linearGradient id="backstopBlndGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(270 70% 60%)" stopOpacity={1} />
                <stop offset="100%" stopColor="hsl(270 65% 50%)" stopOpacity={0.8} />
              </linearGradient>
            </defs>

            <XAxis dataKey="name" hide />
            <YAxis hide domain={[0, maxValue]} />

            <Bar
              dataKey="apr"
              stackId="stack"
              fill="url(#backstopAprGradient)"
              shape={AprBarShape}
              maxBarSize={48}
              isAnimationActive={false}
            />
            <Bar
              dataKey="blnd"
              stackId="stack"
              fill="url(#backstopBlndGradient)"
              shape={BlndBarShape}
              maxBarSize={48}
              isAnimationActive={false}
            />

            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "transparent" }}
              wrapperStyle={{ zIndex: 50 }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Pool icons row */}
      <div className="flex justify-around mt-2 px-4">
        {chartData.map((item) => (
          <div key={item.name} className="flex flex-col items-center">
            <div className="h-8 w-8 rounded-full bg-purple-500/10 flex items-center justify-center">
              <Shield className="h-4 w-4 text-purple-500" />
            </div>
            <span className="text-[10px] font-medium mt-1 truncate max-w-[60px] text-center">
              {item.poolName}
            </span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-4 mt-2 text-xs">
        {hasAnyApr && (
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
            <span className="text-muted-foreground">APR</span>
          </div>
        )}
        {hasAnyBlnd && (
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-purple-500" />
            <span className="text-muted-foreground">BLND</span>
          </div>
        )}
      </div>
    </div>
  )
}
