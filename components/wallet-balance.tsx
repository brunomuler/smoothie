"use client"

import * as React from "react"
import { useState, useMemo } from "react"
import { TrendingUp, PiggyBank, Maximize2 } from "lucide-react"
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, ReferenceDot } from "recharts"
import {
  Card,
  CardAction,
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
import type { BalanceData, ChartDataPoint as WalletChartDataPoint } from "@/types/wallet-balance"
import type { ChartDataPoint } from "@/types/balance-history"
import { useLiveBalance } from "@/hooks/use-live-balance"
import { FormattedBalance } from "@/components/formatted-balance"
import { useBalanceHistory } from "@/hooks/use-balance-history"
import { BalanceHistoryChart } from "@/components/balance-history-chart"

interface WalletBalanceProps {
  data: BalanceData
  chartData: WalletChartDataPoint[]
  publicKey?: string
  assetAddress?: string
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

const WalletBalanceComponent = ({ data, chartData, publicKey, assetAddress }: WalletBalanceProps) => {
  const initialBalance = Number.isFinite(data.rawBalance) ? Math.max(data.rawBalance, 0) : 0
  const apyDecimal = Number.isFinite(data.apyPercentage)
    ? Math.max(data.apyPercentage, 0) / 100
    : 0

  // Fetch full history (90 days) for accurate earnings stats
  const { earningsStats, chartData: fullHistoryChartData } = useBalanceHistory({
    publicKey: publicKey || '',
    assetAddress: assetAddress || '',
    days: 90,
    enabled: !!publicKey && !!assetAddress,
  })

  // Use full history chart data from the 90-day dataset
  const historyChartData = useMemo(() => {
    if (fullHistoryChartData.length === 0) return []
    // Return all historical data
    return fullHistoryChartData
  }, [fullHistoryChartData])

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
  const showLiveGrowthAmount = hasSignificantAmount(liveGrowthAmount)

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
        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
          {formattedLiveGrowth} yield
          {showPercentageGain && (
            <span className="ml-1 text-emerald-500 dark:text-emerald-300">
              ({formatSignedPercentage(percentageGain)}%)
            </span>
          )}
        </p>
        <CardAction>
          <div className="flex gap-2 flex-wrap">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline">
                    <TrendingUp className="mr-1 h-3 w-3" />
                    {formatPercentage(
                      earningsStats.currentAPY || data.apyPercentage
                    )}% APY
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {earningsStats.currentAPY
                      ? `Realized APY over ${earningsStats.dayCount} days`
                      : "Annual Percentage Yield"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Show current weighted APY from pool positions (when different from realized APY) */}
            {earningsStats.currentAPY && hasNonZeroPercentage(data.apyPercentage) && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="secondary">
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
                    <Badge variant="outline">
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
        </CardAction>
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
                        labelFormatter={(value, payload) => {
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

              {publicKey && assetAddress && (
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
                      publicKey={publicKey}
                      assetAddress={assetAddress}
                    />
                  </DialogContent>
                </Dialog>
              )}
            </>
          )}
        </div>
      </CardContent>

      <Separator />

      <CardFooter className="flex flex-col sm:flex-row items-stretch gap-4">
        <div className="flex flex-1 flex-col gap-1 py-2">
          <div className="text-sm text-muted-foreground">Daily Yield</div>
          <div className="text-xl font-semibold tabular-nums">
            {yieldFormatter.format(dailyYield)}
          </div>
        </div>

        <Separator orientation="vertical" className="hidden sm:block self-stretch" />
        <Separator className="sm:hidden" />

        <div className="flex flex-1 flex-col gap-1 py-2">
          <div className="text-sm text-muted-foreground">Monthly Yield</div>
          <div className="text-xl font-semibold tabular-nums">
            {yieldFormatter.format(monthlyYield)}
          </div>
        </div>

        <Separator orientation="vertical" className="hidden sm:block self-stretch" />
        <Separator className="sm:hidden" />

        <div className="flex flex-1 flex-col gap-1 py-2">
          <div className="text-sm text-muted-foreground">Annual Yield</div>
          <div className="text-xl font-semibold tabular-nums">
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
