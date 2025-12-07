"use client"

import { useState, useMemo } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
  Tooltip,
  Customized,
} from "recharts"
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  CheckCircle,
  Gift,
  AlertTriangle,
  Circle,
} from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import type { ChartDataPoint, TimePeriod, BarChartDataPoint, BarChartEvent } from "@/types/balance-history"
import type { UserAction } from "@/lib/db/types"
import {
  aggregateDataByPeriod,
  getActionColor,
  formatCurrencyCompact,
} from "@/lib/chart-utils"

interface BalanceBarChartProps {
  historyData: ChartDataPoint[]
  userActions: UserAction[]
  currentBalance: number
  apy: number
  firstEventDate: string | null
  isLoading?: boolean
}

const TIME_PERIODS: { value: TimePeriod; label: string }[] = [
  { value: "1W", label: "1W" },
  { value: "1M", label: "1M" },
  { value: "1Y", label: "1Y" },
  { value: "All", label: "All" },
  { value: "Projection", label: "Projection" },
]

// Icon components for events
const EventIcons: Record<string, React.ComponentType<{ className?: string; color?: string }>> = {
  supply: ArrowDownCircle,
  supply_collateral: ArrowDownCircle,
  withdraw: ArrowUpCircle,
  withdraw_collateral: ArrowUpCircle,
  borrow: Banknote,
  repay: CheckCircle,
  claim: Gift,
  liquidate: AlertTriangle,
}

// Format amount with appropriate precision and symbol
// Converts raw amount using decimals (e.g., 30000000000 with 7 decimals = 3000)
function formatEventAmount(
  rawAmount: number | null,
  symbol: string | null,
  decimals: number | null
): string {
  if (rawAmount === null || rawAmount === undefined) return ''

  // Convert raw amount to human-readable using decimals
  const amount = rawAmount / Math.pow(10, decimals || 7)
  const absAmount = Math.abs(amount)
  let formatted: string

  if (absAmount >= 1000000) {
    formatted = `${(amount / 1000000).toFixed(2)}M`
  } else if (absAmount >= 1000) {
    formatted = `${(amount / 1000).toFixed(2)}K`
  } else if (absAmount >= 1) {
    formatted = amount.toFixed(2)
  } else {
    formatted = amount.toFixed(4)
  }

  return symbol ? `${formatted} ${symbol}` : formatted
}

