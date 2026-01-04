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
import { Skeleton } from "@/components/ui/skeleton"
import { TokenLogo } from "@/components/token-logo"
import type { SupplyExploreItem, SortBy } from "@/types/explore"

interface TopTokensChartProps {
  items: SupplyExploreItem[]
  isLoading: boolean
  sortBy: SortBy
}

const ASSET_LOGO_MAP: Record<string, string> = {
  USDC: "/tokens/usdc.png",
  USDT: "/tokens/usdc.png",
  XLM: "/tokens/xlm.png",
  AQUA: "/tokens/aqua.png",
  EURC: "/tokens/eurc.png",
  CETES: "/tokens/cetes.png",
  USDGLO: "/tokens/usdglo.png",
  USTRY: "/tokens/ustry.png",
  BLND: "/tokens/blnd.png",
}

function resolveAssetLogo(symbol: string): string {
  const normalized = symbol.toUpperCase()
  return ASSET_LOGO_MAP[normalized] ?? `/tokens/${symbol.toLowerCase()}.png`
}

function getTotalApy(item: SupplyExploreItem): number {
  return (item.supplyApy ?? 0) + (item.blndApy ?? 0)
}

function formatPercentage(value: number): string {
  const firstDecimal = Math.floor((value * 10) % 10)
  const secondDecimal = Math.floor((value * 100) % 10)
  if (firstDecimal === 0 && secondDecimal === 0) return value.toFixed(0)
  if (firstDecimal === 0) return value.toFixed(2)
  return value.toFixed(1)
}

function sortItems(items: SupplyExploreItem[], sortBy: SortBy): SupplyExploreItem[] {
  return [...items].sort((a, b) => {
    switch (sortBy) {
      case "apy":
        return (b.supplyApy ?? 0) - (a.supplyApy ?? 0)
      case "blnd":
        return (b.blndApy ?? 0) - (a.blndApy ?? 0)
      case "total":
      default:
        return getTotalApy(b) - getTotalApy(a)
    }
  })
}

interface ChartDataPoint {
  name: string
  symbol: string
  poolName: string
  logoUrl: string
  apy: number
  blnd: number
  total: number
}

// Custom shape for APY bar - full rounded corners when no BLND, bottom only when BLND exists
function ApyBarShape(props: any) {
  const { x, y, width, height, payload } = props
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
        {data.symbol}
        <span className="text-zinc-400 ml-1 font-normal">({data.poolName})</span>
      </div>
      <div className="space-y-1 text-[11px]">
        <div className="flex justify-between">
          <span className="text-zinc-400">APY:</span>
          <span className="font-medium text-emerald-400">{data.apy.toFixed(2)}%</span>
        </div>
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

export function TopTokensChart({ items, isLoading, sortBy }: TopTokensChartProps) {
  const chartData = useMemo(() => {
    const sorted = sortItems(items, sortBy)
    const top5 = sorted.slice(0, 5)

    return top5.map((item) => ({
      name: `${item.tokenSymbol}-${item.poolName}`,
      symbol: item.tokenSymbol,
      poolName: item.poolName,
      logoUrl: resolveAssetLogo(item.tokenSymbol),
      apy: item.supplyApy ?? 0,
      blnd: item.blndApy ?? 0,
      total: getTotalApy(item),
    }))
  }, [items, sortBy])

  const maxValue = useMemo(() => {
    if (chartData.length === 0) return 10
    const getValue = (d: ChartDataPoint) =>
      sortBy === "apy" ? d.apy : sortBy === "blnd" ? d.blnd : d.total
    return Math.max(...chartData.map(getValue), 1) * 1.1
  }, [chartData, sortBy])

  if (isLoading) {
    return (
      <div>
        <h2 className="text-lg font-semibold mb-3">Top Pools</h2>
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (chartData.length === 0) {
    return null
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Top Pools</h2>
      {/* Percentage labels row */}
      <div className="flex px-4">
        {chartData.map((item) => {
          const displayValue = sortBy === "apy" ? item.apy : sortBy === "blnd" ? item.blnd : item.total
          return (
            <div key={item.name} className="flex-1 text-center">
              <span className="text-xs font-semibold">{formatPercentage(displayValue)}%</span>
            </div>
          )
        })}
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
              <linearGradient id="supplyApyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(142 76% 46%)" stopOpacity={1} />
                <stop offset="100%" stopColor="hsl(142 70% 38%)" stopOpacity={0.8} />
              </linearGradient>
              <linearGradient id="supplyBlndGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(270 70% 60%)" stopOpacity={1} />
                <stop offset="100%" stopColor="hsl(270 65% 50%)" stopOpacity={0.8} />
              </linearGradient>
            </defs>

            <XAxis dataKey="name" hide />
            <YAxis hide domain={[0, maxValue]} />

            {(sortBy === "total" || sortBy === "apy") && (
              <Bar
                dataKey="apy"
                stackId={sortBy === "total" ? "stack" : undefined}
                fill="url(#supplyApyGradient)"
                shape={sortBy === "total" ? ApyBarShape : undefined}
                radius={sortBy === "apy" ? [4, 4, 4, 4] : undefined}
                maxBarSize={48}
                isAnimationActive={false}
              />
            )}
            {(sortBy === "total" || sortBy === "blnd") && (
              <Bar
                dataKey="blnd"
                stackId={sortBy === "total" ? "stack" : undefined}
                fill="url(#supplyBlndGradient)"
                shape={sortBy === "total" ? BlndBarShape : undefined}
                radius={sortBy === "blnd" ? [4, 4, 4, 4] : undefined}
                maxBarSize={48}
                isAnimationActive={false}
              />
            )}

            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "transparent" }}
              wrapperStyle={{ zIndex: 50 }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Token icons row */}
      <div className="flex mt-2 px-4">
        {chartData.map((item) => (
          <div key={item.name} className="flex-1 flex flex-col items-center">
            <TokenLogo
              src={item.logoUrl}
              symbol={item.symbol}
              size={32}
            />
            <span className="text-[10px] font-medium mt-1 truncate max-w-[60px] text-center">
              {item.symbol}
            </span>
            <span className="text-[9px] text-muted-foreground truncate max-w-[60px] text-center">
              {item.poolName}
            </span>
          </div>
        ))}
      </div>

    </div>
  )
}
