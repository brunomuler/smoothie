"use client"

import { memo, useMemo } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  ReferenceLine,
  LabelList,
} from "recharts"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { useCurrencyPreference } from "@/hooks/use-currency-preference"
import type { FormatCurrencyOptions } from "@/lib/currency/format"
import type { PnlChangeDataPoint, PnlPeriodType } from "@/hooks/use-pnl-change-chart"

interface PnlChangeChartProps {
  data: PnlChangeDataPoint[] | undefined
  period: PnlPeriodType
  onPeriodChange: (period: PnlPeriodType) => void
  showPriceChanges: boolean
  isLoading?: boolean
}

const TIME_PERIODS: { value: PnlPeriodType; label: string }[] = [
  { value: "1W", label: "1W" },
  { value: "1M", label: "1M" },
  // 6M temporarily disabled - historical emission APY data only available for ~30 days
  // { value: "6M", label: "6M" },
]

// Compact currency formatter for bar labels
function formatCompact(value: number): string {
  if (value === 0) return ""
  const absValue = Math.abs(value)
  const sign = value >= 0 ? "+" : "-"
  if (absValue >= 1000000) {
    return `${sign}$${(absValue / 1000000).toFixed(1)}M`
  }
  if (absValue >= 1000) {
    return `${sign}$${(absValue / 1000).toFixed(1)}K`
  }
  return `${sign}$${absValue.toFixed(0)}`
}

// Custom bar shape that applies rounding based on position in stack
function RoundedBar(props: any) {
  const { x, y, width, height, fill, dataKey, payload } = props
  if (!height || height === 0) return null

  const topRadius = 4
  const bottomRadius = 2

  // Determine if this bar is the topmost positive bar
  const isTopBar = payload?.topPositiveBar === dataKey
  // Determine if this bar is the bottom bar (supplyApyBar)
  const isBottomBar = dataKey === 'supplyApyBar'

  // Build the path with conditional rounding
  const tl = isTopBar ? topRadius : 0
  const tr = isTopBar ? topRadius : 0
  const br = isBottomBar ? bottomRadius : 0
  const bl = isBottomBar ? bottomRadius : 0

  const path = `
    M ${x + tl} ${y}
    L ${x + width - tr} ${y}
    Q ${x + width} ${y} ${x + width} ${y + tr}
    L ${x + width} ${y + height - br}
    Q ${x + width} ${y + height} ${x + width - br} ${y + height}
    L ${x + bl} ${y + height}
    Q ${x} ${y + height} ${x} ${y + height - bl}
    L ${x} ${y + tl}
    Q ${x} ${y} ${x + tl} ${y}
    Z
  `

  return <path d={path} fill={fill} />
}

// Transform data for yield chart (without price changes)
function transformDataForYieldChart(
  data: PnlChangeDataPoint[]
): Array<{
  period: string
  supplyApyBar: number
  supplyBlndApyBar: number
  backstopYieldPositiveBar: number
  backstopBlndApyBar: number
  backstopYieldNegativeBar: number
  supplyApy: number
  supplyBlndApy: number
  backstopYield: number
  backstopBlndApy: number
  priceChange: number
  isLive: boolean
  yieldTotal: number
  topPositiveBar: string | null
}> {
  return data.map(d => {
    const yieldTotal = d.supplyApy + d.supplyBlndApy + d.backstopYield + d.backstopBlndApy

    // Determine which bar is the topmost positive bar (stacking order: supplyApy -> supplyBlndApy -> backstopYield -> backstopBlndApy)
    let topPositiveBar: string | null = null
    if (d.backstopBlndApy > 0) topPositiveBar = 'backstopBlndApyBar'
    else if (d.backstopYield > 0) topPositiveBar = 'backstopYieldPositiveBar'
    else if (d.supplyBlndApy > 0) topPositiveBar = 'supplyBlndApyBar'
    else if (d.supplyApy > 0) topPositiveBar = 'supplyApyBar'

    return {
      period: d.period,
      supplyApyBar: Math.max(0, d.supplyApy),
      supplyBlndApyBar: Math.max(0, d.supplyBlndApy),
      backstopYieldPositiveBar: Math.max(0, d.backstopYield),
      backstopBlndApyBar: Math.max(0, d.backstopBlndApy),
      backstopYieldNegativeBar: d.backstopYield < 0 ? d.backstopYield : 0,
      supplyApy: d.supplyApy,
      supplyBlndApy: d.supplyBlndApy,
      backstopYield: d.backstopYield,
      backstopBlndApy: d.backstopBlndApy,
      priceChange: d.priceChange,
      isLive: d.isLive,
      yieldTotal,
      topPositiveBar,
    }
  })
}

