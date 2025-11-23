"use client"

import * as React from "react"
import { useMemo } from "react"
import { TrendingUp, PiggyBank, Maximize2 } from "lucide-react"
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, ReferenceDot } from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import type { BalanceData, ChartDataPoint as WalletChartDataPoint } from "@/types/wallet-balance"
import type { ChartDataPoint, EarningsStats, PositionChange } from "@/types/balance-history"
import { useLiveBalance } from "@/hooks/use-live-balance"
import { FormattedBalance } from "@/components/formatted-balance"
import { BalanceHistoryChart } from "@/components/balance-history-chart"

interface WalletBalanceProps {
  data: BalanceData
  chartData: WalletChartDataPoint[]
  publicKey?: string
  assetAddress?: string
  balanceHistoryData?: {
    earningsStats: EarningsStats
    chartData: ChartDataPoint[]
    positionChanges: PositionChange[]
  }
  loading?: boolean
}

function formatPercentage(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.00"
  }
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatSignedPercentage(value: number): string {
  const formatted = formatPercentage(Math.abs(value))
  return value >= 0 ? `+${formatted}` : `-${formatted}`
}

function hasNonZeroPercentage(value: number): boolean {
  if (!Number.isFinite(value)) {
    return false
  }
  return Math.abs(value) >= 0.005
}

function hasSignificantAmount(value: number): boolean {
  if (!Number.isFinite(value)) {
    return false
  }
  return Math.abs(value) >= 0.0000001
}

const chartConfig = {
  deposit: {
    label: "Deposit",
    color: "hsl(var(--chart-1))",
  },
  total: {
    label: "Balance",
    color: "hsl(var(--chart-2))",
  },
}

const WalletBalanceSkeleton = () => {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>
          <Skeleton className="h-4 w-24" />
        </CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          <Skeleton className="h-8 w-48 @[250px]/card:h-9" />
        </CardTitle>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-24" />
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-2">
          <Skeleton className="aspect-[3/1] w-full" />
        </div>
      </CardContent>

      <Separator />

      <CardFooter className="flex flex-row items-stretch gap-2 @[250px]/card:gap-4">
        <div className="flex flex-1 flex-col gap-0.5 py-2">
          <Skeleton className="h-3 w-16 @[250px]/card:h-4" />
          <Skeleton className="h-4 w-20 @[250px]/card:h-5" />
        </div>

        <Separator orientation="vertical" className="self-stretch" />

        <div className="flex flex-1 flex-col gap-0.5 py-2">
          <Skeleton className="h-3 w-20 @[250px]/card:h-4" />
          <Skeleton className="h-4 w-20 @[250px]/card:h-5" />
        </div>

        <Separator orientation="vertical" className="self-stretch" />

        <div className="flex flex-1 flex-col gap-0.5 py-2">
          <Skeleton className="h-3 w-20 @[250px]/card:h-4" />
          <Skeleton className="h-4 w-20 @[250px]/card:h-5" />
        </div>
      </CardFooter>
    </Card>
  )
}

