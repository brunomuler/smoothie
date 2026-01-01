"use client"

import { useMemo } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Cell,
} from "recharts"
import { Card, CardContent } from "@/components/ui/card"
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
    return Math.max(...chartData.map((d) => d.total), 1) * 1.1
  }, [chartData])

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (chartData.length === 0) {
    return null
  }

  return (
    <Card>
      <CardContent className="pt-4 pb-2">
        {/* Token icons row */}
        <div className="flex justify-around mb-2 px-4">
          {chartData.map((item) => (
            <div key={item.name} className="flex flex-col items-center">
              <TokenLogo
                src={item.logoUrl}
                symbol={item.symbol}
                size={32}
              />
              <span className="text-[10px] text-muted-foreground mt-1 truncate max-w-[60px] text-center">
                {item.symbol}
              </span>
            </div>
          ))}
        </div>

        {/* Bar chart */}
        <div className="h-32 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 16, left: 16, bottom: 4 }}
              barCategoryGap="20%"
            >
              <defs>
                <linearGradient id="apyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(142 76% 46%)" stopOpacity={1} />
                  <stop offset="100%" stopColor="hsl(142 70% 38%)" stopOpacity={0.8} />
                </linearGradient>
                <linearGradient id="blndGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(270 70% 60%)" stopOpacity={1} />
                  <stop offset="100%" stopColor="hsl(270 65% 50%)" stopOpacity={0.8} />
                </linearGradient>
              </defs>

              <XAxis dataKey="name" hide />
              <YAxis hide domain={[0, maxValue]} />

              <Bar
                dataKey="apy"
                stackId="stack"
                fill="url(#apyGradient)"
                radius={[0, 0, 4, 4]}
                maxBarSize={48}
                isAnimationActive={false}
              />
              <Bar
                dataKey="blnd"
                stackId="stack"
                fill="url(#blndGradient)"
                radius={[4, 4, 0, 0]}
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

        {/* Legend */}
        <div className="flex justify-center gap-4 mt-2 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
            <span className="text-muted-foreground">APY</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-purple-500" />
            <span className="text-muted-foreground">BLND</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
