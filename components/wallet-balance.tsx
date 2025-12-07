"use client"

import * as React from "react"
import { useMemo } from "react"
import { TrendingUp, TrendingDown, PiggyBank, Eye, EyeOff, Gift } from "lucide-react"
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
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { BalanceData, ChartDataPoint as WalletChartDataPoint } from "@/types/wallet-balance"
import type { ChartDataPoint, EarningsStats, PositionChange } from "@/types/balance-history"
import { useLiveBalance } from "@/hooks/use-live-balance"
import { useUserActions } from "@/hooks/use-user-actions"
import { FormattedBalance } from "@/components/formatted-balance"
import { BalanceBarChart } from "@/components/balance-bar-chart"

interface WalletBalanceProps {
  data: BalanceData
  chartData: WalletChartDataPoint[]
  publicKey?: string
  balanceHistoryData?: {
    earningsStats: EarningsStats
    chartData: ChartDataPoint[]
    positionChanges: PositionChange[]
  }
  loading?: boolean
  isDemoMode?: boolean
  onToggleDemoMode?: () => void
  pendingEmissions?: number // Pending BLND emissions in tokens
  blndPrice?: number | null // BLND price in USD
  usdcPrice?: number // USDC price from SDK oracle for normalizing historical data
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

      <CardFooter className="flex flex-col @[350px]/card:flex-row items-stretch gap-2 @[350px]/card:gap-4">
        <div className="flex flex-1 flex-row @[350px]/card:flex-col gap-2 @[350px]/card:gap-0.5 py-2 justify-between @[350px]/card:justify-start">
          <Skeleton className="h-3 w-16 @[250px]/card:h-4" />
          <Skeleton className="h-4 w-20 @[250px]/card:h-5" />
        </div>

        <Separator orientation="horizontal" className="@[350px]/card:hidden" />
        <Separator orientation="vertical" className="self-stretch hidden @[350px]/card:block" />

        <div className="flex flex-1 flex-row @[350px]/card:flex-col gap-2 @[350px]/card:gap-0.5 py-2 justify-between @[350px]/card:justify-start">
          <Skeleton className="h-3 w-20 @[250px]/card:h-4" />
          <Skeleton className="h-4 w-20 @[250px]/card:h-5" />
        </div>

        <Separator orientation="horizontal" className="@[350px]/card:hidden" />
        <Separator orientation="vertical" className="self-stretch hidden @[350px]/card:block" />

        <div className="flex flex-1 flex-row @[350px]/card:flex-col gap-2 @[350px]/card:gap-0.5 py-2 justify-between @[350px]/card:justify-start">
          <Skeleton className="h-3 w-20 @[250px]/card:h-4" />
          <Skeleton className="h-4 w-20 @[250px]/card:h-5" />
        </div>
      </CardFooter>
    </Card>
  )
}

// Dummy data for demo mode
const DUMMY_DATA = {
  rawBalance: 12500.5432109,
  apyPercentage: 8.75,
  growthPercentage: 12.34,
  rawInterestEarned: 1250.45,
  annualYield: "1093.80",
  blndApy: 0.91,
}

const DUMMY_CHART_DATA: WalletChartDataPoint[] = [
  { date: "2025-01-01", balance: 10000, deposit: 10000, yield: 0, type: 'historical' },
  { date: "2025-02-01", balance: 10250, deposit: 10000, yield: 250, type: 'historical' },
  { date: "2025-03-01", balance: 10520, deposit: 10000, yield: 520, type: 'historical' },
  { date: "2025-04-01", balance: 10800, deposit: 10000, yield: 800, type: 'historical' },
  { date: "2025-05-01", balance: 11090, deposit: 10000, yield: 1090, type: 'historical' },
  { date: "2025-06-01", balance: 11390, deposit: 10000, yield: 1390, type: 'historical' },
  { date: "2025-07-01", balance: 11700, deposit: 10000, yield: 1700, type: 'historical' },
  { date: "2025-08-01", balance: 12020, deposit: 10000, yield: 2020, type: 'historical' },
  { date: "2025-09-01", balance: 12350, deposit: 10000, yield: 2350, type: 'historical' },
  { date: "2025-10-01", balance: 12690, deposit: 10000, yield: 2690, type: 'historical' },
  { date: "2025-11-01", balance: 13040, deposit: 10000, yield: 3040, type: 'historical' },
]

