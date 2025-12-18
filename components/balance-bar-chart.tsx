"use client"

import { useState, useMemo, useEffect, useCallback, memo } from "react"
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
  Flame,
  AlertTriangle,
  Circle,
  Shield,
  Settings,
} from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import type { ChartDataPoint, TimePeriod, BarChartDataPoint } from "@/types/balance-history"
import type { UserAction } from "@/lib/db/types"
import {
  aggregateDataByPeriod,
  getDateRangeForPeriod,
  getActionColor,
  type ProjectionSettings,
  type PoolProjectionInput,
  DEFAULT_PROJECTION_SETTINGS,
} from "@/lib/chart-utils"
import {
  EVENT_ICON_PATHS,
  EVENT_ICON_CATEGORY,
  FALLBACK_ICON,
  type IconPathData,
} from "@/lib/icon-paths"
import { useCurrencyPreference } from "@/hooks/use-currency-preference"
import type { FormatCurrencyOptions } from "@/lib/currency/format"

interface BalanceBarChartProps {
  historyData: ChartDataPoint[]
  userActions: UserAction[]
  currentBalance: number
  apy: number
  blndApy?: number // BLND APY for projection calculations
  firstEventDate: string | null
  isLoading?: boolean
  selectedPeriod?: TimePeriod
  onPeriodChange?: (period: TimePeriod) => void
  onPeriodYieldChange?: (periodYield: number) => void
  poolInputs?: PoolProjectionInput[] // Per-pool data for projection breakdown
}

const TIME_PERIODS: { value: TimePeriod; label: string }[] = [
  { value: "1W", label: "1W" },
  { value: "1M", label: "1M" },
  { value: "1Y", label: "1Y" },
  { value: "All", label: "All" },
  { value: "Projection", label: "Projection" },
]

const PROJECTION_SETTINGS_KEY = "smoothie-projection-settings"

const COMPOUND_FREQUENCY_OPTIONS: { value: string; label: string }[] = [
  { value: "52", label: "Weekly" },
  { value: "26", label: "Bi-weekly" },
  { value: "12", label: "Monthly" },
  { value: "4", label: "Quarterly" },
  { value: "2", label: "Semi-annually" },
]