// Custom tooltip component
function CustomTooltip({
  active,
  payload,
  period,
}: {
  active?: boolean
  payload?: any[]
  period: TimePeriod
}) {
  if (!active || !payload || !payload.length) {
    return null
  }

  const data = payload[0].payload as BarChartDataPoint
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  const yieldFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "always",
  })

  return (
    <div className="bg-background border rounded-lg shadow-lg p-3 min-w-[200px]">
      <div className="font-medium mb-2">
        {data.period}
        {data.isProjected && (
          <span className="text-xs text-muted-foreground ml-2">(Projected)</span>
        )}
      </div>

      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Balance:</span>
          <span className="font-medium">{formatter.format(data.balance)}</span>
        </div>

        {data.borrow > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Borrowed:</span>
            <span className="font-medium text-orange-600 dark:text-orange-400">
              {formatter.format(data.borrow)}
            </span>
          </div>
        )}

        <div className="flex justify-between">
          <span className="text-muted-foreground">Yield:</span>
          <span
            className={
              data.yieldEarned >= 0
                ? "font-medium text-emerald-600 dark:text-emerald-400"
                : "font-medium text-red-600 dark:text-red-400"
            }
          >
            {yieldFormatter.format(data.yieldEarned)}
          </span>
        </div>

        {data.events.length > 0 && (
          <div className="pt-2 border-t mt-2">
            <div className="text-xs text-muted-foreground mb-1">Events:</div>
            <div className="space-y-1">
              {data.events.slice(0, 5).map((event, idx) => {
                const IconComponent = EventIcons[event.type] || Circle
                return (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <IconComponent
                      className="h-3 w-3"
                      color={getActionColor(event.type)}
                    />
                    <span className="capitalize">{event.type.replace("_", " ")}</span>
                    {event.amount !== null && (
                      <span className="text-muted-foreground">
                        {formatEventAmount(event.amount, event.assetSymbol, event.assetDecimals)}
                      </span>
                    )}
                  </div>
                )
              })}
              {data.events.length > 5 && (
                <div className="text-xs text-muted-foreground">
                  +{data.events.length - 5} more
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// SVG path data extracted from lucide icons (designed for 24x24 viewBox)
// These are native SVG paths that can be rendered inside Recharts
const EVENT_ICON_PATHS: Record<string, {
  paths: string[];
  circle?: boolean;
  rect?: { x: number; y: number; width: number; height: number; rx?: number };
}> = {
  // ArrowDownCircle - supply/deposit
  supply: {
    paths: ["M12 8v8", "M8 12l4 4l4-4"],
    circle: true,
  },
  supply_collateral: {
    paths: ["M12 8v8", "M8 12l4 4l4-4"],
    circle: true,
  },
  // ArrowUpCircle - withdraw
  withdraw: {
    paths: ["M16 12l-4-4l-4 4", "M12 16V8"],
    circle: true,
  },
  withdraw_collateral: {
    paths: ["M16 12l-4-4l-4 4", "M12 16V8"],
    circle: true,
  },
  // Banknote - borrow (simplified rectangle with dots)
  borrow: {
    paths: ["M2 6h20v12H2z", "M6 12h.01", "M18 12h.01", "M12 12a2 2 0 1 0 0-0.01"],
  },
  // CheckCircle - repay
  repay: {
    paths: ["M21.801 10A10 10 0 1 1 17 3.335", "M9 11l3 3L22 4"],
  },
  // Gift - claim (with ribbon bow at top)
  claim: {
    paths: [
      "M12 8v13",
      "M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7",
      "M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5",
    ],
    rect: { x: 3, y: 8, width: 18, height: 4, rx: 1 },
  },
  // AlertTriangle - liquidate
  liquidate: {
    paths: ["M21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01"],
  },
}

// Custom event markers renderer for Recharts Customized component
// Renders native SVG icon paths extracted from lucide icons
function renderEventMarkers(props: any) {
  const { xAxisMap, yAxisMap, offset } = props

  if (!xAxisMap || !yAxisMap) return null

  const xAxis = xAxisMap[0]
  const yAxis = yAxisMap[0]

  if (!xAxis || !yAxis || !xAxis.scale) return null

  const data = props.formattedGraphicalItems?.[0]?.props?.data as BarChartDataPoint[] | undefined
  if (!data) return null

  const bandwidth = xAxis.scale.bandwidth ? xAxis.scale.bandwidth() : 20
  const yBottom = offset?.top + yAxis.height

  // Icon size (will scale from 24x24 viewBox)
  const iconSize = 20

  return (
    <g className="event-markers">
      {data.map((bar, idx) => {
        if (bar.events.length === 0) return null

        const x = xAxis.scale(bar.period)
        if (x === undefined) return null

        // Center of the bar
        const barCenterX = x + bandwidth / 2
        const markerY = yBottom + 12

        // Get unique event types for this bar
        const uniqueTypes = [...new Set(bar.events.map((e) => e.type))]
        const displayEvents = uniqueTypes.slice(0, 3)

        return (
          <g key={idx}>
            {displayEvents.map((type, eventIdx) => {
              const color = getActionColor(type)
              const offsetX = (eventIdx - (displayEvents.length - 1) / 2) * (iconSize + 4)
              const iconData = EVENT_ICON_PATHS[type]

              // Center position for this icon
              const iconX = barCenterX + offsetX - iconSize / 2
              const iconY = markerY - iconSize / 2

              if (!iconData) {
                // Fallback to circle if no icon data
                return (
                  <circle
                    key={eventIdx}
                    cx={barCenterX + offsetX}
                    cy={markerY}
                    r={5}
                    fill={color}
                  />
                )
              }

              return (
                <g
                  key={eventIdx}
                  transform={`translate(${iconX}, ${iconY}) scale(${iconSize / 24})`}
                >
                  {/* Background circle for circle-based icons */}
                  {iconData.circle && (
                    <circle
                      cx={12}
                      cy={12}
                      r={10}
                      fill="none"
                      stroke={color}
                      strokeWidth={2}
                    />
                  )}
                  {/* Rect element (for gift icon box) */}
                  {iconData.rect && (
                    <rect
                      x={iconData.rect.x}
                      y={iconData.rect.y}
                      width={iconData.rect.width}
                      height={iconData.rect.height}
                      rx={iconData.rect.rx}
                      fill="none"
                      stroke={color}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  {/* Icon paths */}
                  {iconData.paths.map((d, pathIdx) => (
                    <path
                      key={pathIdx}
                      d={d}
                      fill="none"
                      stroke={color}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                </g>
              )
            })}
            {uniqueTypes.length > 3 && (
              <text
                x={barCenterX + ((displayEvents.length - 1) / 2) * (iconSize + 4) + iconSize / 2 + 4}
                y={markerY}
                textAnchor="start"
                dominantBaseline="central"
                fontSize={8}
                fill="currentColor"
                opacity={0.6}
              >
                +{uniqueTypes.length - 3}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

export function BalanceBarChart({
  historyData,
  userActions,
  currentBalance,
  apy,
  firstEventDate,
  isLoading = false,
}: BalanceBarChartProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("1M")

  // Calculate current borrow from history data
  const currentBorrow = useMemo(() => {
    if (historyData.length === 0) return 0
    const latestData = historyData[historyData.length - 1]
    return latestData.borrow || 0
  }, [historyData])

  // Aggregate data based on selected period
  const chartData = useMemo(() => {
    return aggregateDataByPeriod(
      historyData,
      userActions,
      selectedPeriod,
      currentBalance,
      apy,
      firstEventDate,
      currentBorrow
    )
  }, [historyData, userActions, selectedPeriod, currentBalance, apy, firstEventDate, currentBorrow])

  // Calculate max value for Y axis (include balance + borrow for proper scaling)
  const maxBalance = useMemo(() => {
    return Math.max(...chartData.map((d) => d.balance + d.borrow), 1)
  }, [chartData])

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="aspect-[3/1] w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Bar chart */}
      {chartData.length === 0 ? (
        <div className="aspect-[3/1] flex items-center justify-center text-muted-foreground">
          No data available for this period
        </div>
      ) : (
        <div className="aspect-[3/1] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 5, right: 0, left: 0, bottom: 20 }}
            >
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={1} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0.6} />
                </linearGradient>
                <linearGradient id="projectedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0.25} />
                </linearGradient>
                <linearGradient id="borrowGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={1} />
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0.6} />
                </linearGradient>
                <linearGradient id="borrowProjectedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0.25} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />

              <XAxis dataKey="period" hide />
              <YAxis hide domain={[0, maxBalance * 1.1]} />

              <Tooltip
                content={<CustomTooltip period={selectedPeriod} />}
                cursor={false}
              />

              <Bar
                dataKey="balance"
                radius={[4, 4, 0, 0]}
                maxBarSize={selectedPeriod === "1M" ? 16 : 40}
                activeBar={{ fill: "#16a34a", stroke: "#15803d", strokeWidth: 2 }}
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.isProjected ? "url(#projectedGradient)" : "url(#barGradient)"}
                  />
                ))}
              </Bar>

              <Bar
                dataKey="borrow"
                radius={[4, 4, 0, 0]}
                maxBarSize={selectedPeriod === "1M" ? 16 : 40}
                activeBar={{ fill: "#ea580c", stroke: "#c2410c", strokeWidth: 2 }}
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-borrow-${index}`}
                    fill={entry.isProjected ? "url(#borrowProjectedGradient)" : "url(#borrowGradient)"}
                  />
                ))}
              </Bar>

              {/* Event markers below bars */}
              {selectedPeriod !== "Projection" && (
                <Customized component={renderEventMarkers} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Time period tabs - centered below chart */}
      <div className="flex justify-center">
        <Tabs
          value={selectedPeriod}
          onValueChange={(v) => setSelectedPeriod(v as TimePeriod)}
        >
          <TabsList>
            {TIME_PERIODS.map((period) => (
              <TabsTrigger key={period.value} value={period.value}>
                {period.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
    </div>
  )
}
