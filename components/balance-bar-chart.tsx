"use client"

import { useState, useMemo, useEffect } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
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
import type { ChartDataPoint, TimePeriod, BarChartDataPoint } from "@/types/balance-history"
import type { UserAction } from "@/lib/db/types"
import {
  aggregateDataByPeriod,
  getDateRangeForPeriod,
  getActionColor,
} from "@/lib/chart-utils"

interface BalanceBarChartProps {
  historyData: ChartDataPoint[]
  userActions: UserAction[]
  currentBalance: number
  apy: number
  firstEventDate: string | null
  isLoading?: boolean
  selectedPeriod?: TimePeriod
  onPeriodChange?: (period: TimePeriod) => void
  onPeriodYieldChange?: (periodYield: number) => void
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
    <div className="bg-background border rounded-lg shadow-lg p-3 min-w-[200px] select-none">
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
// These match the icons used in transaction-history.tsx
const EVENT_ICON_PATHS: Record<string, {
  paths: string[];
  rect?: { x: number; y: number; width: number; height: number; rx?: number };
}> = {
  // ArrowDownRight - supply/deposit (green in history)
  supply: {
    paths: ["M7 7l10 10", "M17 7v10H7"],
  },
  supply_collateral: {
    paths: ["M7 7l10 10", "M17 7v10H7"],
  },
  // ArrowUpRight - withdraw (red in history)
  withdraw: {
    paths: ["M7 17L17 7", "M7 7h10v10"],
  },
  withdraw_collateral: {
    paths: ["M7 17L17 7", "M7 7h10v10"],
  },
  // ArrowUpRight - borrow (orange in history, same icon as withdraw)
  borrow: {
    paths: ["M7 17L17 7", "M7 7h10v10"],
  },
  // ArrowDownRight - repay (blue in history, same icon as supply)
  repay: {
    paths: ["M7 7l10 10", "M17 7v10H7"],
  },
  // Gift - claim (purple in history)
  claim: {
    paths: [
      "M12 8v13",
      "M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7",
      "M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5",
    ],
    rect: { x: 3, y: 8, width: 18, height: 4, rx: 1 },
  },
  // Gavel - liquidate (red in history)
  liquidate: {
    paths: [
      "m14.5 12.5-8 8a2.119 2.119 0 1 1-3-3l8-8",
      "m16 16 6-6",
      "m8 8 6-6",
      "m9 7 8 8",
      "m21 11-8-8",
    ],
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

  // Calculate number of bars to properly position icons under the first bar
  const numBars = props.formattedGraphicalItems?.length || 1

  // Detect mobile based on chart width
  const chartWidth = offset?.width || 400
  const isMobile = chartWidth < 500

  return (
    <g className="event-markers" style={{ pointerEvents: "none" }}>
      {data.map((bar, idx) => {
        if (bar.events.length === 0) return null

        const x = xAxis.scale(bar.period)
        if (x === undefined) return null

        // Center of the first bar (balance bar), accounting for multiple bars in the same category
        // For multiple bars, they're positioned side-by-side within the bandwidth
        const barIndex = 0 // Position under first bar (balance)
        const barCenterX = x + (bandwidth / numBars) * (barIndex + 0.5)
        // Position icons to slightly overlay the bottom of the bars (closer on mobile)
        const markerY = yBottom + (isMobile ? 8 : 12)

        // Get unique event types for this bar
        const uniqueTypes = [...new Set(bar.events.map((e) => e.type))]
        const displayEvents = uniqueTypes.slice(0, 3)
        const numIcons = displayEvents.length

        // Background circle size (same for all, smaller on mobile)
        const bgRadius = isMobile ? 12 : 16
        // Icon size - smaller when multiple icons, and smaller on mobile
        const iconSize = isMobile
          ? (numIcons === 1 ? 10 : numIcons === 2 ? 8 : 7)
          : (numIcons === 1 ? 14 : numIcons === 2 ? 10 : 9)

        return (
          <g key={idx}>
            {/* Single background circle for all icons */}
            <circle
              cx={barCenterX}
              cy={markerY}
              r={bgRadius}
              style={{ fill: 'var(--background)' }}
            />
            {displayEvents.map((type, eventIdx) => {
              const color = getActionColor(type)
              const iconData = EVENT_ICON_PATHS[type]

              // Calculate icon position based on number of icons
              let offsetX = 0
              let offsetY = 0

              if (numIcons === 1) {
                // Single icon: centered
                offsetX = 0
                offsetY = 0
              } else if (numIcons === 2) {
                // Two icons: horizontal arrangement
                const iconSpacing = iconSize * 1.3
                offsetX = (eventIdx - 0.5) * iconSpacing
                offsetY = 0
              } else if (numIcons === 3) {
                // Three icons: triangle arrangement (1 on top, 2 on bottom)
                const spacing = iconSize * 1.1
                if (eventIdx === 0) {
                  // Top icon
                  offsetX = 0
                  offsetY = -spacing * 0.6
                } else {
                  // Bottom two icons
                  offsetX = (eventIdx === 1 ? -1 : 1) * spacing * 0.7
                  offsetY = spacing * 0.5
                }
              }

              // Center position for this icon
              const iconX = barCenterX + offsetX - iconSize / 2
              const iconY = markerY + offsetY - iconSize / 2

              if (!iconData) {
                // Fallback to small circle if no icon data
                return (
                  <circle
                    key={eventIdx}
                    cx={barCenterX + offsetX}
                    cy={markerY + offsetY}
                    r={iconSize / 4}
                    fill={color}
                  />
                )
              }

              return (
                <g
                  key={eventIdx}
                  transform={`translate(${iconX}, ${iconY}) scale(${iconSize / 24})`}
                >
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
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                </g>
              )
            })}
            {uniqueTypes.length > 3 && (
              <text
                x={barCenterX + bgRadius + 4}
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
  selectedPeriod: controlledPeriod,
  onPeriodChange,
  onPeriodYieldChange,
}: BalanceBarChartProps) {
  const [internalPeriod, setInternalPeriod] = useState<TimePeriod>("1M")
  const [error, setError] = useState<Error | null>(null)

  // Use controlled or internal state
  const selectedPeriod = controlledPeriod ?? internalPeriod
  const handlePeriodChange = (period: TimePeriod) => {
    if (onPeriodChange) {
      onPeriodChange(period)
    } else {
      setInternalPeriod(period)
    }
  }

  // Calculate current borrow from history data
  const currentBorrow = useMemo(() => {
    if (historyData.length === 0) return 0
    const latestData = historyData[historyData.length - 1]
    return latestData.borrow || 0
  }, [historyData])

  // Aggregate data based on selected period with error handling
  const chartData = useMemo(() => {
    try {
      return aggregateDataByPeriod(
        historyData,
        userActions,
        selectedPeriod,
        currentBalance,
        apy,
        firstEventDate,
        currentBorrow
      )
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to aggregate chart data'))
      return []
    }
  }, [historyData, userActions, selectedPeriod, currentBalance, apy, firstEventDate, currentBorrow])

  // Calculate max value for Y axis (include balance + borrow for proper scaling)
  const maxBalance = useMemo(() => {
    try {
      return Math.max(...chartData.map((d) => d.balance + d.borrow), 1)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to calculate max balance'))
      return 1
    }
  }, [chartData])

  // Calculate and report period yield using correct formula:
  // Period Yield = End Balance - Start Balance - Net Cash Flow
  useEffect(() => {
    if (onPeriodYieldChange && chartData.length > 0) {
      const nonProjectedData = chartData.filter(d => !d.isProjected)

      if (nonProjectedData.length === 0) {
        onPeriodYieldChange(0)
        return
      }

      // Get the date range for the selected period
      const { start: periodStart } = getDateRangeForPeriod(selectedPeriod, firstEventDate)

      // Format date to local YYYY-MM-DD string (avoid UTC timezone issues)
      const formatLocalDate = (date: Date): string => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }

      // Determine the effective start date for yield calculation
      // For 1Y and All, if account history is shorter than the period, use actual first data date
      // This ensures consistency: both periods show the same yield when covering the same data
      let effectiveStartDate = new Date(periodStart)

      if (historyData.length > 0) {
        const sortedHistory = [...historyData].sort((a, b) => a.date.localeCompare(b.date))
        const firstDataDate = new Date(sortedHistory[0].date)
        firstDataDate.setHours(0, 0, 0, 0)

        // If period starts before our first data point, use the first data date instead
        // This ensures 1Y and All calculate from the same starting point
        if (periodStart < firstDataDate) {
          effectiveStartDate = firstDataDate
        }
      }

      // Find start balance: look for the balance from the day BEFORE the effective start
      const dayBeforePeriod = new Date(effectiveStartDate)
      dayBeforePeriod.setDate(dayBeforePeriod.getDate() - 1)
      const dayBeforeStr = formatLocalDate(dayBeforePeriod)

      // Find the closest balance data point at or before the day before period starts
      let startBalance = 0
      if (historyData.length > 0) {
        // Sort by date and find the closest point before or on dayBeforePeriod
        const sortedHistory = [...historyData].sort((a, b) => a.date.localeCompare(b.date))
        for (const point of sortedHistory) {
          if (point.date <= dayBeforeStr) {
            startBalance = point.total || 0
          } else {
            break
          }
        }
      }

      // End balance is the last non-projected bar's balance
      const endBalance = nonProjectedData[nonProjectedData.length - 1].balance

      // Calculate net cash flow from ALL user actions within the effective period
      // Use userActions directly (not bar.events) to ensure we capture all events
      // regardless of how bars are aggregated for display
      const effectiveStartStr = formatLocalDate(effectiveStartDate)
      let netCashFlow = 0

      for (const action of userActions) {
        const actionDate = action.ledger_closed_at.split('T')[0]

        // Only count actions within the effective period
        if (actionDate < effectiveStartStr) continue

        const rawAmount = action.action_type === 'claim' ? action.claim_amount : action.amount_underlying
        if (rawAmount === null) continue

        // Convert raw amount to human-readable using decimals
        const decimals = action.asset_decimals || 7
        const amount = rawAmount / Math.pow(10, decimals)

        // Supply events are deposits (positive cash flow into the position)
        if (action.action_type === 'supply' || action.action_type === 'supply_collateral') {
          netCashFlow += amount
        }
        // Withdraw events are withdrawals (negative cash flow from the position)
        else if (action.action_type === 'withdraw' || action.action_type === 'withdraw_collateral') {
          netCashFlow -= amount
        }
        // Note: borrow/repay are not counted as they don't represent real deposits/withdrawals
        // Note: claim is BLND tokens, different asset, not counted in USD yield
      }

      // Period Yield = End Balance - Start Balance - Net Cash Flow
      // This gives us the true yield earned, excluding deposits/withdrawals
      const periodYield = endBalance - startBalance - netCashFlow
      onPeriodYieldChange(periodYield)
    }
  }, [chartData, historyData, userActions, selectedPeriod, firstEventDate, onPeriodYieldChange])

  if (isLoading || historyData.length === 0) {
    return (
      <div className="space-y-1">
        {/* Chart area */}
        <Skeleton className="aspect-[2/1] md:aspect-[7/2] w-full" />
        {/* Time period tabs - centered below chart */}
        <div className="flex justify-center">
          <Skeleton className="h-9 sm:h-10 w-56 sm:w-64 rounded-md" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="aspect-[2/1] md:aspect-[7/2] flex flex-col items-center justify-center text-destructive gap-2">
          <p className="font-medium">Failed to load chart</p>
          <p className="text-sm text-muted-foreground">{error.message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {/* Bar chart */}
      {chartData.length === 0 ? (
        <div className="aspect-[2/1] md:aspect-[7/2] flex items-center justify-center text-muted-foreground">
          No data available for this period
        </div>
      ) : (
        <div className="aspect-[2/1] md:aspect-[7/2] w-full select-none">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 0, right: 12, left: 12, bottom: 28 }}
              barCategoryGap="2%"
              barGap={1}
            >
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(330 100% 72%)" stopOpacity={1} />
                  <stop offset="100%" stopColor="hsl(330 90% 65%)" stopOpacity={0.8} />
                </linearGradient>
                <linearGradient id="projectedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(142.1 76.2% 36.3%)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="hsl(142.1 76.2% 36.3%)" stopOpacity={0.25} />
                </linearGradient>
                <linearGradient id="borrowGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(25 98% 56%)" stopOpacity={1} />
                  <stop offset="100%" stopColor="hsl(25 98% 53%)" stopOpacity={0.9} />
                </linearGradient>
                <linearGradient id="borrowProjectedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(25 98% 56%)" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="hsl(25 98% 53%)" stopOpacity={0.55} />
                </linearGradient>
                <linearGradient id="yieldGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(142 76% 46%)" stopOpacity={1} />
                  <stop offset="100%" stopColor="hsl(142 70% 38%)" stopOpacity={0.8} />
                </linearGradient>
              </defs>


              <XAxis dataKey="period" hide />
              <YAxis hide domain={[0, maxBalance * 1.1]} />

              {/* For Projection mode: stacked bars (baseBalance + yieldEarned) */}
              {selectedPeriod === "Projection" && (
                <Bar
                  dataKey="baseBalance"
                  stackId="projection"
                  radius={[0, 0, 4, 4]}
                  maxBarSize={80}
                  fill="url(#barGradient)"
                  isAnimationActive={false}
                />
              )}
              {selectedPeriod === "Projection" && (
                <Bar
                  dataKey="yieldEarned"
                  stackId="projection"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={80}
                  fill="url(#yieldGradient)"
                  isAnimationActive={false}
                />
              )}

              {/* For other modes: regular balance bar */}
              {selectedPeriod !== "Projection" && (
                <Bar
                  dataKey="balance"
                  radius={4}
                  maxBarSize={selectedPeriod === "1M" ? 40 : selectedPeriod === "1W" ? 60 : 80}
                  activeBar={{ fill: "#f472b6" }}
                  isAnimationActive={false}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.isProjected ? "url(#projectedGradient)" : "url(#barGradient)"}
                    />
                  ))}
                </Bar>
              )}

              {selectedPeriod !== "Projection" && (
                <Bar
                  dataKey="borrow"
                  radius={4}
                  maxBarSize={selectedPeriod === "1M" ? 40 : selectedPeriod === "1W" ? 60 : 80}
                  activeBar={{ fill: "hsl(25 98% 68%)" }}
                  isAnimationActive={false}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-borrow-${index}`}
                      fill={entry.isProjected ? "url(#borrowProjectedGradient)" : "url(#borrowGradient)"}
                    />
                  ))}
                </Bar>
              )}

              {/* Event markers below bars */}
              {selectedPeriod !== "Projection" && (
                <Customized component={renderEventMarkers} />
              )}

              {/* Tooltip - using default hover trigger which works on mobile touch */}
              <Tooltip
                content={<CustomTooltip period={selectedPeriod} />}
                cursor={{ fill: 'transparent' }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Time period tabs - centered below chart */}
      <div className="flex justify-center overflow-x-auto">
        <Tabs
          value={selectedPeriod}
          onValueChange={(v) => handlePeriodChange(v as TimePeriod)}
        >
          <TabsList className="h-9 sm:h-10 bg-transparent gap-2">
            {TIME_PERIODS.map((period) => (
              <TabsTrigger key={period.value} value={period.value} className="text-xs sm:text-sm px-3 sm:px-4">
                {period.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
    </div>
  )
}