// Transform data for price change chart
function transformDataForPriceChart(
  data: PnlChangeDataPoint[]
): Array<{
  period: string
  priceChangePositive: number
  priceChangeNegative: number
  priceChange: number
  isLive: boolean
}> {
  return data.map(d => ({
    period: d.period,
    priceChangePositive: d.priceChange > 0 ? d.priceChange : 0,
    priceChangeNegative: d.priceChange < 0 ? d.priceChange : 0,
    priceChange: d.priceChange,
    isLive: d.isLive,
  }))
}

// Custom tooltip for yield chart
function YieldTooltip({
  active,
  payload,
  formatCurrency,
}: {
  active?: boolean
  payload?: any[]
  formatCurrency: (amount: number, options?: FormatCurrencyOptions) => string
}) {
  if (!active || !payload || !payload.length) {
    return null
  }

  const data = payload[0].payload
  const formatValue = (value: number) =>
    formatCurrency(value, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      showSign: true,
    })

  const hasAnyValue =
    data.supplyApy !== 0 ||
    data.supplyBlndApy !== 0 ||
    data.backstopYield !== 0 ||
    data.backstopBlndApy !== 0

  return (
    <div className="bg-black text-white border border-zinc-800 rounded-md shadow-lg p-2.5 min-w-[160px] max-w-[220px] select-none z-50">
      <div className="font-medium text-[11px] mb-1.5 flex items-center gap-2">
        {data.period}
        {data.isLive && (
          <span className="text-[9px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">
            Live
          </span>
        )}
      </div>

      {!hasAnyValue ? (
        <div className="text-[11px] text-zinc-400">No yield in this period</div>
      ) : (
        <div className="space-y-1 text-[11px]">
          {data.supplyApy !== 0 && (
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm bg-blue-500" />
                <span className="text-zinc-400">Supply APY</span>
              </div>
              <span className="tabular-nums text-blue-400">
                {formatValue(data.supplyApy)}
              </span>
            </div>
          )}

          {data.supplyBlndApy !== 0 && (
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm bg-sky-500" />
                <span className="text-zinc-400">Supply BLND</span>
              </div>
              <span className="tabular-nums text-sky-400">
                {formatValue(data.supplyBlndApy)}
              </span>
            </div>
          )}

          {data.backstopYield !== 0 && (
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-sm ${data.backstopYield >= 0 ? "bg-violet-500" : "bg-red-500"}`} />
                <span className="text-zinc-400">Backstop Yield</span>
              </div>
              <span className={`tabular-nums ${data.backstopYield >= 0 ? "text-violet-400" : "text-red-400"}`}>
                {formatValue(data.backstopYield)}
              </span>
            </div>
          )}

          {data.backstopBlndApy !== 0 && (
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm bg-purple-400" />
                <span className="text-zinc-400">Backstop BLND</span>
              </div>
              <span className="tabular-nums text-purple-400">
                {formatValue(data.backstopBlndApy)}
              </span>
            </div>
          )}

          <div className="pt-1.5 mt-1.5 border-t border-zinc-700 flex justify-between items-center">
            <span className="text-zinc-300 font-medium">Total Yield</span>
            <span
              className={`tabular-nums font-medium ${
                data.yieldTotal >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {formatValue(data.yieldTotal)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// Custom tooltip for price change chart
function PriceChangeTooltip({
  active,
  payload,
  formatCurrency,
}: {
  active?: boolean
  payload?: any[]
  formatCurrency: (amount: number, options?: FormatCurrencyOptions) => string
}) {
  if (!active || !payload || !payload.length) {
    return null
  }

  const data = payload[0].payload
  const formatValue = (value: number) =>
    formatCurrency(value, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      showSign: true,
    })

  return (
    <div className="bg-black text-white border border-zinc-800 rounded-md shadow-lg p-2.5 min-w-[140px] select-none z-50">
      <div className="font-medium text-[11px] mb-1.5 flex items-center gap-2">
        {data.period}
        {data.isLive && (
          <span className="text-[9px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">
            Live
          </span>
        )}
      </div>

      <div className="flex justify-between items-center text-[11px]">
        <div className="flex items-center gap-1.5">
          <div
            className={`w-2 h-2 rounded-sm ${
              data.priceChange >= 0 ? "bg-emerald-500" : "bg-red-500"
            }`}
          />
          <span className="text-zinc-400">Price Change</span>
        </div>
        <span
          className={`tabular-nums font-medium ${
            data.priceChange >= 0 ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {formatValue(data.priceChange)}
        </span>
      </div>
    </div>
  )
}

export const PnlChangeChart = memo(function PnlChangeChart({
  data,
  period,
  onPeriodChange,
  showPriceChanges,
  isLoading = false,
}: PnlChangeChartProps) {
  const { format: formatCurrency } = useCurrencyPreference()

  // Transform data for both charts
  const yieldChartData = useMemo(() => {
    if (!data) return []
    return transformDataForYieldChart(data)
  }, [data])

  const priceChartData = useMemo(() => {
    if (!data) return []
    return transformDataForPriceChart(data)
  }, [data])

  // Calculate Y axis domain for yield chart
  const yieldDomain = useMemo(() => {
    if (yieldChartData.length === 0) return { min: 0, max: 1 }

    let min = 0
    let max = 0

    yieldChartData.forEach(d => {
      const positiveSum = d.supplyApyBar + d.supplyBlndApyBar + d.backstopYieldPositiveBar + d.backstopBlndApyBar
      const negativeSum = d.backstopYieldNegativeBar

      max = Math.max(max, positiveSum)
      min = Math.min(min, negativeSum)
    })

    const padding = Math.max(Math.abs(max), Math.abs(min)) * 0.1
    return { min: min - padding, max: max + padding }
  }, [yieldChartData])

  // Calculate Y axis domain for price chart
  const priceDomain = useMemo(() => {
    if (priceChartData.length === 0) return { min: 0, max: 1 }

    let min = 0
    let max = 0

    priceChartData.forEach(d => {
      max = Math.max(max, d.priceChangePositive)
      min = Math.min(min, d.priceChangeNegative)
    })

    const padding = Math.max(Math.abs(max), Math.abs(min)) * 0.1
    return { min: min - padding, max: max + padding }
  }, [priceChartData])

  if (isLoading || !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="aspect-[3/1] md:aspect-[4/1] w-full" />
        <Skeleton className="aspect-[5/1] md:aspect-[6/1] w-full" />
        <div className="flex justify-center">
          <Skeleton className="h-9 sm:h-10 w-40 rounded-md" />
        </div>
      </div>
    )
  }

  const hasYieldData = yieldChartData.some(
    d =>
      d.supplyApyBar !== 0 ||
      d.supplyBlndApyBar !== 0 ||
      d.backstopYieldPositiveBar !== 0 ||
      d.backstopYieldNegativeBar !== 0 ||
      d.backstopBlndApyBar !== 0
  )

  const hasPriceData = priceChartData.some(
    d => d.priceChangePositive !== 0 || d.priceChangeNegative !== 0
  )

  const barSize = period === "1M" ? 25 : period === "1W" ? 40 : 60
  const barGap = yieldChartData.length <= 7 ? "20%" : yieldChartData.length <= 14 ? "10%" : "5%"

  return (
    <div className="space-y-3">
      {/* Yield Chart */}
      {!hasYieldData ? (
        <div className="aspect-[3/1] md:aspect-[4/1] flex items-center justify-center text-muted-foreground text-sm">
          No yield data for this period
        </div>
      ) : (
        <div className="space-y-1">
          <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide px-1">
            Yield Earnings
          </div>
          <div className="aspect-[3/1] md:aspect-[4/1] w-full select-none">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={yieldChartData}
                margin={{ top: 20, right: 10, left: 10, bottom: 5 }}
                stackOffset="sign"
                barCategoryGap={barGap}
              >
                <defs>
                  <linearGradient id="supplyApyGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(217 91% 60%)" stopOpacity={1} />
                    <stop offset="100%" stopColor="hsl(217 91% 55%)" stopOpacity={0.8} />
                  </linearGradient>
                  <linearGradient id="supplyBlndGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(199 89% 48%)" stopOpacity={1} />
                    <stop offset="100%" stopColor="hsl(199 89% 43%)" stopOpacity={0.8} />
                  </linearGradient>
                  <linearGradient id="backstopYieldGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(263 70% 57%)" stopOpacity={1} />
                    <stop offset="100%" stopColor="hsl(263 70% 52%)" stopOpacity={0.8} />
                  </linearGradient>
                  <linearGradient id="backstopBlndGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(271 81% 66%)" stopOpacity={1} />
                    <stop offset="100%" stopColor="hsl(271 81% 61%)" stopOpacity={0.8} />
                  </linearGradient>
                  <linearGradient id="negativeGradient" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="hsl(0 84% 60%)" stopOpacity={1} />
                    <stop offset="100%" stopColor="hsl(0 84% 55%)" stopOpacity={0.8} />
                  </linearGradient>
                </defs>

                <XAxis dataKey="period" hide />
                <YAxis hide domain={[yieldDomain.min, yieldDomain.max]} />
                <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />

                <Bar dataKey="supplyApyBar" stackId="yield" fill="url(#supplyApyGradient)" shape={(props: any) => <RoundedBar {...props} dataKey="supplyApyBar" />} maxBarSize={barSize} isAnimationActive={false} />
                <Bar dataKey="supplyBlndApyBar" stackId="yield" fill="url(#supplyBlndGradient)" shape={(props: any) => <RoundedBar {...props} dataKey="supplyBlndApyBar" />} maxBarSize={barSize} isAnimationActive={false} />
                <Bar dataKey="backstopYieldPositiveBar" stackId="yield" fill="url(#backstopYieldGradient)" shape={(props: any) => <RoundedBar {...props} dataKey="backstopYieldPositiveBar" />} maxBarSize={barSize} isAnimationActive={false} />
                <Bar dataKey="backstopBlndApyBar" stackId="yield" fill="url(#backstopBlndGradient)" shape={(props: any) => <RoundedBar {...props} dataKey="backstopBlndApyBar" />} maxBarSize={barSize} isAnimationActive={false}>
                  {period !== "1M" && (
                    <LabelList
                      dataKey="yieldTotal"
                      position="top"
                      formatter={(value: number) => value > 0 ? formatCompact(value) : ""}
                      style={{ fontSize: 9, fill: "white", fontWeight: 500 }}
                    />
                  )}
                </Bar>
                <Bar dataKey="backstopYieldNegativeBar" stackId="yield" fill="url(#negativeGradient)" radius={[0, 0, 4, 4]} maxBarSize={barSize} isAnimationActive={false}>
                  {period !== "1M" && (
                    <LabelList
                      dataKey="yieldTotal"
                      position="bottom"
                      formatter={(value: number) => value < 0 ? formatCompact(value) : ""}
                      style={{ fontSize: 9, fill: "white", fontWeight: 500 }}
                    />
                  )}
                </Bar>

                <Tooltip
                  content={<YieldTooltip formatCurrency={formatCurrency} />}
                  cursor={{ fill: "transparent" }}
                  wrapperStyle={{ zIndex: 50 }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Yield Legend */}
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-blue-500" />
              <span>Supply APY</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-sky-500" />
              <span>Supply BLND</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-violet-500" />
              <span>Backstop Yield</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-purple-400" />
              <span>Backstop BLND</span>
            </div>
          </div>
        </div>
      )}

      {/* Price Change Chart */}
      <div className="space-y-1">
          <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide px-1">
            Price Changes
          </div>
          {!hasPriceData ? (
            <div className="aspect-[5/1] md:aspect-[6/1] flex items-center justify-center text-muted-foreground text-sm">
              No price changes in this period
            </div>
          ) : (
            <div className="aspect-[5/1] md:aspect-[6/1] w-full select-none">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={priceChartData}
                  margin={{ top: 20, right: 10, left: 10, bottom: 5 }}
                  stackOffset="sign"
                  barCategoryGap={barGap}
                >
                  <defs>
                    <linearGradient id="pricePositiveGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(142 76% 46%)" stopOpacity={1} />
                      <stop offset="100%" stopColor="hsl(142 76% 40%)" stopOpacity={0.8} />
                    </linearGradient>
                    <linearGradient id="priceNegativeGradient" x1="0" y1="1" x2="0" y2="0">
                      <stop offset="0%" stopColor="hsl(0 84% 60%)" stopOpacity={1} />
                      <stop offset="100%" stopColor="hsl(0 84% 55%)" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>

                  <XAxis dataKey="period" hide />
                  <YAxis hide domain={[priceDomain.min, priceDomain.max]} />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />

                  <Bar dataKey="priceChangePositive" stackId="price" fill="url(#pricePositiveGradient)" radius={[4, 4, 2, 2]} maxBarSize={barSize} isAnimationActive={false}>
                    {period !== "1M" && (
                      <LabelList
                        dataKey="priceChange"
                        position="top"
                        formatter={(value: number) => value > 0 ? formatCompact(value) : ""}
                        style={{ fontSize: 9, fill: "white", fontWeight: 500 }}
                      />
                    )}
                  </Bar>
                  <Bar dataKey="priceChangeNegative" stackId="price" fill="url(#priceNegativeGradient)" radius={[4, 4, 2, 2]} maxBarSize={barSize} isAnimationActive={false}>
                    {period !== "1M" && (
                      <LabelList
                        dataKey="priceChange"
                        position="bottom"
                        formatter={(value: number) => value < 0 ? formatCompact(value) : ""}
                        style={{ fontSize: 9, fill: "white", fontWeight: 500 }}
                      />
                    )}
                  </Bar>

                  <Tooltip
                    content={<PriceChangeTooltip formatCurrency={formatCurrency} />}
                    cursor={{ fill: "transparent" }}
                    wrapperStyle={{ zIndex: 50 }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
      </div>

      {/* Time period tabs */}
      <div className="flex justify-center pt-1">
        <Tabs value={period} onValueChange={v => onPeriodChange(v as PnlPeriodType)}>
          <TabsList className="h-9 sm:h-10 bg-transparent gap-2">
            {TIME_PERIODS.map(p => (
              <TabsTrigger
                key={p.value}
                value={p.value}
                className="text-xs sm:text-sm px-3 sm:px-4"
              >
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
    </div>
  )
})
