"use client"

import * as React from "react"
import { useEffect, useMemo, useState } from "react"
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
import type { ChartDataPoint, TimePeriod } from "@/types/balance-history"
import { useLiveBalance } from "@/hooks/use-live-balance"
import { useUserActions } from "@/hooks/use-user-actions"
import { FormattedBalance } from "@/components/formatted-balance"
import { useCurrencyPreference } from "@/hooks/use-currency-preference"
import { useDisplayPreferences } from "@/contexts/display-preferences-context"
import { usePeriodYieldBreakdownAPI } from "@/hooks/use-period-yield-breakdown-api"
import type { PeriodType as APIPeriodType } from "@/app/api/period-yield-breakdown/route"
import type { WalletBalanceProps } from "./types"
import { formatPercentage, formatSignedPercentage, hasNonZeroPercentage, hasSignificantAmount } from "./helpers"
import { SELECTED_PERIOD_KEY } from "./constants"
import { WalletBalanceSkeleton } from "./skeleton"

const BalanceBarChart = dynamic(
  () => import("@/components/balance-bar-chart").then(mod => ({ default: mod.BalanceBarChart })),
  {
    loading: () => <Skeleton className="aspect-[2/1] md:aspect-[7/2] w-full" />,
    ssr: false
  }
)

const WalletBalanceComponent = ({ data, chartData, publicKey, balanceHistoryData, loading, usdcPrice = 1, poolInputs = [], yieldBreakdown, balanceHistoryDataMap, historicalPrices, blendPositions, backstopPositions, lpTokenPrice, totalBorrowUsd }: WalletBalanceProps) => {
  // State for time period selection with localStorage persistence
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SELECTED_PERIOD_KEY)
      if (saved && ["1W", "1M", "1Y", "All", "Projection"].includes(saved)) {
        return saved as TimePeriod
      }
    }
    return "All"
  })

  // Persist selected period to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SELECTED_PERIOD_KEY, selectedPeriod)
    }
  }, [selectedPeriod])

  // Currency preference for multi-currency display
  const { currency, format: formatInCurrency, convert: convertToCurrency } = useCurrencyPreference()

  // Display preferences (show price changes toggle)
  const { preferences: displayPreferences } = useDisplayPreferences()

  const initialBalance = Number.isFinite(data.rawBalance) ? Math.max(data.rawBalance, 0) : 0
  const apyDecimal = Number.isFinite(data.apyPercentage)
    ? Math.max(data.apyPercentage, 0) / 100
    : 0

  // Use balance history data from props if available
  const historyChartData = balanceHistoryData?.chartData || []

  // Map TimePeriod to API PeriodType for period yield breakdown
  const apiPeriodTypeMap: Record<TimePeriod, APIPeriodType> = {
    "1W": "1W",
    "1M": "1M",
    "1Y": "1Y",
    "All": "All",
    "Projection": "All",
  }

  const periodYieldBreakdownAPI = usePeriodYieldBreakdownAPI({
    userAddress: publicKey,
    period: apiPeriodTypeMap[selectedPeriod],
    blendPositions,
    backstopPositions,
    lpTokenPrice,
    enabled: !!publicKey && (
      (!!blendPositions && blendPositions.length > 0) ||
      (!!backstopPositions && backstopPositions.length > 0)
    ),
  })

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
    return chartData.map(point => {
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
  }, [historyChartData, chartData, usdcPrice])

  // Calculate current total borrow - prefer SDK value (totalBorrowUsd prop) for accuracy
  // Fall back to latest chart data for historical consistency
  const currentBorrow = useMemo(() => {
    // Prefer live SDK value if available
    if (totalBorrowUsd !== undefined && totalBorrowUsd > 0) {
      return totalBorrowUsd
    }
    // Fallback to historical data
    if (displayChartData.length === 0) return 0
    const latestData = displayChartData[displayChartData.length - 1]
    return latestData.borrow || 0
  }, [totalBorrowUsd, displayChartData])

  const { displayBalance, isPaused, togglePause } = useLiveBalance(initialBalance, apyDecimal, null, 0)

  // Fetch user actions for event markers
  const { actions: userActions } = useUserActions({
    publicKey: publicKey || '',
    limit: 100,
    enabled: !!publicKey,
    selectActionsOnly: true, // Only re-render when actions change
  })

  // Use yield calculated from: SDK Balance - Dune Cost Basis
  const totalYield = data.rawInterestEarned

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

  // Period breakdown - use CHART DATA directly (it already has correct values)
  const chartBasedPeriodBreakdown = useMemo(() => {
    if (displayChartData.length === 0) {
      return {
        valueAtStart: 0,
        valueNow: initialBalance,
        protocolYield: totalYield,
        priceChange: 0,
        totalEarned: totalYield,
        periodStartDate: '',
        isLoading: true,
      }
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
        periodStartDate = new Date(displayChartData[0].date)
        break
    }

    // Use local date formatting to match chart data format (avoids UTC conversion issues)
    const periodStartStr = `${periodStartDate.getFullYear()}-${String(periodStartDate.getMonth() + 1).padStart(2, '0')}-${String(periodStartDate.getDate()).padStart(2, '0')}`

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

    // Values directly from chart data
    const valueAtStart = chartPointAtStart?.total || 0
    const yieldAtStart = chartPointAtStart?.yield || 0
    const depositAtStart = chartPointAtStart?.deposit || 0
    const valueNow = initialBalance

    // Get current deposit from the latest chart point (or use SDK cost basis)
    const latestPoint = sortedHistory[sortedHistory.length - 1]
    const depositNow = latestPoint?.deposit || depositAtStart

    // Net deposited in period = deposits made during this period
    const netDepositedInPeriod = depositNow - depositAtStart

    // Protocol Yield = current SDK yield - chart yield at period start
    // The chart's yield field is cumulative interest earned, so this gives period interest
    const protocolYield = totalYield - yieldAtStart

    // Total Change = value now - value at start
    const totalChange = valueNow - valueAtStart

    // Price Change = Total Change - Protocol Yield - Net Deposits in Period
    // This isolates the price appreciation/depreciation component
    const priceChange = totalChange - protocolYield - netDepositedInPeriod

    // Total Earned = Protocol Yield + Price Change (excludes deposits)
    const totalEarned = protocolYield + priceChange

    return {
      valueAtStart,
      valueNow,
      protocolYield,
      priceChange,
      totalEarned,
      periodStartDate: chartPointAtStart?.date || periodStartStr,
      isLoading: false,
    }
  }, [displayChartData, selectedPeriod, initialBalance, totalYield])

  // Display yield based on selected period and display preferences
  // When showPriceChanges is OFF, show only protocol yield; when ON, show total (yield + price change)
  const displayYield = useMemo(() => {
    // For periods with API data, use the API values
    if (!periodYieldBreakdownAPI.isLoading && periodYieldBreakdownAPI.totals.valueAtStart > 0) {
      return displayPreferences.showPriceChanges
        ? periodYieldBreakdownAPI.totals.totalEarnedUsd
        : periodYieldBreakdownAPI.totals.protocolYieldUsd
    }
    // Secondary fallback: use yieldBreakdown prop if available (for All Time)
    if (yieldBreakdown && yieldBreakdown.totalCostBasisHistorical > 0) {
      return displayPreferences.showPriceChanges
        ? yieldBreakdown.totalEarnedUsd
        : yieldBreakdown.totalProtocolYieldUsd
    }
    // Final fallback to chart-based calculation (only has total, not breakdown)
    return calculatedPeriodYield
  }, [periodYieldBreakdownAPI.isLoading, periodYieldBreakdownAPI.totals, calculatedPeriodYield, displayPreferences.showPriceChanges, yieldBreakdown])

  // Protocol yield only for chart bars (not affected by showPriceChanges setting)
  // Historical bars show protocol yield, so current month should match
  const chartProtocolYield = useMemo(() => {
    // For periods with API data, use protocol yield only
    if (!periodYieldBreakdownAPI.isLoading && periodYieldBreakdownAPI.totals.valueAtStart > 0) {
      return periodYieldBreakdownAPI.totals.protocolYieldUsd
    }
    // Secondary fallback: use yieldBreakdown prop if available
    if (yieldBreakdown && yieldBreakdown.totalCostBasisHistorical > 0) {
      return yieldBreakdown.totalProtocolYieldUsd
    }
    // Final fallback to chart-based calculation
    return calculatedPeriodYield
  }, [periodYieldBreakdownAPI.isLoading, periodYieldBreakdownAPI.totals, calculatedPeriodYield, yieldBreakdown])

  // Derive cost basis from SDK: costBasis = totalYield / (growthPercentage / 100)
  const costBasis = useMemo(() => {
    if (!Number.isFinite(totalYield) || !Number.isFinite(data.growthPercentage) || data.growthPercentage === 0) {
      return initialBalance // Fallback to current balance if we can't derive cost basis
    }
    return totalYield / (data.growthPercentage / 100)
  }, [totalYield, data.growthPercentage, initialBalance])

  // Calculate period-specific percentage gain
  // All periods use: periodYield / costBasis * 100
  // This ensures consistency - when all data is within 1Y, "All" and "1Y" show same percentage
  // When showPriceChanges is OFF, show only protocol yield percentage
  const periodPercentageGain = useMemo(() => {
    // For periods with API data, use the API's percentage
    if (!periodYieldBreakdownAPI.isLoading && periodYieldBreakdownAPI.totals.valueAtStart > 0) {
      if (displayPreferences.showPriceChanges) {
        return periodYieldBreakdownAPI.totals.totalEarnedPercent
      }
      // Calculate yield-only percentage
      const valueAtStart = periodYieldBreakdownAPI.totals.valueAtStart
      if (valueAtStart > 0) {
        return (periodYieldBreakdownAPI.totals.protocolYieldUsd / valueAtStart) * 100
      }
      return 0
    }

    // Secondary fallback: use yieldBreakdown prop if available (for All Time)
    if (yieldBreakdown && yieldBreakdown.totalCostBasisHistorical > 0) {
      if (displayPreferences.showPriceChanges) {
        return (yieldBreakdown.totalEarnedUsd / yieldBreakdown.totalCostBasisHistorical) * 100
      }
      return (yieldBreakdown.totalProtocolYieldUsd / yieldBreakdown.totalCostBasisHistorical) * 100
    }

    if (costBasis <= 0) {
      return 0
    }

    // For "All" and "Projection", use SDK's growthPercentage directly (most precise)
    if (selectedPeriod === "All" || selectedPeriod === "Projection") {
      return data.growthPercentage
    }

    // For sub-periods, calculate: periodYield / costBasis * 100
    if (!Number.isFinite(calculatedPeriodYield)) {
      return 0
    }

    return (calculatedPeriodYield / costBasis) * 100
  }, [selectedPeriod, calculatedPeriodYield, data.growthPercentage, costBasis, periodYieldBreakdownAPI.isLoading, periodYieldBreakdownAPI.totals, displayPreferences.showPriceChanges, yieldBreakdown])

  // Get period label for yield display
  // When showPriceChanges is OFF, show "yield" instead of "total"
  const periodLabel = useMemo(() => {
    const labels = {
      "1W": "week",
      "1M": "month",
      "1Y": "year",
      "All": displayPreferences.showPriceChanges ? "total" : "yield",
      "Projection": displayPreferences.showPriceChanges ? "total" : "yield",
    }
    return labels[selectedPeriod]
  }, [selectedPeriod, displayPreferences.showPriceChanges])

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

  // Check if we're loading period-specific data for a period that requires API
  // When loading, we don't want to show the all-time fallback value
  const isLoadingPeriodData = (selectedPeriod !== "All" && selectedPeriod !== "Projection") && periodYieldBreakdownAPI.isLoading

  // Use period-specific percentage gain instead of total percentage
  const percentageGain = periodPercentageGain
  const showPercentageGain = Number.isFinite(percentageGain) && hasSignificantAmount(displayYield)

  // Calculate yield projections based on current APY
  // APY is already the effective annual rate (accounts for compounding)
  // To get sub-annual yields, we extract the equivalent periodic rate from the APY
  // Use initialBalance (stable SDK value) for calculations, not displayBalance (animated)
  const apyDecimalRate = data.apyPercentage / 100
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
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Current APY from SDK (primary) */}
          {hasNonZeroPercentage(data.apyPercentage) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="text-xs py-0.5 px-2 whitespace-nowrap bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600">
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
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <h3
            className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl @[400px]/card:text-4xl cursor-pointer select-none"
            onDoubleClick={togglePause}
            title={isPaused ? "Double-click to resume live updates" : "Double-click to pause live updates"}
          >
            <FormattedBalance value={formattedLiveBalance} />
          </h3>
          {currentBorrow > 0 && (
            <Badge variant="outline" className="text-xs py-0.5 px-2 whitespace-nowrap bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800">
              <TrendingDown className="mr-1 h-3 w-3" />
              {formatYield(currentBorrow)} borrowed
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {isLoadingPeriodData ? (
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-12" />
            </div>
          ) : (
            (balanceHistoryData?.earningsStats?.currentAPY && balanceHistoryData.earningsStats.currentAPY > 0) ||
            (!periodYieldBreakdownAPI.isLoading && periodYieldBreakdownAPI.totals.valueNow > 0) ||
            (backstopPositions && backstopPositions.some(bp => bp.lpTokens > 0))
          ) ? (
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
                  {periodYieldBreakdownAPI.isFetching ? (
                    <div className="space-y-2 w-40">
                      <Skeleton className="h-3 w-24" />
                      <div className="space-y-1.5">
                        <div className="flex justify-between gap-4">
                          <Skeleton className="h-2.5 w-12" />
                          <Skeleton className="h-2.5 w-14" />
                        </div>
                        <div className="flex justify-between gap-4">
                          <Skeleton className="h-2.5 w-16" />
                          <Skeleton className="h-2.5 w-14" />
                        </div>
                        <div className="border-t border-zinc-700 pt-1 flex justify-between gap-4">
                          <Skeleton className="h-2.5 w-10" />
                          <Skeleton className="h-2.5 w-14" />
                        </div>
                      </div>
                    </div>
                  ) : !periodYieldBreakdownAPI.isLoading && periodYieldBreakdownAPI.totals.valueNow > 0 ? (
                    <div className="space-y-1.5 text-[11px]">
                      <div className="font-semibold text-xs text-zinc-200 mb-2">
                        Breakdown ({selectedPeriod === "All" ? "All Time" : selectedPeriod})
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-zinc-400">Yield:</span>
                        <span className={periodYieldBreakdownAPI.totals.protocolYieldUsd >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {formatInCurrency(periodYieldBreakdownAPI.totals.protocolYieldUsd, { showSign: true })}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-zinc-400">Price Change:</span>
                        <span className={periodYieldBreakdownAPI.totals.priceChangeUsd >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {formatInCurrency(periodYieldBreakdownAPI.totals.priceChangeUsd, { showSign: true })}
                        </span>
                      </div>
                      <div className="border-t border-zinc-700 pt-1 flex justify-between gap-4 font-medium">
                        <span className="text-zinc-300">Total:</span>
                        <span className={periodYieldBreakdownAPI.totals.totalEarnedUsd >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {formatInCurrency(periodYieldBreakdownAPI.totals.totalEarnedUsd, { showSign: true })}
                        </span>
                      </div>
                      {periodYieldBreakdownAPI.periodDays > 0 && (
                        <div className="border-t border-zinc-700 pt-1 flex justify-between gap-4">
                          <span className="text-zinc-400">Yield APY:</span>
                          <span className="text-zinc-300">
                            {(() => {
                              // 1. Use supply APY if available and > 0 (for "All" or "Projection")
                              if ((selectedPeriod === "All" || selectedPeriod === "Projection") &&
                                  balanceHistoryData?.earningsStats?.currentAPY &&
                                  balanceHistoryData.earningsStats.currentAPY > 0) {
                                return formatPercentage(balanceHistoryData.earningsStats.currentAPY)
                              }
                              // 2. For other periods: if periodDays covers all user data, use pre-calculated APY for consistency
                              const totalDays = balanceHistoryData?.earningsStats?.dayCount || 0
                              if (totalDays > 0 && periodYieldBreakdownAPI.periodDays >= totalDays &&
                                  balanceHistoryData?.earningsStats?.currentAPY &&
                                  balanceHistoryData.earningsStats.currentAPY > 0) {
                                return formatPercentage(balanceHistoryData.earningsStats.currentAPY)
                              }
                              // 3. Calculate from API data using valueAtStart (balance at period start)
                              const valueAtStart = periodYieldBreakdownAPI.totals.valueAtStart
                              if (valueAtStart > 0 && periodYieldBreakdownAPI.totals.protocolYieldUsd !== 0) {
                                const apy = (periodYieldBreakdownAPI.totals.protocolYieldUsd / valueAtStart) * (365 / periodYieldBreakdownAPI.periodDays) * 100
                                return formatPercentage(apy)
                              }
                              // 4. Fallback: derive cost basis from current value
                              const costBasis = periodYieldBreakdownAPI.totals.valueNow - periodYieldBreakdownAPI.totals.totalEarnedUsd
                              if (costBasis > 0 && periodYieldBreakdownAPI.totals.protocolYieldUsd !== 0) {
                                const apy = (periodYieldBreakdownAPI.totals.protocolYieldUsd / costBasis) * (365 / periodYieldBreakdownAPI.periodDays) * 100
                                return formatPercentage(apy)
                              }
                              // 5. Use yieldBreakdown cost basis if available
                              if (yieldBreakdown?.totalCostBasisHistorical && yieldBreakdown.totalCostBasisHistorical > 0) {
                                const apy = (periodYieldBreakdownAPI.totals.protocolYieldUsd / yieldBreakdown.totalCostBasisHistorical) * (365 / periodYieldBreakdownAPI.periodDays) * 100
                                return apy.toFixed(2)
                              }
                              return "0.00"
                            })()}%
                          </span>
                        </div>
                      )}
                      <p className="text-[10px] text-zinc-500 pt-1">
                        Over {periodYieldBreakdownAPI.periodDays} days{periodYieldBreakdownAPI.periodStartDate && ` (from ${periodYieldBreakdownAPI.periodStartDate})`}
                      </p>
                    </div>
                  ) : yieldBreakdown && yieldBreakdown.totalCostBasisHistorical > 0 ? (
                    <div className="space-y-1.5 text-[11px]">
                      <div className="font-semibold text-xs text-zinc-200 mb-2">Breakdown (All Time)</div>
                      <div className="flex justify-between gap-4">
                        <span className="text-zinc-400">Yield:</span>
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
                        <span className="text-zinc-300">Total:</span>
                        <span className={yieldBreakdown.totalEarnedUsd >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {formatInCurrency(yieldBreakdown.totalEarnedUsd, { showSign: true })}
                        </span>
                      </div>
                      {actualPeriodDays > 0 && (
                        <div className="border-t border-zinc-700 pt-1 flex justify-between gap-4">
                          <span className="text-zinc-400">Yield APY:</span>
                          <span className="text-zinc-300">
                            {balanceHistoryData?.earningsStats?.currentAPY !== undefined
                              ? formatPercentage(balanceHistoryData.earningsStats.currentAPY)
                              : yieldBreakdown.totalCostBasisHistorical > 0
                                ? ((yieldBreakdown.totalProtocolYieldUsd / yieldBreakdown.totalCostBasisHistorical) * (365 / actualPeriodDays) * 100).toFixed(2)
                                : "0.00"}%
                          </span>
                        </div>
                      )}
                      <div className="border-t border-zinc-700 pt-1 text-zinc-500">
                        <div className="flex justify-between gap-4">
                          <span>Cost Basis:</span>
                          <span className="text-zinc-300">{formatInCurrency(yieldBreakdown.totalCostBasisHistorical)}</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-zinc-500 pt-1">
                        Over {actualPeriodDays} days
                      </p>
                    </div>
                  ) : backstopPositions && backstopPositions.length > 0 && backstopPositions.some(bp => bp.lpTokens > 0) ? (
                    <div className="space-y-1.5 text-[11px]">
                      <div className="font-medium text-zinc-400 border-b border-zinc-700 pb-1">Backstop Position</div>
                      {backstopPositions.filter(bp => bp.lpTokens > 0).map(bp => (
                        <div key={bp.poolId} className="space-y-1">
                          <div className="flex justify-between gap-4">
                            <span className="text-zinc-400">{bp.poolName}:</span>
                            <span className="text-zinc-300">{formatInCurrency(bp.lpTokensUsd)}</span>
                          </div>
                          <div className="flex justify-between gap-4 pl-2">
                            <span className="text-zinc-500">Interest APR:</span>
                            <span className="text-emerald-400">{formatPercentage(bp.interestApr)}%</span>
                          </div>
                          <div className="flex justify-between gap-4 pl-2">
                            <span className="text-zinc-500">BLND Emissions:</span>
                            <span className="text-emerald-400">{formatPercentage(bp.emissionApy)}%</span>
                          </div>
                          {bp.yieldPercent !== undefined && bp.yieldPercent > 0 && (
                            <div className="flex justify-between gap-4 pl-2">
                              <span className="text-zinc-500">Total Yield:</span>
                              <span className="text-emerald-400">+{formatPercentage(bp.yieldPercent)}%</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <p>Yield APY: {formatPercentage(balanceHistoryData?.earningsStats?.currentAPY ?? 0)}%</p>
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
          currentDeposit={initialBalance - chartProtocolYield}
          currentBorrow={currentBorrow}
          apy={data.apyPercentage}
          blndApy={data.blndApy}
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
    prevProps.usdcPrice === nextProps.usdcPrice &&
    prevProps.poolInputs === nextProps.poolInputs
  )
})