// Icon components for events
const EventIcons: Record<string, React.ComponentType<{ className?: string; color?: string }>> = {
  supply: ArrowDownCircle,
  supply_collateral: ArrowDownCircle,
  withdraw: ArrowUpCircle,
  withdraw_collateral: ArrowUpCircle,
  borrow: Banknote,
  repay: CheckCircle,
  claim: Flame,
  liquidate: AlertTriangle,
  backstop_deposit: Shield,
  backstop_withdraw: Shield,
  backstop_queue_withdrawal: Shield,
  backstop_dequeue_withdrawal: Shield,
  backstop_claim: Shield,
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
  formatCurrency,
}: {
  active?: boolean
  payload?: any[]
  period: TimePeriod
  formatCurrency: (amount: number, options?: FormatCurrencyOptions) => string
}) {
  if (!active || !payload || !payload.length) {
    return null
  }

  const data = payload[0].payload as BarChartDataPoint
  const formatter = (value: number) => formatCurrency(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  const yieldFormatter = (value: number) => formatCurrency(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    showSign: true,
  })

  // Check if we have per-pool breakdown data
  const hasPoolBreakdown = data.poolBreakdown && data.poolBreakdown.length > 0

  return (
    <div className="bg-background border rounded-lg shadow-lg p-3 min-w-[220px] max-w-[320px] select-none z-50">
      <div className="font-medium mb-2">
        {data.period}
        {data.isProjected && (
          <span className="text-xs text-muted-foreground ml-2">(Projected)</span>
        )}
      </div>

      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Balance:</span>
          <span className="font-medium">{formatter(data.balance)}</span>
        </div>

        {/* Only show borrowed in non-projection views */}
        {!data.isProjected && data.borrow > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Borrowed:</span>
            <span className="font-medium text-orange-600 dark:text-orange-400">
              {formatter(data.borrow)}
            </span>
          </div>
        )}

        {/* Show per-pool breakdown for projections */}
        {hasPoolBreakdown && data.isProjected ? (
          <>
            {/* Per-pool yield breakdown */}
            <div className="pt-2 border-t mt-2">
              <div className="space-y-1.5">
                {data.poolBreakdown!
                  .filter((pool) => pool.yieldEarned !== 0 || pool.blndYield !== 0)
                  .map((pool) => (
                    <div key={pool.poolId} className="space-y-0.5">
                      <div className="text-xs font-medium text-muted-foreground">{pool.poolName}</div>
                      {pool.yieldEarned !== 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground pl-2">Yield:</span>
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {yieldFormatter(pool.yieldEarned)}
                          </span>
                        </div>
                      )}
                      {pool.blndYield !== 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground pl-2">BLND:</span>
                          <span className="text-purple-600 dark:text-purple-400">
                            {yieldFormatter(pool.blndYield)}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>

            {/* Totals */}
            <div className="pt-2 border-t mt-2">
              {data.yieldEarned !== 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Yield:</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    {yieldFormatter(data.yieldEarned)}
                  </span>
                </div>
              )}
              {data.blndYield !== undefined && data.blndYield !== 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total BLND:</span>
                  <span className="font-medium text-purple-600 dark:text-purple-400">
                    {yieldFormatter(data.blndYield)}
                  </span>
                </div>
              )}
              <div className="flex justify-between mt-1 pt-1 border-t">
                <span className="text-muted-foreground font-medium">Combined:</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {yieldFormatter(data.yieldEarned + (data.blndYield || 0))}
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Standard view without per-pool breakdown */}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Yield:</span>
              <span
                className={
                  data.yieldEarned >= 0
                    ? "font-medium text-emerald-600 dark:text-emerald-400"
                    : "font-medium text-red-600 dark:text-red-400"
                }
              >
                {yieldFormatter(data.yieldEarned)}
              </span>
            </div>

            {data.blndYield !== undefined && data.blndYield > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">BLND Yield:</span>
                <span className="font-medium text-purple-600 dark:text-purple-400">
                  {yieldFormatter(data.blndYield)}
                </span>
              </div>
            )}
          </>
        )}

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

        // Group events by icon category (so multiple backstop events = 1 shield icon)
        const eventsByCategory = new Map<string, string>()
        for (const event of bar.events) {
          const category = EVENT_ICON_CATEGORY[event.type] || event.type
          if (!eventsByCategory.has(category)) {
            eventsByCategory.set(category, event.type) // Store first event type for this category
          }
        }
        // Get unique icon categories and their representative event types
        const uniqueCategories = Array.from(eventsByCategory.entries())
        const displayEvents = uniqueCategories.slice(0, 4).map(([_, type]) => type)
        const numIcons = displayEvents.length

        // Background circle size (same for all, smaller on mobile)
        const bgRadius = isMobile ? 12 : 16
        // Icon size - smaller when multiple icons, and smaller on mobile
        const iconSize = isMobile
          ? (numIcons === 1 ? 10 : numIcons === 2 ? 8 : numIcons === 3 ? 6 : 5)
          : (numIcons === 1 ? 14 : numIcons === 2 ? 10 : numIcons === 3 ? 8 : 7)

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
              } else if (numIcons === 4) {
                // Four icons: diamond/losange arrangement (1 top, 2 middle, 1 bottom)
                const spacing = iconSize * 1.0
                if (eventIdx === 0) {
                  // Top icon
                  offsetX = 0
                  offsetY = -spacing * 0.9
                } else if (eventIdx === 1) {
                  // Left middle icon
                  offsetX = -spacing * 0.9
                  offsetY = 0
                } else if (eventIdx === 2) {
                  // Right middle icon
                  offsetX = spacing * 0.9
                  offsetY = 0
                } else {
                  // Bottom icon
                  offsetX = 0
                  offsetY = spacing * 0.9
                }
              }

              // Center position for this icon
              const iconX = barCenterX + offsetX - iconSize / 2
              const iconY = markerY + offsetY - iconSize / 2

              // Use fallback icon if no data for this type
              const effectiveIconData = iconData || FALLBACK_ICON

              return (
                <g
                  key={eventIdx}
                  transform={`translate(${iconX}, ${iconY}) scale(${iconSize / 24})`}
                >
                  {/* Rect elements (for icon boxes) */}
                  {effectiveIconData.rects?.map((rect, rectIdx) => (
                    <rect
                      key={rectIdx}
                      x={rect.x}
                      y={rect.y}
                      width={rect.width}
                      height={rect.height}
                      rx={rect.rx}
                      fill="none"
                      stroke={color}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                  {/* Circle elements (for coins icon) */}
                  {effectiveIconData.circles?.map((circle, circleIdx) => (
                    <circle
                      key={circleIdx}
                      cx={circle.cx}
                      cy={circle.cy}
                      r={circle.r}
                      fill="none"
                      stroke={color}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                  {/* Icon paths */}
                  {effectiveIconData.paths.map((d, pathIdx) => (
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
            {uniqueCategories.length > 4 && (
              <text
                x={barCenterX + bgRadius + 4}
                y={markerY}
                textAnchor="start"
                dominantBaseline="central"
                fontSize={8}
                fill="currentColor"
                opacity={0.6}
              >
                +{uniqueCategories.length - 4}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

export const BalanceBarChart = memo(function BalanceBarChart({
  historyData,
  userActions,
  currentBalance,
  apy,
  blndApy = 0,
  firstEventDate,
  isLoading = false,
  selectedPeriod: controlledPeriod,
  onPeriodChange,
  onPeriodYieldChange,
  poolInputs = [],
}: BalanceBarChartProps) {
  const [internalPeriod, setInternalPeriod] = useState<TimePeriod>("1M")
  const [error, setError] = useState<Error | null>(null)

  // Currency preference for multi-currency display
  const { format: formatCurrency } = useCurrencyPreference()

  // Projection settings state with localStorage persistence
  const [projectionSettings, setProjectionSettings] = useState<ProjectionSettings>(DEFAULT_PROJECTION_SETTINGS)

  // Load settings from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(PROJECTION_SETTINGS_KEY)
        if (saved) {
          const parsed = JSON.parse(saved) as Partial<ProjectionSettings>
          // Merge with defaults to handle new properties for existing users
          setProjectionSettings({ ...DEFAULT_PROJECTION_SETTINGS, ...parsed })
        }
      } catch {
        // Ignore parse errors, use defaults
      }
    }
  }, [])

  // Save settings to localStorage when they change
  const updateProjectionSettings = useCallback((newSettings: Partial<ProjectionSettings>) => {
    setProjectionSettings(prev => {
      const updated = { ...prev, ...newSettings }
      if (typeof window !== 'undefined') {
        localStorage.setItem(PROJECTION_SETTINGS_KEY, JSON.stringify(updated))
      }
      return updated
    })
  }, [])

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
  // Note: We explicitly include projectionSettings properties in deps to ensure React detects changes
  const chartData = useMemo(() => {
    try {
      return aggregateDataByPeriod(
        historyData,
        userActions,
        selectedPeriod,
        currentBalance,
        apy,
        firstEventDate,
        currentBorrow,
        blndApy,
        projectionSettings,
        poolInputs
      )
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to aggregate chart data'))
      return []
    }
  }, [historyData, userActions, selectedPeriod, currentBalance, apy, firstEventDate, currentBorrow, blndApy, projectionSettings.blndReinvestment, projectionSettings.compoundFrequency, projectionSettings.projectionYears, poolInputs])

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
                <linearGradient id="blndYieldGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(270 70% 60%)" stopOpacity={1} />
                  <stop offset="100%" stopColor="hsl(270 65% 50%)" stopOpacity={0.8} />
                </linearGradient>
              </defs>


              <XAxis dataKey="period" hide />
              <YAxis hide domain={[0, maxBalance * 1.1]} />

              {/* For Projection mode: stacked bars (baseBalance + yieldEarned + blndYield) */}
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
                  radius={[0, 0, 0, 0]}
                  maxBarSize={80}
                  fill="url(#yieldGradient)"
                  isAnimationActive={false}
                />
              )}
              {selectedPeriod === "Projection" && (
                <Bar
                  dataKey="blndYield"
                  stackId="projection"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={80}
                  fill="url(#blndYieldGradient)"
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
                content={<CustomTooltip period={selectedPeriod} formatCurrency={formatCurrency} />}
                cursor={{ fill: 'transparent' }}
                wrapperStyle={{ zIndex: 50 }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Time period tabs and settings - below chart */}
      <div className="flex justify-center items-center overflow-x-auto relative">
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

        {/* Projection settings button - positioned to the right */}
        {selectedPeriod === "Projection" && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="right-3 p-1.5 rounded-md hover:bg-accent transition-colors"
                aria-label="Projection settings"
              >
                <Settings className="h-4 w-4 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72" align="end">
              <div className="space-y-4">
                <h4 className="font-semibold text-base">Projection Settings</h4>

                {/* Projection Years Slider */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="projection-years" className="text-sm text-muted-foreground">
                      Projection Period
                    </Label>
                    <span className="text-sm font-medium">
                      {projectionSettings.projectionYears} {projectionSettings.projectionYears === 1 ? 'year' : 'years'}
                    </span>
                  </div>
                  <Slider
                    id="projection-years"
                    min={1}
                    max={25}
                    step={1}
                    value={[projectionSettings.projectionYears]}
                    onValueChange={([value]) => updateProjectionSettings({ projectionYears: value })}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    {projectionSettings.projectionYears <= 3 ? 'Showing monthly bars' : 'Showing yearly bars'}
                  </p>
                </div>

                {/* BLND Reinvestment Toggle */}
                <div className="flex items-center justify-between">
                  <Label htmlFor="blnd-reinvest" className="text-sm text-muted-foreground">
                    Reinvest BLND
                  </Label>
                  <Switch
                    id="blnd-reinvest"
                    checked={projectionSettings.blndReinvestment}
                    onCheckedChange={(checked) => updateProjectionSettings({ blndReinvestment: checked })}
                  />
                </div>

                {/* Compound Frequency - only visible when reinvestment is on */}
                {projectionSettings.blndReinvestment && (
                  <div className="space-y-2">
                    <Label htmlFor="compound-freq" className="text-sm text-muted-foreground">
                      Reinvest Frequency
                    </Label>
                    <Select
                      value={projectionSettings.compoundFrequency.toString()}
                      onValueChange={(value) => updateProjectionSettings({
                        compoundFrequency: parseInt(value) as 52 | 26 | 12 | 4 | 2
                      })}
                    >
                      <SelectTrigger id="compound-freq" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COMPOUND_FREQUENCY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      How often BLND rewards are claimed and reinvested
                    </p>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

    </div>
  )
})