const WalletBalanceComponent = ({ data, chartData, publicKey, assetAddress, balanceHistoryData, loading }: WalletBalanceProps) => {
  // Show skeleton while loading
  if (loading) {
    return <WalletBalanceSkeleton />
  }

  const initialBalance = Number.isFinite(data.rawBalance) ? Math.max(data.rawBalance, 0) : 0
  const apyDecimal = Number.isFinite(data.apyPercentage)
    ? Math.max(data.apyPercentage, 0) / 100
    : 0

  // Use balance history data from props if available
  const historyChartData = balanceHistoryData?.chartData || []

  // Use balance history chart data if available, otherwise fallback to prop
  // Transform fallback data to have 'total' field for chart compatibility
  const displayChartData = useMemo((): ChartDataPoint[] => {
    return historyChartData.length > 0
      ? historyChartData
      : chartData.map(point => {
          const date = new Date(point.date)
          return {
            date: point.date,
            formattedDate: date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            }),
            timestamp: date.getTime(),
            total: Number(point.balance) || 0, // Ensure numeric value
            deposit: Number(point.deposit) || 0, // Ensure numeric value
            yield: Number(point.yield) || 0,
            pools: [],
          }
        })
  }, [historyChartData, chartData])

  const { displayBalance } = useLiveBalance(initialBalance, apyDecimal, null, 0)

  // Use yield calculated from: SDK Balance - Dune Cost Basis
  const liveGrowthAmount = data.rawInterestEarned

  // Enhanced chart data: full history + today + 12 month projection
  const enhancedChartData = useMemo((): ChartDataPoint[] => {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    // Start with historical data
    let baseData = [...displayChartData]

    // Calculate initial deposit from last historical point
    const lastHistoricalDeposit = baseData.length > 0 ? baseData[baseData.length - 1].deposit : initialBalance

    // Add today's data point with live balance
    const todayPoint = {
      date: todayStr,
      formattedDate: today.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      timestamp: today.getTime(),
      total: displayBalance,
      deposit: lastHistoricalDeposit,
      yield: displayBalance - lastHistoricalDeposit,
      pools: [],
      isToday: true, // Mark for annotation
    }
    baseData.push(todayPoint)

    // Generate 12 monthly projections using weighted average APY
    const monthlyAPY = data.apyPercentage > 0 ? data.apyPercentage / 100 / 12 : 0
    let projectedBalance = displayBalance

    for (let month = 1; month <= 12; month++) {
      const futureDate = new Date(today)
      futureDate.setMonth(futureDate.getMonth() + month)

      // Project balance with compound interest
      projectedBalance = projectedBalance * (1 + monthlyAPY)

      baseData.push({
        date: futureDate.toISOString().split('T')[0],
        formattedDate: futureDate.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
        timestamp: futureDate.getTime(),
        total: projectedBalance,
        deposit: lastHistoricalDeposit,
        yield: projectedBalance - lastHistoricalDeposit,
        pools: [],
        isProjected: true, // Mark as projected
      })
    }

    return baseData
  }, [displayChartData, displayBalance, initialBalance, data.apyPercentage])

  const liveBalanceFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 7,
    maximumFractionDigits: 7,
  })

  const liveDeltaFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "always",
  })

  const formattedLiveBalance = liveBalanceFormatter.format(displayBalance)
  const formattedLiveGrowth = liveDeltaFormatter.format(liveGrowthAmount)

  // Use percentage gain calculated from: (SDK Balance - Cost Basis) / Cost Basis * 100
  const percentageGain = data.growthPercentage
  const showPercentageGain = Number.isFinite(percentageGain) && hasSignificantAmount(liveGrowthAmount)

  // Calculate yield projections based on current APY
  const dailyYield = displayBalance * (data.apyPercentage / 100) / 365
  const monthlyYield = displayBalance * (data.apyPercentage / 100) / 12

  const yieldFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>Total Positions</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          <FormattedBalance value={formattedLiveBalance} />
        </CardTitle>
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
            {formattedLiveGrowth} yield
            {showPercentageGain && (
              <span className="ml-1">
                ({formatSignedPercentage(percentageGain)}%)
              </span>
            )}
          </p>
          {balanceHistoryData?.earningsStats?.currentAPY && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="text-xs py-0.5 px-2 whitespace-nowrap">
                    <TrendingUp className="mr-1 h-3 w-3" />
                    {formatPercentage(balanceHistoryData.earningsStats.currentAPY)}% APY
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Realized APY over {balanceHistoryData.earningsStats.dayCount} days</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {/* Show current weighted APY from pool positions (when different from realized APY) */}
          {balanceHistoryData?.earningsStats?.currentAPY && balanceHistoryData.earningsStats.currentAPY > 0 && hasNonZeroPercentage(data.apyPercentage) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="secondary" className="text-xs py-0.5 px-2 whitespace-nowrap">
                    <TrendingUp className="mr-1 h-3 w-3" />
                    {formatPercentage(data.apyPercentage)}% APY
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Current weighted average APY from pool positions</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {hasNonZeroPercentage(data.growthPercentage) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="text-xs py-0.5 px-2 whitespace-nowrap">
                    <PiggyBank className="mr-1 h-3 w-3" />
                    {formatSignedPercentage(data.growthPercentage)}% BLND APY
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>BLND emissions APY across supplied positions</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-2">
          {displayChartData.length === 0 ? (
            <div className="aspect-[3/1] flex items-center justify-center text-muted-foreground">
              No chart data available
            </div>
          ) : (
            <>
              <ChartContainer config={chartConfig} className="aspect-[3/1]">
                <AreaChart
                  data={enhancedChartData}
                  margin={{
                    left: 0,
                    right: 0,
                    top: 5,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    hide
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    hide
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(_value, payload) => {
                          // Get the date from the payload data point
                          if (payload && payload[0]?.payload?.date) {
                            return new Date(payload[0].payload.date).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          }
                          return ""
                        }}
                        formatter={(value, name, props) => {
                          const formatted = new Intl.NumberFormat("en-US", {
                            style: "currency",
                            currency: "USD",
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }).format(Number(value))
                          const label = name === "deposit" ? "Deposit" : "Balance"
                          const isProjected = props.payload?.isProjected
                          return [formatted, isProjected ? `${label} (projected)` : label]
                        }}
                      />
                    }
                  />
                  {/* Line showing deposit amount (principal) */}
                  <Area
                    type="monotone"
                    dataKey="deposit"
                    stroke="var(--color-deposit)"
                    strokeWidth={2}
                    fill="var(--color-deposit)"
                    fillOpacity={0.1}
                  />
                  {/* Line showing total balance (deposit + yield) */}
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="var(--color-total)"
                    strokeWidth={2}
                    fill="var(--color-total)"
                    fillOpacity={0.1}
                  />
                  {/* Mark today's value */}
                  <ReferenceDot
                    x={enhancedChartData.find(d => d.isToday)?.timestamp}
                    y={displayBalance}
                    r={4}
                    fill="var(--color-total)"
                    stroke="#fff"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>

              {publicKey && assetAddress && balanceHistoryData && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full">
                      <Maximize2 className="mr-2 h-4 w-4" />
                      View Full History
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-[95vw] sm:max-w-3xl lg:max-w-5xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Balance History - Full View</DialogTitle>
                    </DialogHeader>
                    <BalanceHistoryChart
                      chartData={balanceHistoryData.chartData}
                      positionChanges={balanceHistoryData.positionChanges}
                    />
                  </DialogContent>
                </Dialog>
              )}
            </>
          )}
        </div>
      </CardContent>

      <Separator />

      <CardFooter className="flex flex-row items-stretch gap-2 @[250px]/card:gap-4">
        <div className="flex flex-1 flex-col gap-0.5 py-2">
          <div className="text-[10px] @[250px]/card:text-xs text-muted-foreground">Daily Yield</div>
          <div className="text-sm @[250px]/card:text-base font-semibold tabular-nums">
            {yieldFormatter.format(dailyYield)}
          </div>
        </div>

        <Separator orientation="vertical" className="self-stretch" />

        <div className="flex flex-1 flex-col gap-0.5 py-2">
          <div className="text-[10px] @[250px]/card:text-xs text-muted-foreground">Monthly Yield</div>
          <div className="text-sm @[250px]/card:text-base font-semibold tabular-nums">
            {yieldFormatter.format(monthlyYield)}
          </div>
        </div>

        <Separator orientation="vertical" className="self-stretch" />

        <div className="flex flex-1 flex-col gap-0.5 py-2">
          <div className="text-[10px] @[250px]/card:text-xs text-muted-foreground">Annual Yield</div>
          <div className="text-sm @[250px]/card:text-base font-semibold tabular-nums">
            ${data.annualYield}
          </div>
        </div>
      </CardFooter>
    </Card>
  )
}

// Memoize component to prevent unnecessary re-renders
// Only re-render when essential data changes
export const WalletBalance = React.memo(WalletBalanceComponent, (prevProps, nextProps) => {
  return (
    prevProps.data.rawBalance === nextProps.data.rawBalance &&
    prevProps.data.apyPercentage === nextProps.data.apyPercentage &&
    prevProps.data.growthPercentage === nextProps.data.growthPercentage &&
    prevProps.publicKey === nextProps.publicKey &&
    prevProps.assetAddress === nextProps.assetAddress
  )
})
