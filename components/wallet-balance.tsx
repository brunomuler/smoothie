"use client"

import * as React from "react"
import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { TrendingUp, TrendingDown, Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import type { BalanceData, ChartDataPoint as WalletChartDataPoint } from "@/types/wallet-balance"
import type { ChartDataPoint, EarningsStats, PositionChange, TimePeriod } from "@/types/balance-history"
import type { PoolProjectionInput } from "@/lib/chart-utils"
import { useLiveBalance } from "@/hooks/use-live-balance"
import { useUserActions } from "@/hooks/use-user-actions"
import { FormattedBalance } from "@/components/formatted-balance"
import { CurrencySelector } from "@/components/currency-selector"
import { useCurrencyPreference } from "@/hooks/use-currency-preference"
import { usePeriodYieldBreakdown, type PeriodType } from "@/hooks/use-period-yield-breakdown"
import type { ChartHistoricalPrices } from "@/hooks/use-chart-historical-prices"
import type { UserBalance } from "@/lib/db/types"

const BalanceBarChart = dynamic(
  () => import("@/components/balance-bar-chart").then(mod => ({ default: mod.BalanceBarChart })),
  {
    loading: () => <Skeleton className="aspect-[2/1] md:aspect-[7/2] w-full" />,
    ssr: false
  }
)

export interface YieldBreakdownTotals {
  totalProtocolYieldUsd: number
  totalPriceChangeUsd: number
  totalCostBasisHistorical: number
  totalEarnedUsd: number
}

// Type for balance history data map entry (rawData is unknown[] from the hook)
interface BalanceHistoryDataEntry {
  rawData: unknown[]
  chartData: Array<{ date: string }>
}

// Type for blend positions
interface BlendPosition {
  id: string
  supplyAmount: number
  price?: { usdPrice?: number } | null
  assetId?: string
}

// Type for backstop positions
interface BackstopPosition {
  poolId: string
  lpTokens: number
}

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
  usdcPrice?: number // USDC price from SDK oracle for normalizing historical data
  poolInputs?: PoolProjectionInput[] // Per-pool data for projection breakdown
  yieldBreakdown?: YieldBreakdownTotals // Historical yield breakdown (protocol yield vs price change)
  // New props for period-specific breakdown
  balanceHistoryDataMap?: Map<string, BalanceHistoryDataEntry>
  historicalPrices?: ChartHistoricalPrices
  blendPositions?: BlendPosition[]
  backstopPositions?: BackstopPosition[]
  lpTokenPrice?: number | null
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
    <div className="@container/card">
      {/* Header section */}
      <div className="flex flex-col space-y-1.5 pt-6">
        {/* APY badge row */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>

        {/* Balance */}
        <div className="flex items-center gap-2 flex-wrap">
          <Skeleton className="h-8 w-40 @[250px]/card:w-56 @[250px]/card:h-10 @[400px]/card:h-12" />
        </div>

        {/* Yield info */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Skeleton className="h-5 w-28 @[250px]/card:w-36" />
        </div>
      </div>

      {/* Chart section */}
      <div className="pb-6">
        <div className="pt-4">
          {/* Chart area - matches actual chart aspect ratio */}
          <Skeleton className="aspect-[2/1] md:aspect-[7/2] w-full rounded-md" />
          {/* Period selector - centered below chart like actual */}
          <div className="flex justify-center mt-2">
            <Skeleton className="h-9 sm:h-10 w-56 sm:w-64 rounded-md" />
          </div>
        </div>
      </div>

      {/* Stats section */}
      <div className="flex flex-col @[350px]/card:flex-row items-stretch gap-2 @[350px]/card:gap-4 pb-2">
        <div className="flex flex-1 flex-row @[350px]/card:flex-col @[350px]/card:items-center gap-2 @[350px]/card:gap-0.5 py-2 justify-between @[350px]/card:justify-start">
          <Skeleton className="h-3 w-16 @[250px]/card:h-4" />
          <Skeleton className="h-5 w-20 @[250px]/card:h-6" />
        </div>

        <Separator orientation="horizontal" className="@[350px]/card:hidden" />
        <Separator orientation="vertical" className="self-stretch hidden @[350px]/card:block" />

        <div className="flex flex-1 flex-row @[350px]/card:flex-col @[350px]/card:items-center gap-2 @[350px]/card:gap-0.5 py-2 justify-between @[350px]/card:justify-start">
          <Skeleton className="h-3 w-20 @[250px]/card:h-4" />
          <Skeleton className="h-5 w-20 @[250px]/card:h-6" />
        </div>

        <Separator orientation="horizontal" className="@[350px]/card:hidden" />
        <Separator orientation="vertical" className="self-stretch hidden @[350px]/card:block" />

        <div className="flex flex-1 flex-row @[350px]/card:flex-col @[350px]/card:items-center gap-2 @[350px]/card:gap-0.5 py-2 justify-between @[350px]/card:justify-start">
          <Skeleton className="h-3 w-20 @[250px]/card:h-4" />
          <Skeleton className="h-5 w-20 @[250px]/card:h-6" />
        </div>
      </div>
    </div>
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

const WalletBalanceComponent = ({ data, chartData, publicKey, balanceHistoryData, loading, isDemoMode = false, onToggleDemoMode, usdcPrice = 1, poolInputs = [], yieldBreakdown, balanceHistoryDataMap, historicalPrices, blendPositions, backstopPositions, lpTokenPrice }: WalletBalanceProps) => {
  // State for time period selection
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("1M")

  // Currency preference for multi-currency display
  const { currency, setCurrency, format: formatInCurrency, convert: convertToCurrency } = useCurrencyPreference()

  // Use dummy data when in demo mode
  const activeData = isDemoMode ? DUMMY_DATA : data
  const activeChartData = isDemoMode ? DUMMY_CHART_DATA : chartData

  const initialBalance = Number.isFinite(activeData.rawBalance) ? Math.max(activeData.rawBalance, 0) : 0
  const apyDecimal = Number.isFinite(activeData.apyPercentage)
    ? Math.max(activeData.apyPercentage, 0) / 100
    : 0

  // Use balance history data from props if available (not in demo mode)
  const historyChartData = isDemoMode ? [] : (balanceHistoryData?.chartData || [])

  // Map TimePeriod to PeriodType for period yield breakdown
  const periodTypeMap: Record<TimePeriod, PeriodType> = {
    "1W": "1W",
    "1M": "1M",
    "1Y": "1Y",
    "All": "All",
    "Projection": "All", // Projection uses all-time data
  }

  // Calculate period-specific yield breakdown
  const periodYieldBreakdown = usePeriodYieldBreakdown(
    periodTypeMap[selectedPeriod],
    balanceHistoryDataMap || new Map(),
    historicalPrices || { prices: new Map(), getPrice: () => 0, hasHistoricalData: false, isLoading: true, error: null },
    blendPositions,
    backstopPositions,
    lpTokenPrice,
  )

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

  const { displayBalance, isPaused, togglePause } = useLiveBalance(initialBalance, apyDecimal, null, 0)

  // Fetch user actions for event markers
  const { actions: userActions } = useUserActions({
    publicKey: publicKey || '',
    limit: 100,
    enabled: !!publicKey && !isDemoMode,
    selectActionsOnly: true, // Only re-render when actions change
  })

  // Use yield calculated from: SDK Balance - Dune Cost Basis
  const totalYield = activeData.rawInterestEarned

  // Get first event date from history data
  const firstEventDate = useMemo(() => {
    if (displayChartData.length === 0) return null
    return displayChartData[0].date
  }, [displayChartData])

  // Calculate period yield using: SDK Total Yield - Historical Yield at Period Start
  // This uses SDK's accurate current total and subtracts the historical yield
  const calculatedPeriodYield = useMemo(() => {
    if (displayChartData.length === 0) return totalYield

    // Format date to local YYYY-MM-DD string
    const formatLocalDate = (date: Date): string => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    // Get period start date
    const today = new Date()
    let periodStartDate: Date

    switch (selectedPeriod) {
      case "1W":
        periodStartDate = new Date(today)
        periodStartDate.setDate(periodStartDate.getDate() - 7)
        break
      case "1M":
        periodStartDate = new Date(today)
        periodStartDate.setDate(periodStartDate.getDate() - 30)
        break
      case "1Y":
        periodStartDate = new Date(today)
        periodStartDate.setFullYear(periodStartDate.getFullYear() - 1)
        break
      default:
        // For All and Projection, use total yield
        return totalYield
    }

    const periodStartStr = formatLocalDate(periodStartDate)

    // Find the yield value at or before the period start
    const sortedHistory = [...displayChartData].sort((a, b) => a.date.localeCompare(b.date))
    let yieldAtPeriodStart = 0

    for (const point of sortedHistory) {
      if (point.date <= periodStartStr) {
        yieldAtPeriodStart = point.yield || 0
      } else {
        break
      }
    }

    // Period Yield = SDK Total Yield - Historical Yield at Start
    return totalYield - yieldAtPeriodStart
  }, [displayChartData, selectedPeriod, totalYield])

  // Calculate period breakdown from chart data (matches chart exactly)
  const chartBasedPeriodBreakdown = useMemo(() => {
    if (displayChartData.length === 0) {
      return {
        valueAtStart: 0,
        valueNow: initialBalance,
        protocolYield: totalYield,
        priceChange: 0,
        totalEarned: totalYield,
        netPeriodDeposits: 0,
        periodStartDate: '',
        isLoading: true,
      }
    }

    // Format date to local YYYY-MM-DD string
    const formatLocalDate = (date: Date): string => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    // Get period start date
    const today = new Date()
    let periodStartDate: Date

    switch (selectedPeriod) {
      case "1W":
        periodStartDate = new Date(today)
        periodStartDate.setDate(periodStartDate.getDate() - 7)
        break
      case "1M":
        periodStartDate = new Date(today)
        periodStartDate.setDate(periodStartDate.getDate() - 30)
        break
      case "1Y":
        periodStartDate = new Date(today)
        periodStartDate.setFullYear(periodStartDate.getFullYear() - 1)
        break
      default:
        // For All and Projection, use first data point
        periodStartDate = new Date(displayChartData[0].date)
        break
    }

    const periodStartStr = formatLocalDate(periodStartDate)

    // Find the chart point at or before the period start
    const sortedHistory = [...displayChartData].sort((a, b) => a.date.localeCompare(b.date))
    let chartPointAtStart = sortedHistory[0]

    for (const point of sortedHistory) {
      if (point.date <= periodStartStr) {
        chartPointAtStart = point
      } else {
        break
      }
    }

    // Values from chart data
    const valueAtStart = chartPointAtStart?.total || 0
    const yieldAtStart = chartPointAtStart?.yield || 0
    const depositAtStart = chartPointAtStart?.deposit || 0
    const valueNow = initialBalance

    // Get current cumulative deposit from latest chart point
    const latestChartPoint = sortedHistory[sortedHistory.length - 1]
    const depositNow = latestChartPoint?.deposit || 0

    // Protocol Yield = current total yield - yield at period start
    const protocolYield = totalYield - yieldAtStart

    // Net Deposits during period = deposits made minus withdrawals
    // (deposit field tracks cumulative net deposits)
    const netPeriodDeposits = depositNow - depositAtStart

    // Total Change = Value Now - Value at Start (includes everything)
    const totalChange = valueNow - valueAtStart

    // Total Earned = Total Change minus net deposits (actual gains only)
    const totalEarned = totalChange - netPeriodDeposits

    // Price Change = Total Earned - Protocol Yield
    const priceChange = totalEarned - protocolYield

    console.log('[ChartBasedPeriodBreakdown]', {
      period: selectedPeriod,
      periodStartStr,
      chartPointDate: chartPointAtStart?.date,
      valueAtStart,
      yieldAtStart,
      depositAtStart,
      depositNow,
      valueNow,
      totalYield,
      protocolYield,
      netPeriodDeposits,
      totalChange,
      totalEarned,
      priceChange,
    })

    return {
      valueAtStart,
      valueNow,
      protocolYield,
      priceChange,
      totalEarned,
      netPeriodDeposits,
      periodStartDate: chartPointAtStart?.date || periodStartStr,
      isLoading: false,
    }
  }, [displayChartData, selectedPeriod, initialBalance, totalYield])

  // Display yield based on selected period
  const displayYield = calculatedPeriodYield

  // Derive cost basis from SDK: costBasis = totalYield / (growthPercentage / 100)
  const costBasis = useMemo(() => {
    if (!Number.isFinite(totalYield) || !Number.isFinite(activeData.growthPercentage) || activeData.growthPercentage === 0) {
      return initialBalance // Fallback to current balance if we can't derive cost basis
    }
    return totalYield / (activeData.growthPercentage / 100)
  }, [totalYield, activeData.growthPercentage, initialBalance])

  // Calculate period-specific percentage gain
  // All periods use: periodYield / costBasis * 100
  // This ensures consistency - when all data is within 1Y, "All" and "1Y" show same percentage
  const periodPercentageGain = useMemo(() => {
    if (costBasis <= 0) {
      return 0
    }

    // For "All" and "Projection", use SDK's growthPercentage directly (most precise)
    if (selectedPeriod === "All" || selectedPeriod === "Projection") {
      return activeData.growthPercentage
    }

    // For sub-periods, calculate: periodYield / costBasis * 100
    if (!Number.isFinite(calculatedPeriodYield)) {
      return 0
    }

    return (calculatedPeriodYield / costBasis) * 100
  }, [selectedPeriod, calculatedPeriodYield, activeData.growthPercentage, costBasis])

  // Get period label for yield display
  const periodLabel = {
    "1W": "week",
    "1M": "month",
    "1Y": "year",
    "All": "total",
    "Projection": "total",
  }[selectedPeriod]

  // Calculate actual period days for tooltip (limited by first activity date)
  const actualPeriodDays = useMemo(() => {
    // Get the days since first activity
    const totalDays = balanceHistoryData?.earningsStats?.dayCount || 0
    if (totalDays === 0) return 0

    // Get the period days based on selection
    let periodDays: number
    switch (selectedPeriod) {
      case "1W":
        periodDays = 7
        break
      case "1M":
        periodDays = 30
        break
      case "1Y":
        periodDays = 365
        break
      default:
        // For All and Projection, use total days
        return totalDays
    }

    // Return the minimum of period days and total days since first activity
    return Math.min(periodDays, totalDays)
  }, [selectedPeriod, balanceHistoryData?.earningsStats?.dayCount])

  const formattedLiveBalance = formatInCurrency(displayBalance, {
    minimumFractionDigits: 7,
    maximumFractionDigits: 7,
  })
  const formattedLiveGrowth = formatInCurrency(displayYield, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    showSign: true,
  })

  // Use period-specific percentage gain instead of total percentage
  const percentageGain = periodPercentageGain
  const showPercentageGain = Number.isFinite(percentageGain) && hasSignificantAmount(displayYield)

  // Calculate yield projections based on current APY
  // APY is already the effective annual rate (accounts for compounding)
  // To get sub-annual yields, we extract the equivalent periodic rate from the APY
  // Use initialBalance (stable SDK value) for calculations, not displayBalance (animated)
  const apyDecimalRate = activeData.apyPercentage / 100
  // Daily yield: Balance × ((1 + APY)^(1/365) - 1)
  const dailyYield = initialBalance * (Math.pow(1 + apyDecimalRate, 1 / 365) - 1)
  // Monthly yield: Balance × ((1 + APY)^(1/12) - 1)
  const monthlyYield = initialBalance * (Math.pow(1 + apyDecimalRate, 1 / 12) - 1)
  // Annual yield: Balance × APY (APY is already the annual compound rate)
  const annualYieldCompound = initialBalance * apyDecimalRate

  const formatYield = (value: number) => formatInCurrency(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  // Show skeleton while loading (after all hooks are called)
  if (loading) {
    return <WalletBalanceSkeleton />
  }

  return (
    <div className="@container/card">
      <div className="flex flex-col space-y-1.5 pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Current APY from SDK (primary) */}
            {!isDemoMode && hasNonZeroPercentage(activeData.apyPercentage) && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="outline" className="text-xs py-0.5 px-2 whitespace-nowrap bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600">
                      <TrendingUp className="mr-1 h-3 w-3" />
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
                    <Badge variant="outline" className="text-xs py-0.5 px-2 whitespace-nowrap bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600">
                      <TrendingUp className="mr-1 h-3 w-3" />
                      {formatPercentage(DUMMY_DATA.apyPercentage)}% APY
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Demo APY</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <CurrencySelector value={currency} onChange={setCurrency} />
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <h3
            className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl @[400px]/card:text-4xl cursor-pointer select-none"
            onDoubleClick={togglePause}
            title={isPaused ? "Double-click to resume live updates" : "Double-click to pause live updates"}
          >
            <FormattedBalance value={formattedLiveBalance} />
          </h3>
          {!isDemoMode && currentBorrow > 0 && (
            <Badge variant="outline" className="text-xs py-0.5 px-2 whitespace-nowrap bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800">
              <TrendingDown className="mr-1 h-3 w-3" />
              {formatYield(currentBorrow)} borrowed
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {!isDemoMode && balanceHistoryData?.earningsStats?.currentAPY && balanceHistoryData.earningsStats.currentAPY > 0 ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <p className={`text-sm font-medium flex items-center gap-1 ${displayYield >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {formattedLiveGrowth} {periodLabel}
                    {showPercentageGain && (
                      <span className="ml-1">
                        ({formatSignedPercentage(percentageGain)}%)
                      </span>
                    )}
                    <Info className="h-3 w-3" />
                  </p>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs p-2.5">
                  {!chartBasedPeriodBreakdown.isLoading && chartBasedPeriodBreakdown.valueAtStart > 0 ? (
                    <div className="space-y-1.5 text-[11px]">
                      <div className="font-medium text-zinc-400 border-b border-zinc-700 pb-1">
                        Yield Breakdown ({selectedPeriod === "All" ? "All Time" : selectedPeriod})
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-zinc-400">Protocol Yield:</span>
                        <span className={chartBasedPeriodBreakdown.protocolYield >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {formatInCurrency(chartBasedPeriodBreakdown.protocolYield, { showSign: true })}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-zinc-400">Price Change:</span>
                        <span className={chartBasedPeriodBreakdown.priceChange >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {formatInCurrency(chartBasedPeriodBreakdown.priceChange, { showSign: true })}
                        </span>
                      </div>
                      <div className="border-t border-zinc-700 pt-1 flex justify-between gap-4 font-medium">
                        <span className="text-zinc-300">Total Earned:</span>
                        <span className={chartBasedPeriodBreakdown.totalEarned >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {formatInCurrency(chartBasedPeriodBreakdown.totalEarned, { showSign: true })}
                        </span>
                      </div>
                      <div className="border-t border-zinc-700 pt-1 text-zinc-500">
                        <div className="flex justify-between gap-4">
                          <span>Value at Start:</span>
                          <span className="text-zinc-300">{formatInCurrency(chartBasedPeriodBreakdown.valueAtStart)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>Value Now:</span>
                          <span className="text-zinc-300">{formatInCurrency(chartBasedPeriodBreakdown.valueNow)}</span>
                        </div>
                      </div>
                      {selectedPeriod !== "All" && selectedPeriod !== "Projection" && (
                        <p className="text-[10px] text-zinc-500 pt-1">
                          From {chartBasedPeriodBreakdown.periodStartDate}
                        </p>
                      )}
                    </div>
                  ) : yieldBreakdown && yieldBreakdown.totalCostBasisHistorical > 0 ? (
                    <div className="space-y-1.5 text-[11px]">
                      <div className="font-medium text-zinc-400 border-b border-zinc-700 pb-1">Yield Breakdown (All Time)</div>
                      <div className="flex justify-between gap-4">
                        <span className="text-zinc-400">Protocol Yield:</span>
                        <span className={yieldBreakdown.totalProtocolYieldUsd >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {formatInCurrency(yieldBreakdown.totalProtocolYieldUsd, { showSign: true })}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-zinc-400">Price Change:</span>
                        <span className={yieldBreakdown.totalPriceChangeUsd >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {formatInCurrency(yieldBreakdown.totalPriceChangeUsd, { showSign: true })}
                        </span>
                      </div>
                      <div className="border-t border-zinc-700 pt-1 flex justify-between gap-4 font-medium">
                        <span className="text-zinc-300">Total Earned:</span>
                        <span className={yieldBreakdown.totalEarnedUsd >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {formatInCurrency(yieldBreakdown.totalEarnedUsd, { showSign: true })}
                        </span>
                      </div>
                      <div className="border-t border-zinc-700 pt-1 text-zinc-500">
                        <div className="flex justify-between gap-4">
                          <span>Cost Basis:</span>
                          <span className="text-zinc-300">{formatInCurrency(yieldBreakdown.totalCostBasisHistorical)}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p>Realized APY: {formatPercentage(balanceHistoryData.earningsStats.currentAPY)}%</p>
                      <p className="text-[10px] text-zinc-500">Over {actualPeriodDays} days</p>
                    </>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <p className={`text-sm font-medium ${displayYield >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {formattedLiveGrowth} {periodLabel}
              {showPercentageGain && (
                <span className="ml-1">
                  ({formatSignedPercentage(percentageGain)}%)
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="pb-6">
        <BalanceBarChart
          historyData={displayChartData}
          userActions={userActions}
          currentBalance={initialBalance}
          apy={activeData.apyPercentage}
          blndApy={activeData.blndApy}
          firstEventDate={firstEventDate}
          isLoading={loading}
          selectedPeriod={selectedPeriod}
          onPeriodChange={setSelectedPeriod}
          poolInputs={poolInputs}
        />
      </div>

      <div className="flex flex-col @[350px]/card:flex-row items-stretch gap-2 @[350px]/card:gap-4 pb-2">
        <div className="flex flex-1 flex-row @[350px]/card:flex-col @[350px]/card:items-center gap-2 @[350px]/card:gap-0.5 py-2 justify-between @[350px]/card:justify-start">
          <div className="text-[10px] @[250px]/card:text-xs text-muted-foreground">Daily Yield</div>
          <div className="text-sm @[250px]/card:text-base font-semibold tabular-nums">
            {formatYield(dailyYield)}
          </div>
        </div>

        <Separator orientation="horizontal" className="@[350px]/card:hidden" />
        <Separator orientation="vertical" className="self-stretch hidden @[350px]/card:block" />

        <div className="flex flex-1 flex-row @[350px]/card:flex-col @[350px]/card:items-center gap-2 @[350px]/card:gap-0.5 py-2 justify-between @[350px]/card:justify-start">
          <div className="text-[10px] @[250px]/card:text-xs text-muted-foreground">Monthly Yield</div>
          <div className="text-sm @[250px]/card:text-base font-semibold tabular-nums">
            {formatYield(monthlyYield)}
          </div>
        </div>

        <Separator orientation="horizontal" className="@[350px]/card:hidden" />
        <Separator orientation="vertical" className="self-stretch hidden @[350px]/card:block" />

        <div className="flex flex-1 flex-row @[350px]/card:flex-col @[350px]/card:items-center gap-2 @[350px]/card:gap-0.5 py-2 justify-between @[350px]/card:justify-start">
          <div className="text-[10px] @[250px]/card:text-xs text-muted-foreground">Annual Yield</div>
          <div className="text-sm @[250px]/card:text-base font-semibold tabular-nums">
            {formatYield(annualYieldCompound)}
          </div>
        </div>
      </div>
    </div>
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
    prevProps.usdcPrice === nextProps.usdcPrice &&
    prevProps.poolInputs === nextProps.poolInputs
  )
})