const WalletBalanceComponent = ({ data, chartData, publicKey, balanceHistoryData, loading, isDemoMode = false, onToggleDemoMode, pendingEmissions = 0, blndPrice, usdcPrice = 1 }: WalletBalanceProps) => {
  // Use dummy data when in demo mode
  const activeData = isDemoMode ? DUMMY_DATA : data
  const activeChartData = isDemoMode ? DUMMY_CHART_DATA : chartData

  const initialBalance = Number.isFinite(activeData.rawBalance) ? Math.max(activeData.rawBalance, 0) : 0
  const apyDecimal = Number.isFinite(activeData.apyPercentage)
    ? Math.max(activeData.apyPercentage, 0) / 100
    : 0

  // Use balance history data from props if available (not in demo mode)
  const historyChartData = isDemoMode ? [] : (balanceHistoryData?.chartData || [])

  // Use balance history chart data if available, otherwise fallback to prop
  // Transform fallback data to have 'total' field for chart compatibility
  // IMPORTANT: Normalize historical data to USD using the USDC price from SDK
  const displayChartData = useMemo((): ChartDataPoint[] => {
    if (historyChartData.length > 0) {
      // Normalize historical data by multiplying by USDC price
      // Historical data is in raw USDC tokens, SDK data is in USD
      return historyChartData.map(point => ({
        ...point,
        total: (point.total || 0) * usdcPrice,
        deposit: (point.deposit || 0) * usdcPrice,
        yield: (point.yield || 0) * usdcPrice,
        borrow: (point.borrow || 0) * usdcPrice,
        pool_yieldblox: point.pool_yieldblox ? point.pool_yieldblox * usdcPrice : undefined,
        pool_blend: point.pool_blend ? point.pool_blend * usdcPrice : undefined,
        pools: point.pools.map(pool => ({
          ...pool,
          balance: pool.balance * usdcPrice,
          deposit: pool.deposit * usdcPrice,
          yield: pool.yield * usdcPrice,
          borrow: (pool.borrow || 0) * usdcPrice,
        })),
      }))
    }

    // Fallback: transform wallet chart data
    return activeChartData.map(point => {
      const date = new Date(point.date)
      return {
        date: point.date,
        formattedDate: date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        timestamp: date.getTime(),
        total: Number(point.balance) || 0, // Already in USD from SDK
        deposit: Number(point.deposit) || 0,
        yield: Number(point.yield) || 0,
        borrow: 0,
        pools: [],
      }
    })
  }, [historyChartData, activeChartData, usdcPrice])

  // Calculate current total borrow from the latest chart data
  const currentBorrow = useMemo(() => {
    if (displayChartData.length === 0) return 0
    const latestData = displayChartData[displayChartData.length - 1]
    return latestData.borrow || 0
  }, [displayChartData])

  const { displayBalance } = useLiveBalance(initialBalance, apyDecimal, null, 0)

  // Fetch user actions for event markers
  const { actions: userActions } = useUserActions({
    publicKey: publicKey || '',
    limit: 100,
    enabled: !!publicKey && !isDemoMode,
  })

  // Use yield calculated from: SDK Balance - Dune Cost Basis
  const liveGrowthAmount = activeData.rawInterestEarned

  // Get first event date from history data
  const firstEventDate = useMemo(() => {
    if (displayChartData.length === 0) return null
    return displayChartData[0].date
  }, [displayChartData])

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
  const percentageGain = activeData.growthPercentage
  const showPercentageGain = Number.isFinite(percentageGain) && hasSignificantAmount(liveGrowthAmount)

  // Calculate yield projections based on current APY
  const dailyYield = displayBalance * (activeData.apyPercentage / 100) / 365
  const monthlyYield = displayBalance * (activeData.apyPercentage / 100) / 12

  const yieldFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  // Show skeleton while loading (after all hooks are called)
  if (loading) {
    return <WalletBalanceSkeleton />
  }

  return (
    <Card className="@container/card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Current APY from SDK (primary) */}
            {!isDemoMode && hasNonZeroPercentage(activeData.apyPercentage) && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="outline" className="text-sm font-semibold py-1 px-3 whitespace-nowrap">
                      <TrendingUp className="mr-1.5 h-4 w-4" />
                      {formatPercentage(activeData.apyPercentage)}% APY
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Current weighted average APY from pool positions</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {isDemoMode && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="outline" className="text-sm font-semibold py-1 px-3 whitespace-nowrap">
                      <TrendingUp className="mr-1.5 h-4 w-4" />
                      {formatPercentage(DUMMY_DATA.apyPercentage)}% APY
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Demo APY</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {hasNonZeroPercentage(activeData.blndApy) && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="outline" className="text-xs py-0.5 px-2 whitespace-nowrap">
                      <PiggyBank className="mr-1 h-3 w-3" />
                      {formatSignedPercentage(activeData.blndApy)}% BLND APY
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>BLND emissions APY across supplied positions</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          {onToggleDemoMode && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleDemoMode}
              className="h-8 w-8 p-0"
              title={isDemoMode ? "Show real data" : "Show demo data"}
            >
              {isDemoMode ? (
                <Eye className="h-4 w-4" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl @[400px]/card:text-4xl">
            <FormattedBalance value={formattedLiveBalance} />
          </CardTitle>
          {!isDemoMode && currentBorrow > 0 && (
            <Badge variant="outline" className="text-xs py-0.5 px-2 whitespace-nowrap bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800">
              <TrendingDown className="mr-1 h-3 w-3" />
              ${currentBorrow.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} borrowed
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {!isDemoMode && balanceHistoryData?.earningsStats?.currentAPY && balanceHistoryData.earningsStats.currentAPY > 0 ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    {formattedLiveGrowth} yield
                    {showPercentageGain && (
                      <span className="ml-1">
                        ({formatSignedPercentage(percentageGain)}%)
                      </span>
                    )}
                  </p>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Realized APY: {formatPercentage(balanceHistoryData.earningsStats.currentAPY)}%</p>
                  <p className="text-xs opacity-75">Over {balanceHistoryData.earningsStats.dayCount} days</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              {formattedLiveGrowth} yield
              {showPercentageGain && (
                <span className="ml-1">
                  ({formatSignedPercentage(percentageGain)}%)
                </span>
              )}
            </p>
          )}
          {/* Pending BLND emissions claimable */}
          {(pendingEmissions > 0 || (isDemoMode && DUMMY_DATA.apyPercentage > 0)) && (() => {
            const emissions = isDemoMode ? 125.45 : pendingEmissions;
            const price = isDemoMode ? 0.10 : blndPrice;
            const usdValue = price && emissions ? emissions * price : null;
            return (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="secondary" className="text-xs py-0.5 px-2 whitespace-nowrap bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                      <Gift className="mr-1 h-3 w-3" />
                      {emissions.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} BLND
                      {usdValue !== null && (
                        <span className="ml-1 opacity-75">
                          (~${usdValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                        </span>
                      )}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Pending BLND emissions available to claim</p>
                    {price && <p className="text-xs opacity-75">BLND price: ${price.toFixed(4)}</p>}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })()}
        </div>
      </CardHeader>

      <CardContent>
        <BalanceBarChart
          historyData={displayChartData}
          userActions={userActions}
          currentBalance={displayBalance}
          apy={activeData.apyPercentage}
          firstEventDate={firstEventDate}
          isLoading={loading}
        />
      </CardContent>

      <Separator />

      <CardFooter className="flex flex-col @[350px]/card:flex-row items-stretch gap-2 @[350px]/card:gap-4">
        <div className="flex flex-1 flex-row @[350px]/card:flex-col gap-2 @[350px]/card:gap-0.5 py-2 justify-between @[350px]/card:justify-start">
          <div className="text-[10px] @[250px]/card:text-xs text-muted-foreground">Daily Yield</div>
          <div className="text-sm @[250px]/card:text-base font-semibold tabular-nums">
            {yieldFormatter.format(dailyYield)}
          </div>
        </div>

        <Separator orientation="horizontal" className="@[350px]/card:hidden" />
        <Separator orientation="vertical" className="self-stretch hidden @[350px]/card:block" />

        <div className="flex flex-1 flex-row @[350px]/card:flex-col gap-2 @[350px]/card:gap-0.5 py-2 justify-between @[350px]/card:justify-start">
          <div className="text-[10px] @[250px]/card:text-xs text-muted-foreground">Monthly Yield</div>
          <div className="text-sm @[250px]/card:text-base font-semibold tabular-nums">
            {yieldFormatter.format(monthlyYield)}
          </div>
        </div>

        <Separator orientation="horizontal" className="@[350px]/card:hidden" />
        <Separator orientation="vertical" className="self-stretch hidden @[350px]/card:block" />

        <div className="flex flex-1 flex-row @[350px]/card:flex-col gap-2 @[350px]/card:gap-0.5 py-2 justify-between @[350px]/card:justify-start">
          <div className="text-[10px] @[250px]/card:text-xs text-muted-foreground">Annual Yield</div>
          <div className="text-sm @[250px]/card:text-base font-semibold tabular-nums">
            ${activeData.annualYield}
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
    prevProps.data.blndApy === nextProps.data.blndApy &&
    prevProps.data.rawInterestEarned === nextProps.data.rawInterestEarned &&
    prevProps.publicKey === nextProps.publicKey &&
    prevProps.balanceHistoryData === nextProps.balanceHistoryData &&
    prevProps.loading === nextProps.loading &&
    prevProps.isDemoMode === nextProps.isDemoMode &&
    prevProps.pendingEmissions === nextProps.pendingEmissions &&
    prevProps.blndPrice === nextProps.blndPrice &&
    prevProps.usdcPrice === nextProps.usdcPrice
  )
})
