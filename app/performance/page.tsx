"use client"

import { useState, useMemo, Suspense, useEffect } from "react"
import { TrendingUp, TrendingDown, Shield, PiggyBank, Calendar, Wallet, Info } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart"
import { Area, AreaChart, Bar, BarChart, XAxis, YAxis } from "recharts"
import { useRealizedYield } from "@/hooks/use-realized-yield"
import { useBlendPositions } from "@/hooks/use-blend-positions"
import { useCurrencyPreference } from "@/hooks/use-currency-preference"
import { useDisplayPreferences } from "@/contexts/display-preferences-context"
import { useHistoricalYieldBreakdown } from "@/hooks/use-historical-yield-breakdown"
import { useBalanceHistoryData } from "@/hooks/use-balance-history-data"
import { useComputedBalance } from "@/hooks/use-computed-balance"
import { useChartHistoricalPrices } from "@/hooks/use-chart-historical-prices"
import { useAnalytics } from "@/hooks/use-analytics"
import { LP_TOKEN_ADDRESS } from "@/lib/constants"
import { DashboardLayout } from "@/components/dashboard-layout"
import { LandingPage } from "@/components/landing-page"
import { PageTitle } from "@/components/page-title"
import { useWalletState } from "@/hooks/use-wallet-state"

function formatNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "0.00"
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

// Helper component for labels with info tooltips
function InfoLabel({ label, tooltip, className = "" }: { label: string; tooltip: string; className?: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center gap-1 cursor-help ${className}`}>
            {label}
            <Info className="h-3 w-3 text-muted-foreground/60" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-xs">
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

const chartConfig = {
  cumulativeRealized: {
    label: "Realized P&L",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig

type PnlTab = 'total' | 'realized' | 'unrealized'

function RealizedYieldContent() {
  const { capture } = useAnalytics()
  const [mainChartTab, setMainChartTab] = useState<PnlTab>('total')
  const [sourceChartTab, setSourceChartTab] = useState<PnlTab>('total')
  const [poolChartTab, setPoolChartTab] = useState<PnlTab>('total')
  const { format: formatInCurrency } = useCurrencyPreference()
  const { preferences: displayPreferences } = useDisplayPreferences()
  const showPriceChanges = displayPreferences.showPriceChanges
  const useHistoricalBlndPrices = displayPreferences.useHistoricalBlndPrices

  const {
    wallets,
    activeWallet,
    handleSelectWallet,
    handleConnectWallet,
    handleDisconnect,
    isHydrated,
  } = useWalletState()

  // Track page view
  useEffect(() => {
    capture('page_viewed', { page: 'performance' })
  }, [capture])

  const publicKey = activeWallet?.publicKey

  // Get blend positions for current prices and balances
  const { balanceData: initialBalanceData, assetCards, blndPrice, lpTokenPrice, data: blendSnapshot, backstopPositions, totalBackstopUsd, isLoading: isLoadingPositions, totalEmissions: unclaimedBlndTokens } = useBlendPositions(publicKey)

  // Fetch balance history data for all assets (same as home page)
  const {
    uniqueAssetAddresses,
    balanceHistoryQueries,
    backstopBalanceHistoryQuery,
    poolAssetCostBasisMap,
    balanceHistoryDataMap,
  } = useBalanceHistoryData(publicKey, assetCards, blendSnapshot)

  // Build SDK prices map (as Map for historical prices hook)
  const sdkPricesMap = useMemo(() => {
    const map = new Map<string, number>()
    if (!blendSnapshot?.positions) return map

    blendSnapshot.positions.forEach(pos => {
      if (pos.assetId && pos.price?.usdPrice && pos.price.usdPrice > 0) {
        map.set(pos.assetId, pos.price.usdPrice)
      }
    })

    if (lpTokenPrice && lpTokenPrice > 0) {
      map.set(LP_TOKEN_ADDRESS, lpTokenPrice)
    }

    return map
  }, [blendSnapshot?.positions, lpTokenPrice])

  // Build SDK prices as Record for useRealizedYield
  const sdkPricesRecord = useMemo(() => {
    const record: Record<string, number> = {}
    sdkPricesMap.forEach((value, key) => {
      record[key] = value
    })
    return record
  }, [sdkPricesMap])

  // Extract all unique dates from balance history for historical price lookups
  const chartDates = useMemo(() => {
    const datesSet = new Set<string>()
    balanceHistoryDataMap.forEach((historyData) => {
      historyData.chartData.forEach((point) => {
        datesSet.add(point.date)
      })
    })
    backstopBalanceHistoryQuery.data?.history?.forEach((point) => {
      datesSet.add(point.date)
    })
    return Array.from(datesSet).sort()
  }, [balanceHistoryDataMap, backstopBalanceHistoryQuery.data?.history])

  // Build the full list of token addresses for historical prices
  const allTokenAddresses = useMemo(() => {
    const addresses = [...uniqueAssetAddresses]
    if (backstopPositions.length > 0 && !addresses.includes(LP_TOKEN_ADDRESS)) {
      addresses.push(LP_TOKEN_ADDRESS)
    }
    return addresses
  }, [uniqueAssetAddresses, backstopPositions.length])

  // Fetch historical prices for chart data
  const historicalPrices = useChartHistoricalPrices({
    tokenAddresses: allTokenAddresses,
    dates: chartDates,
    sdkPrices: sdkPricesMap,
    enabled: chartDates.length > 0 && allTokenAddresses.length > 0,
  })

  // Compute derived balance data using same logic as home page
  const { aggregatedHistoryData } = useComputedBalance(
    initialBalanceData,
    assetCards,
    blendSnapshot,
    backstopPositions,
    lpTokenPrice,
    poolAssetCostBasisMap,
    balanceHistoryDataMap,
    balanceHistoryQueries,
    backstopBalanceHistoryQuery,
    uniqueAssetAddresses,
    historicalPrices.hasHistoricalData ? historicalPrices : undefined,
    showPriceChanges
  )

  // Wait for SDK prices to be ready before fetching performance data
  const sdkReady = !isLoadingPositions && blendSnapshot !== undefined

  const { data, isLoading } = useRealizedYield({
    publicKey,
    sdkBlndPrice: blndPrice ?? 0,
    sdkLpPrice: lpTokenPrice ?? 0,
    sdkPrices: sdkPricesRecord,
    enabled: !!publicKey && sdkReady,
  })

  // Use same yield breakdown calculation as home page for consistency
  const yieldBreakdown = useHistoricalYieldBreakdown(
    publicKey,
    blendSnapshot?.positions,
    backstopPositions,
    lpTokenPrice
  )

  const formatUsd = (value: number) => {
    if (!Number.isFinite(value)) return formatInCurrency(0)
    return formatInCurrency(value, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  // Calculate emissions per source
  // Respects useHistoricalBlndPrices setting:
  // - When true: use historical prices from API (tx.valueUsd)
  // - When false: recalculate BLND using current price
  const emissionsBySource = useMemo(() => {
    if (!data?.transactions) return { pools: { blnd: 0, lp: 0, usd: 0 }, backstop: { blnd: 0, lp: 0, usd: 0 } }

    const result = {
      pools: { blnd: 0, lp: 0, usd: 0 },
      backstop: { blnd: 0, lp: 0, usd: 0 },
    }

    for (const tx of data.transactions) {
      if (tx.type !== 'claim') continue

      const target = tx.source === 'pool' ? result.pools : result.backstop
      if (tx.asset === 'BLND') {
        target.blnd += tx.amount
        // Use historical or current price based on setting
        if (useHistoricalBlndPrices) {
          target.usd += tx.valueUsd
        } else {
          target.usd += tx.amount * (blndPrice ?? 0)
        }
      } else if (tx.asset === 'BLND-USDC LP') {
        target.lp += tx.amount
        // LP tokens always use historical price (no setting for LP)
        target.usd += tx.valueUsd
      }
    }

    return result
  }, [data?.transactions, useHistoricalBlndPrices, blndPrice])


  // Aggregate by pool for per-pool breakdown (grouped by pool with lending/backstop sub-items)
  // Respects useHistoricalBlndPrices setting for emissions values
  const perPoolBreakdown = useMemo(() => {
    if (!data?.transactions) return []

    const poolMap = new Map<string, {
      poolId: string
      poolName: string | null
      lending: { deposited: number; withdrawn: number; emissionsClaimed: number }
      backstop: { deposited: number; withdrawn: number; emissionsClaimed: number }
    }>()

    for (const tx of data.transactions) {
      const existing = poolMap.get(tx.poolId) || {
        poolId: tx.poolId,
        poolName: tx.poolName,
        lending: { deposited: 0, withdrawn: 0, emissionsClaimed: 0 },
        backstop: { deposited: 0, withdrawn: 0, emissionsClaimed: 0 },
      }

      const target = tx.source === 'pool' ? existing.lending : existing.backstop

      if (tx.type === 'deposit') {
        target.deposited += tx.valueUsd
      } else if (tx.type === 'claim') {
        // Respect useHistoricalBlndPrices setting for BLND claims
        if (tx.asset === 'BLND' && !useHistoricalBlndPrices) {
          target.emissionsClaimed += tx.amount * (blndPrice ?? 0)
        } else {
          target.emissionsClaimed += tx.valueUsd
        }
      } else {
        target.withdrawn += tx.valueUsd
      }

      poolMap.set(tx.poolId, existing)
    }

    return Array.from(poolMap.values())
      .filter(p => p.lending.deposited > 0 || p.backstop.deposited > 0)
      .sort((a, b) => {
        const aTotal = a.lending.deposited + a.backstop.deposited
        const bTotal = b.lending.deposited + b.backstop.deposited
        return bTotal - aTotal
      })
  }, [data?.transactions, useHistoricalBlndPrices, blndPrice])

  // Calculate current positions and unrealized P&L from SDK
  const unrealizedData = useMemo(() => {
    if (!data || !blendSnapshot) {
      return {
        poolsCurrentUsd: 0,
        poolsCostBasis: 0,
        poolsUnrealized: 0,
        backstopCurrentUsd: 0,
        backstopCostBasis: 0,
        backstopUnrealized: 0,
        totalCurrentUsd: 0,
        totalCostBasis: 0,
        totalUnrealized: 0,
        totalPnl: 0,
      }
    }

    // Current pool positions from SDK (supply only, excluding borrows)
    const poolsCurrentUsd = blendSnapshot.positions?.reduce(
      (sum, pos) => sum + (pos.supplyUsdValue || 0),
      0
    ) ?? 0

    // Cost basis = what's still "in" = deposited - withdrawn (excluding emissions)
    const poolsCostBasis = data.pools.deposited - data.pools.withdrawn
    const poolsUnrealized = poolsCurrentUsd - poolsCostBasis

    // Current backstop from SDK
    const backstopCurrentUsd = totalBackstopUsd ?? 0
    const backstopCostBasis = data.backstop.deposited - data.backstop.withdrawn
    const backstopUnrealized = backstopCurrentUsd - backstopCostBasis

    // Totals
    const totalCurrentUsd = poolsCurrentUsd + backstopCurrentUsd
    const totalCostBasis = poolsCostBasis + backstopCostBasis
    const totalUnrealized = totalCurrentUsd - totalCostBasis

    // Total P&L = (Current Balance + Total Withdrawn) - Total Deposited
    // This represents actual profit: what you have now + what you took out - what you put in
    const totalPnl = totalCurrentUsd + data.totalWithdrawnUsd - data.totalDepositedUsd

    return {
      poolsCurrentUsd,
      poolsCostBasis,
      poolsUnrealized,
      backstopCurrentUsd,
      backstopCostBasis,
      backstopUnrealized,
      totalCurrentUsd,
      totalCostBasis,
      totalUnrealized,
      totalPnl,
    }
  }, [data, blendSnapshot, totalBackstopUsd])

  // Calculate unclaimed emissions (pending BLND that can still be claimed)
  const unclaimedEmissions = useMemo(() => {
    // Unclaimed BLND from lending pools (in USD)
    const poolsBlndTokens = unclaimedBlndTokens ?? 0
    const poolsUsd = poolsBlndTokens * (blndPrice ?? 0)

    // Unclaimed BLND from backstop positions (in USD)
    const backstopBlndTokens = backstopPositions?.reduce((sum, bp) => sum + (bp.claimableBlnd || 0), 0) ?? 0
    const backstopUsd = backstopBlndTokens * (blndPrice ?? 0)

    return {
      pools: { blnd: poolsBlndTokens, usd: poolsUsd },
      backstop: { blnd: backstopBlndTokens, usd: backstopUsd },
    }
  }, [unclaimedBlndTokens, backstopPositions, blndPrice])

  // Display P&L values based on showPriceChanges setting
  // Uses yieldBreakdown (same as home page) for consistency
  // When OFF: show only protocol yield (excludes price changes)
  // When ON: show total earned (includes price changes)
  const displayPnl = useMemo(() => {
    // Calculate pools values from yieldBreakdown.byAsset
    let poolsProtocolYield = 0
    let poolsTotalEarned = 0
    for (const breakdown of yieldBreakdown.byAsset.values()) {
      poolsProtocolYield += breakdown.protocolYieldUsd
      poolsTotalEarned += breakdown.totalEarnedUsd
    }

    // Calculate backstop values from yieldBreakdown.byBackstop
    let backstopProtocolYield = 0
    let backstopTotalEarned = 0
    for (const breakdown of yieldBreakdown.byBackstop.values()) {
      backstopProtocolYield += breakdown.protocolYieldUsd
      backstopTotalEarned += breakdown.totalEarnedUsd
    }

    // Realized P&L = emissions (BLND/LP claims)
    // We only count explicit claims as realized, not inferred from cost basis differences
    // (cost basis differences can occur when SDK positions don't fully match historical data)
    const totalEmissions = emissionsBySource.pools.usd + emissionsBySource.backstop.usd

    if (showPriceChanges) {
      // Include price changes: use totalEarnedUsd (same as home page)
      const totalUnrealized = poolsTotalEarned + backstopTotalEarned
      // Total P&L = unrealized (with price changes) + realized emissions
      const totalPnl = totalUnrealized + totalEmissions
      return {
        totalPnl,
        poolsUnrealized: poolsTotalEarned,
        backstopUnrealized: backstopTotalEarned,
        totalUnrealized,
        realizedFromWithdrawals: totalEmissions,
        poolsYield: poolsProtocolYield,
        backstopYield: backstopProtocolYield,
      }
    } else {
      // Exclude price changes: use protocolYieldUsd only (same as home page)
      const totalUnrealized = poolsProtocolYield + backstopProtocolYield
      // Total P&L = unrealized yield + realized emissions
      const totalPnl = totalUnrealized + totalEmissions
      return {
        totalPnl,
        poolsUnrealized: poolsProtocolYield,
        backstopUnrealized: backstopProtocolYield,
        totalUnrealized,
        realizedFromWithdrawals: totalEmissions,
        poolsYield: poolsProtocolYield,
        backstopYield: backstopProtocolYield,
      }
    }
  }, [showPriceChanges, yieldBreakdown, emissionsBySource, data])

  // Build P&L chart data from aggregatedHistoryData (same source as home page)
  // This uses the yield field from balance history which is calculated correctly
  const pnlChartData = useMemo(() => {
    if (!aggregatedHistoryData?.chartData || aggregatedHistoryData.chartData.length === 0) {
      return []
    }

    // Build cumulative realized P&L from claim transactions by date
    const cumulativeRealizedByDate = new Map<string, number>()
    let runningRealized = 0

    if (data?.transactions) {
      // Sort claims by date and accumulate
      const claims = data.transactions
        .filter(tx => tx.type === 'claim')
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

      for (const tx of claims) {
        // Use historical or current price based on setting
        let claimValue = tx.valueUsd
        if (tx.asset === 'BLND' && !useHistoricalBlndPrices) {
          claimValue = tx.amount * (blndPrice ?? 0)
        }
        runningRealized += claimValue

        // Use the date field directly
        cumulativeRealizedByDate.set(tx.date, runningRealized)
      }
    }

    // Transform chart data into P&L format
    let lastRealized = 0
    return aggregatedHistoryData.chartData.map(point => {
      // Unrealized P&L = yield from balance history (already in USD)
      const unrealizedPnl = point.yield || 0

      // Get cumulative realized P&L up to this date
      if (cumulativeRealizedByDate.has(point.date)) {
        lastRealized = cumulativeRealizedByDate.get(point.date)!
      }

      return {
        date: point.date,
        unrealizedPnl,
        realizedPnl: lastRealized,
        totalPnl: unrealizedPnl + lastRealized,
      }
    })
  }, [aggregatedHistoryData?.chartData, data?.transactions, useHistoricalBlndPrices, blndPrice])

  // Override the latest chart point with correct displayPnl values for consistency
  const adjustedChartData = useMemo(() => {
    if (pnlChartData.length === 0) return []
    if (yieldBreakdown.isLoading) return pnlChartData

    // Clone the array and update the last point to match displayPnl exactly
    const result = [...pnlChartData]
    const lastIndex = result.length - 1

    if (lastIndex >= 0) {
      result[lastIndex] = {
        ...result[lastIndex],
        unrealizedPnl: displayPnl.totalUnrealized,
        realizedPnl: displayPnl.realizedFromWithdrawals,
        totalPnl: displayPnl.totalPnl,
      }
    }

    return result
  }, [pnlChartData, displayPnl, yieldBreakdown.isLoading])

  // Build source breakdown chart data (pools vs backstop) from adjustedChartData
  const sourceBreakdownChartData = useMemo(() => {
    if (adjustedChartData.length === 0) return []

    // Calculate ratios for splitting between pools and backstop
    const totalUnrealized = displayPnl.totalUnrealized || 1
    const poolsUnrealizedRatio = totalUnrealized !== 0 ? displayPnl.poolsUnrealized / totalUnrealized : 0.5
    const backstopUnrealizedRatio = totalUnrealized !== 0 ? displayPnl.backstopUnrealized / totalUnrealized : 0.5

    const totalRealized = displayPnl.realizedFromWithdrawals || 1
    const poolsRealizedRatio = totalRealized !== 0 ? emissionsBySource.pools.usd / totalRealized : 0.5
    const backstopRealizedRatio = totalRealized !== 0 ? emissionsBySource.backstop.usd / totalRealized : 0.5

    return adjustedChartData.map(point => {
      const poolsUnrealized = point.unrealizedPnl * poolsUnrealizedRatio
      const backstopUnrealized = point.unrealizedPnl * backstopUnrealizedRatio
      const poolsRealized = point.realizedPnl * poolsRealizedRatio
      const backstopRealized = point.realizedPnl * backstopRealizedRatio

      return {
        date: point.date,
        poolsUnrealized,
        backstopUnrealized,
        poolsRealized,
        backstopRealized,
        poolsTotal: poolsUnrealized + poolsRealized,
        backstopTotal: backstopUnrealized + backstopRealized,
      }
    })
  }, [adjustedChartData, displayPnl, emissionsBySource])

  // Build per-pool chart data from adjustedChartData
  const perPoolChartData = useMemo(() => {
    if (adjustedChartData.length === 0 || perPoolBreakdown.length === 0) return { data: [], pools: [] }

    // Calculate total deposits for proportional distribution
    const totalPoolsDeposited = data?.pools?.deposited || 1
    const totalBackstopDeposited = data?.backstop?.deposited || 1

    // Build pool info with ratios
    const poolInfos = perPoolBreakdown.map(poolData => {
      const poolKey = poolData.poolName || poolData.poolId.slice(0, 8)
      const lendingRatio = totalPoolsDeposited > 0 ? poolData.lending.deposited / totalPoolsDeposited : 0
      const backstopRatio = totalBackstopDeposited > 0 ? poolData.backstop.deposited / totalBackstopDeposited : 0

      // Calculate realized emissions ratios per pool
      const totalPoolsEmissions = emissionsBySource.pools.usd || 1
      const totalBackstopEmissions = emissionsBySource.backstop.usd || 1
      const lendingEmissionsRatio = totalPoolsEmissions > 0 ? poolData.lending.emissionsClaimed / totalPoolsEmissions : 0
      const backstopEmissionsRatio = totalBackstopEmissions > 0 ? poolData.backstop.emissionsClaimed / totalBackstopEmissions : 0

      return {
        poolId: poolData.poolId,
        poolKey,
        lendingRatio,
        backstopRatio,
        lendingEmissionsRatio,
        backstopEmissionsRatio,
      }
    })

    // Transform chart data to include per-pool breakdowns
    const chartData = adjustedChartData.map(point => {
      const result: Record<string, string | number> = { date: point.date }

      // Calculate pools vs backstop split from sourceBreakdownChartData
      const sourcePoint = sourceBreakdownChartData.find(s => s.date === point.date)
      const poolsUnrealized = sourcePoint?.poolsUnrealized || 0
      const backstopUnrealized = sourcePoint?.backstopUnrealized || 0
      const poolsRealized = sourcePoint?.poolsRealized || 0
      const backstopRealized = sourcePoint?.backstopRealized || 0

      for (const pool of poolInfos) {
        // Distribute based on deposit ratios
        const lendingUnrealized = poolsUnrealized * pool.lendingRatio
        const backstopUnrealizedVal = backstopUnrealized * pool.backstopRatio
        const lendingRealized = poolsRealized * pool.lendingEmissionsRatio
        const backstopRealizedVal = backstopRealized * pool.backstopEmissionsRatio

        result[`${pool.poolKey}_lending_realized`] = lendingRealized
        result[`${pool.poolKey}_backstop_realized`] = backstopRealizedVal
        result[`${pool.poolKey}_lending_unrealized`] = lendingUnrealized
        result[`${pool.poolKey}_backstop_unrealized`] = backstopUnrealizedVal
        result[`${pool.poolKey}_lending_total`] = lendingRealized + lendingUnrealized
        result[`${pool.poolKey}_backstop_total`] = backstopRealizedVal + backstopUnrealizedVal
      }

      return result
    })

    return { data: chartData, pools: poolInfos }
  }, [adjustedChartData, perPoolBreakdown, data?.pools?.deposited, data?.backstop?.deposited, emissionsBySource, sourceBreakdownChartData])

  // Determine display state based on whether user has current positions
  const hasCurrentPositions = unrealizedData.totalCurrentUsd > 0
  const totalPnlPositive = displayPnl.totalPnl >= 0

  // Show landing page for non-logged-in users
  if (!activeWallet) {
    return (
      <LandingPage
        wallets={wallets}
        activeWallet={activeWallet}
        onSelectWallet={handleSelectWallet}
        onConnectWallet={handleConnectWallet}
        onDisconnect={handleDisconnect}
        isHydrated={isHydrated}
      />
    )
  }

  return (
    <DashboardLayout
      wallets={wallets}
      activeWallet={activeWallet}
      onSelectWallet={handleSelectWallet}
      onConnectWallet={handleConnectWallet}
      onDisconnect={handleDisconnect}
      isHydrated={isHydrated}
    >
      <div>
        <PageTitle>Performance</PageTitle>

        <div className="space-y-4 sm:space-y-6">
        {(isLoading || !sdkReady) ? (
          <div className="space-y-4 sm:space-y-6">
            {/* Hero Summary Card Skeleton */}
            <Card>
              <CardContent>
                <div className="flex items-start justify-between mb-4">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <div className="flex items-baseline gap-3">
                      <Skeleton className="h-8 sm:h-9 w-32 sm:w-40" />
                      <Skeleton className="h-5 w-14 rounded-full" />
                    </div>
                  </div>
                  <Skeleton className="h-9 w-9 rounded-full" />
                </div>
                <Separator className="my-4" />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                  <div className="space-y-1.5">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-5 w-20 sm:w-24" />
                  </div>
                  <div className="space-y-1.5">
                    <Skeleton className="h-3 w-18" />
                    <Skeleton className="h-5 w-20 sm:w-24" />
                  </div>
                  <div className="space-y-1.5 col-span-2 sm:col-span-1">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-5 w-20 sm:w-24" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Strategy Stats Skeleton */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <Card className="py-4">
                <CardContent>
                  <div className="flex items-center gap-2 mb-1">
                    <Skeleton className="h-3 w-3 rounded-sm" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-5 w-24" />
                </CardContent>
              </Card>
              <Card className="py-4">
                <CardContent>
                  <Skeleton className="h-3 w-16 mb-1" />
                  <Skeleton className="h-5 w-16" />
                </CardContent>
              </Card>
            </div>

            {/* Chart Skeleton */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-7 w-36 rounded-md" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-40 w-full flex items-end gap-1 pt-4">
                  {[35, 45, 55, 40, 60, 50, 65, 55, 70, 60, 75, 80].map((height, i) => (
                    <Skeleton
                      key={i}
                      className="flex-1 rounded-t-sm"
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Breakdown by Source Skeleton */}
            <Card>
              <CardHeader className="pb-2 sm:pb-3">
                <Skeleton className="h-5 w-36" />
              </CardHeader>
              <CardContent className="space-y-2 sm:space-y-3">
                {/* Pools Section */}
                <div className="p-2 sm:p-3 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-6 w-6 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <div className="space-y-2">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="flex justify-between">
                        <Skeleton className="h-3.5 w-20" />
                        <Skeleton className="h-3.5 w-16" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Backstop Section */}
                <div className="p-2 sm:p-3 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-6 w-6 rounded-full" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <div className="space-y-2">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="flex justify-between">
                        <Skeleton className="h-3.5 w-20" />
                        <Skeleton className="h-3.5 w-16" />
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Summary */}
                <div className="space-y-2 pt-1">
                  <div className="flex justify-between">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3.5 w-20" />
                  </div>
                  <div className="flex justify-between">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3.5 w-20" />
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-6 w-24" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : !data || (data.totalDepositedUsd === 0 && data.totalWithdrawnUsd === 0) ? (
          <Card>
            <CardContent className="py-12 text-center">
              <TrendingUp className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <h3 className="font-semibold mb-1">No Activity Yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                No deposit or withdrawal activity found for this wallet. Start earning by depositing assets into Blend pools.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Hero Summary Card */}
            <Card>
              <CardContent>
                {hasCurrentPositions ? (
                  // User has active positions - show Total P&L as primary metric
                  <>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">
                          <InfoLabel
                            label="Total P&L"
                            tooltip="(Current Balance + Withdrawn) - Deposited. Your total profit from Blend protocol."
                          />
                        </p>
                        <div className="flex items-baseline gap-2 sm:gap-3 flex-wrap">
                          <p className={`text-2xl sm:text-3xl font-bold tabular-nums ${totalPnlPositive ? "text-emerald-400" : "text-red-400"}`}>
                            {totalPnlPositive ? "+" : ""}{formatUsd(displayPnl.totalPnl)}
                          </p>
                          {data.totalDepositedUsd > 0 && (
                            <Badge variant="outline" className={totalPnlPositive ? "text-emerald-400 border-emerald-400/30" : "text-red-400 border-red-400/30"}>
                              {totalPnlPositive ? "+" : ""}{((displayPnl.totalPnl / data.totalDepositedUsd) * 100).toFixed(1)}%
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className={`p-2 rounded-full ${totalPnlPositive ? "bg-emerald-400/10" : "bg-red-400/10"}`}>
                        {totalPnlPositive ? (
                          <TrendingUp className="h-5 w-5 text-emerald-400" />
                        ) : (
                          <TrendingDown className="h-5 w-5 text-red-400" />
                        )}
                      </div>
                    </div>
                    <Separator className="my-4" />
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">
                          <InfoLabel label="Deposited" tooltip="Total USD value of all deposits at the time each deposit was made." />
                        </p>
                        <p className="text-sm sm:text-base font-semibold tabular-nums">{formatUsd(data.totalDepositedUsd)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">
                          <InfoLabel label="Withdrawn" tooltip="Total USD value of all withdrawals and claims at the time they were made." />
                        </p>
                        <p className="text-sm sm:text-base font-semibold tabular-nums">{formatUsd(data.totalWithdrawnUsd)}</p>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <p className="text-xs text-muted-foreground mb-0.5">
                          <InfoLabel label="Current Value" tooltip="Current market value of your positions in Blend protocol." />
                        </p>
                        <p className="text-sm sm:text-base font-semibold tabular-nums">{formatUsd(unrealizedData.totalCurrentUsd)}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  // User has fully withdrawn - show realized P&L
                  <>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">
                          {data.realizedPnl >= 0 ? "Realized Profits" : "Net Cash Flow"}
                        </p>
                        <p className={`text-2xl sm:text-3xl font-bold tabular-nums ${data.realizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {data.realizedPnl >= 0 ? "+" : ""}{formatUsd(data.realizedPnl)}
                        </p>
                      </div>
                      <div className={`p-2 rounded-full ${data.realizedPnl >= 0 ? "bg-emerald-400/10" : "bg-blue-500/10"}`}>
                        {data.realizedPnl >= 0 ? (
                          <TrendingUp className="h-5 w-5 text-emerald-400" />
                        ) : (
                          <Wallet className="h-5 w-5 text-blue-500" />
                        )}
                      </div>
                    </div>
                    <Separator className="my-4" />
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Total Deposited</p>
                        <p className="text-lg font-semibold tabular-nums">{formatUsd(data.totalDepositedUsd)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Total Withdrawn</p>
                        <p className="text-lg font-semibold tabular-nums">{formatUsd(data.totalWithdrawnUsd)}</p>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Strategy Performance Stats */}
            {data.firstActivityDate && (
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <Card className="py-4">
                  <CardContent>
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">First Activity</p>
                    </div>
                    <p className="font-semibold text-sm">{formatDate(data.firstActivityDate)}</p>
                  </CardContent>
                </Card>
                <Card className="py-4">
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-1">Days Active</p>
                    <p className="font-semibold text-sm">{data.daysActive} days</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* P&L Chart with tabs */}
            {adjustedChartData.length > 1 && (data.emissions.usdValue > 0 || unrealizedData.totalUnrealized !== 0) && (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Cumulative P&L</CardTitle>
                    <Tabs value={mainChartTab} onValueChange={(v) => setMainChartTab(v as PnlTab)}>
                      <TabsList className="h-7">
                        <TabsTrigger value="total" className="text-xs px-2 py-1">P&L</TabsTrigger>
                        <TabsTrigger value="realized" className="text-xs px-2 py-1">Realized</TabsTrigger>
                        <TabsTrigger value="unrealized" className="text-xs px-2 py-1">Unrealized</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="h-40 w-full">
                    <AreaChart
                      data={adjustedChartData}
                      margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="realizedGradientPositive" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="rgb(34, 197, 94)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="rgb(34, 197, 94)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="unrealizedGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="rgb(59, 130, 246)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="rgb(59, 130, 246)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="rgb(168, 85, 247)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="rgb(168, 85, 247)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={formatShortDate}
                        tick={{ fontSize: 9 }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => {
                          const absValue = Math.abs(value)
                          const sign = value < 0 ? '-' : ''
                          if (absValue >= 1000) {
                            return `${sign}$${formatNumber(absValue / 1000, 0)}k`
                          }
                          return `${sign}$${formatNumber(absValue, 0)}`
                        }}
                        tick={{ fontSize: 9 }}
                        width={50}
                        domain={['dataMin', 'dataMax']}
                        allowDataOverflow={false}
                      />
                      <ChartTooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const chartData = payload[0].payload
                            return (
                              <div className="bg-background border rounded-lg p-2.5 shadow-lg text-xs">
                                <p className="font-medium mb-1.5">{formatDate(chartData.date)}</p>
                                <div className="space-y-0.5">
                                  {mainChartTab === 'total' && (
                                    <p className="font-medium text-purple-500">
                                      P&L: {chartData.totalPnl >= 0 ? '+' : ''}{formatUsd(chartData.totalPnl)}
                                    </p>
                                  )}
                                  {mainChartTab === 'realized' && (
                                    <p className="font-medium text-emerald-400">
                                      Realized: +{formatUsd(chartData.realizedPnl)}
                                    </p>
                                  )}
                                  {mainChartTab === 'unrealized' && (
                                    <p className="font-medium text-blue-500">
                                      Unrealized: {chartData.unrealizedPnl >= 0 ? '+' : ''}{formatUsd(chartData.unrealizedPnl)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      {mainChartTab === 'realized' && (
                        <Area
                          type="monotone"
                          dataKey="realizedPnl"
                          stroke="rgb(34, 197, 94)"
                          strokeWidth={2}
                          fill="url(#realizedGradientPositive)"
                        />
                      )}
                      {mainChartTab === 'unrealized' && (
                        <Area
                          type="monotone"
                          dataKey="unrealizedPnl"
                          stroke="rgb(59, 130, 246)"
                          strokeWidth={2}
                          fill="url(#unrealizedGradient)"
                        />
                      )}
                      {mainChartTab === 'total' && (
                        <Area
                          type="monotone"
                          dataKey="totalPnl"
                          stroke="rgb(168, 85, 247)"
                          strokeWidth={2}
                          fill="url(#totalGradient)"
                        />
                      )}
                    </AreaChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            {/* Breakdown by Source */}
            <Card>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="text-base font-semibold">Breakdown by Source</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 sm:space-y-3">
                {/* Pools */}
                {(data.pools.deposited > 0 || data.pools.withdrawn > 0) && (
                  <div className="p-2 sm:p-3 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-full bg-blue-500/10">
                        <PiggyBank className="h-3.5 w-3.5 text-blue-500" />
                      </div>
                      <p className="font-medium text-sm">Lending Pools</p>
                    </div>
                    <div className="space-y-1 text-sm">
                      {unrealizedData.poolsCurrentUsd > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Current Balance</span>
                          <span className="tabular-nums">{formatUsd(unrealizedData.poolsCurrentUsd)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Deposited</span>
                        <span className="tabular-nums">{formatUsd(data.pools.deposited)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Withdrawn</span>
                        <span className="tabular-nums">{formatUsd(data.pools.withdrawn)}</span>
                      </div>
                      {displayPnl.poolsYield > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            <InfoLabel label="Yield" tooltip="Interest earned from lending. This is protocol yield (tokens earned × current price)." />
                          </span>
                          <span className="tabular-nums">{formatUsd(displayPnl.poolsYield)}</span>
                        </div>
                      )}
                      {emissionsBySource.pools.usd > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            <InfoLabel label="Emissions Claimed" tooltip="BLND tokens received as rewards from lending positions." />
                          </span>
                          <span className="tabular-nums">{formatUsd(emissionsBySource.pools.usd)}</span>
                        </div>
                      )}
                      {unclaimedEmissions.pools.usd > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            <InfoLabel label="Emissions Unclaimed" tooltip="BLND tokens available to claim from lending positions." />
                          </span>
                          <span className="tabular-nums">{formatUsd(unclaimedEmissions.pools.usd)}</span>
                        </div>
                      )}
                      {emissionsBySource.pools.usd > 0 && (
                        <div className="flex justify-between items-center pt-1 border-t border-border/50">
                          <span className="text-muted-foreground">
                            <InfoLabel label="Realized P&L" tooltip="Profits already withdrawn from the protocol (emissions claimed)." />
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="tabular-nums text-emerald-400">+{formatUsd(emissionsBySource.pools.usd)}</span>
                            {data.pools.deposited > 0 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-400 border-emerald-400/30">
                                +{((emissionsBySource.pools.usd / data.pools.deposited) * 100).toFixed(1)}%
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                      {unrealizedData.poolsCurrentUsd > 0 && (
                        <>
                          <div className="flex justify-between items-center pt-1 border-t border-border/50">
                            <span className="text-muted-foreground">
                              <InfoLabel label="Unrealized P&L" tooltip="Current Balance minus Cost Basis. Profit still in the protocol." />
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={`tabular-nums ${displayPnl.poolsUnrealized >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                {displayPnl.poolsUnrealized >= 0 ? "+" : ""}{formatUsd(displayPnl.poolsUnrealized)}
                              </span>
                              {data.pools.deposited > 0 && (
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${displayPnl.poolsUnrealized >= 0 ? "text-emerald-400 border-emerald-400/30" : "text-red-400 border-red-400/30"}`}>
                                  {displayPnl.poolsUnrealized >= 0 ? "+" : ""}{((displayPnl.poolsUnrealized / data.pools.deposited) * 100).toFixed(1)}%
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex justify-between items-center font-medium pt-1 border-t border-border/50">
                            <span>
                              <InfoLabel label="P&L" tooltip="Total profit: Unrealized P&L + Realized P&L" />
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={`tabular-nums ${(displayPnl.poolsUnrealized + emissionsBySource.pools.usd) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                {(displayPnl.poolsUnrealized + emissionsBySource.pools.usd) >= 0 ? "+" : ""}{formatUsd(displayPnl.poolsUnrealized + emissionsBySource.pools.usd)}
                              </span>
                              {data.pools.deposited > 0 && (
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${(displayPnl.poolsUnrealized + emissionsBySource.pools.usd) >= 0 ? "text-emerald-400 border-emerald-400/30" : "text-red-400 border-red-400/30"}`}>
                                  {(displayPnl.poolsUnrealized + emissionsBySource.pools.usd) >= 0 ? "+" : ""}{(((displayPnl.poolsUnrealized + emissionsBySource.pools.usd) / data.pools.deposited) * 100).toFixed(1)}%
                                </Badge>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Backstop */}
                {(data.backstop.deposited > 0 || data.backstop.withdrawn > 0) && (
                  <div className="p-2 sm:p-3 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-full bg-purple-500/10">
                        <Shield className="h-3.5 w-3.5 text-purple-500" />
                      </div>
                      <p className="font-medium text-sm">Backstop</p>
                    </div>
                    <div className="space-y-1 text-sm">
                      {unrealizedData.backstopCurrentUsd > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Current Balance</span>
                          <span className="tabular-nums">{formatUsd(unrealizedData.backstopCurrentUsd)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Deposited</span>
                        <span className="tabular-nums">{formatUsd(data.backstop.deposited)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Withdrawn</span>
                        <span className="tabular-nums">{formatUsd(data.backstop.withdrawn)}</span>
                      </div>
                      {displayPnl.backstopYield > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            <InfoLabel label="Yield" tooltip="LP token appreciation from backstop positions. This is protocol yield." />
                          </span>
                          <span className="tabular-nums">{formatUsd(displayPnl.backstopYield)}</span>
                        </div>
                      )}
                      {emissionsBySource.backstop.usd > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            <InfoLabel label="Emissions Claimed" tooltip="BLND and LP tokens received as rewards from backstop positions." />
                          </span>
                          <span className="tabular-nums">{formatUsd(emissionsBySource.backstop.usd)}</span>
                        </div>
                      )}
                      {unclaimedEmissions.backstop.usd > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            <InfoLabel label="Emissions Unclaimed" tooltip="BLND tokens available to claim from backstop positions." />
                          </span>
                          <span className="tabular-nums">{formatUsd(unclaimedEmissions.backstop.usd)}</span>
                        </div>
                      )}
                      {emissionsBySource.backstop.usd > 0 && (
                        <div className="flex justify-between items-center pt-1 border-t border-border/50">
                          <span className="text-muted-foreground">
                            <InfoLabel label="Realized P&L" tooltip="Profits already withdrawn from the protocol (emissions claimed)." />
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="tabular-nums text-emerald-400">+{formatUsd(emissionsBySource.backstop.usd)}</span>
                            {data.backstop.deposited > 0 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-400 border-emerald-400/30">
                                +{((emissionsBySource.backstop.usd / data.backstop.deposited) * 100).toFixed(1)}%
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                      {unrealizedData.backstopCurrentUsd > 0 && (
                        <>
                          <div className="flex justify-between items-center pt-1 border-t border-border/50">
                            <span className="text-muted-foreground">
                              <InfoLabel label="Unrealized P&L" tooltip="Current Balance minus Cost Basis. Profit still in the protocol." />
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={`tabular-nums ${displayPnl.backstopUnrealized >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                {displayPnl.backstopUnrealized >= 0 ? "+" : ""}{formatUsd(displayPnl.backstopUnrealized)}
                              </span>
                              {data.backstop.deposited > 0 && (
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${displayPnl.backstopUnrealized >= 0 ? "text-emerald-400 border-emerald-400/30" : "text-red-400 border-red-400/30"}`}>
                                  {displayPnl.backstopUnrealized >= 0 ? "+" : ""}{((displayPnl.backstopUnrealized / data.backstop.deposited) * 100).toFixed(1)}%
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex justify-between items-center font-medium pt-1 border-t border-border/50">
                            <span>
                              <InfoLabel label="P&L" tooltip="Total profit: Unrealized P&L + Realized P&L" />
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={`tabular-nums ${(displayPnl.backstopUnrealized + emissionsBySource.backstop.usd) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                {(displayPnl.backstopUnrealized + emissionsBySource.backstop.usd) >= 0 ? "+" : ""}{formatUsd(displayPnl.backstopUnrealized + emissionsBySource.backstop.usd)}
                              </span>
                              {data.backstop.deposited > 0 && (
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${(displayPnl.backstopUnrealized + emissionsBySource.backstop.usd) >= 0 ? "text-emerald-400 border-emerald-400/30" : "text-red-400 border-red-400/30"}`}>
                                  {(displayPnl.backstopUnrealized + emissionsBySource.backstop.usd) >= 0 ? "+" : ""}{(((displayPnl.backstopUnrealized + emissionsBySource.backstop.usd) / data.backstop.deposited) * 100).toFixed(1)}%
                                </Badge>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                <Separator />

                {/* Summary */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-sm">
                    <p className="text-muted-foreground">Total Deposited</p>
                    <p className="font-medium tabular-nums">{formatUsd(data.totalDepositedUsd)}</p>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <p className="text-muted-foreground">Total Withdrawn</p>
                    <p className="font-medium tabular-nums">{formatUsd(data.totalWithdrawnUsd)}</p>
                  </div>
                  {unrealizedData.totalCurrentUsd > 0 && (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <p className="text-muted-foreground">Current Balance</p>
                        <p className="font-medium tabular-nums">{formatUsd(unrealizedData.totalCurrentUsd)}</p>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <p className="font-semibold">Total P&L</p>
                        <p className={`text-lg font-bold tabular-nums ${displayPnl.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {displayPnl.totalPnl >= 0 ? "+" : ""}{formatUsd(displayPnl.totalPnl)}
                        </p>
                      </div>
                    </>
                  )}
                  {unrealizedData.totalCurrentUsd === 0 && (
                    <>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <p className="font-semibold">{data.realizedPnl >= 0 ? "Realized Profit" : "Net Cash Flow"}</p>
                        <p className={`text-lg font-bold tabular-nums ${data.realizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {data.realizedPnl >= 0 ? "+" : ""}{formatUsd(data.realizedPnl)}
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* Combined P&L Chart by Source */}
                {sourceBreakdownChartData.length > 1 && (
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-muted-foreground">P&L over time</p>
                      <Tabs value={sourceChartTab} onValueChange={(v) => setSourceChartTab(v as PnlTab)}>
                        <TabsList className="h-6">
                          <TabsTrigger value="total" className="text-[10px] px-1.5 py-0.5">P&L</TabsTrigger>
                          <TabsTrigger value="realized" className="text-[10px] px-1.5 py-0.5">Realized</TabsTrigger>
                          <TabsTrigger value="unrealized" className="text-[10px] px-1.5 py-0.5">Unrealized</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>
                    <ChartContainer config={chartConfig} className="h-32 w-full">
                      <AreaChart
                        data={sourceBreakdownChartData}
                        margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="poolsGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="rgb(59, 130, 246)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="rgb(59, 130, 246)" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="backstopGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="rgb(168, 85, 247)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="rgb(168, 85, 247)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="date"
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={formatShortDate}
                          tick={{ fontSize: 9 }}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value) => {
                            const absValue = Math.abs(value)
                            const sign = value < 0 ? '-' : ''
                            if (absValue >= 1000) {
                              return `${sign}$${formatNumber(absValue / 1000, 0)}k`
                            }
                            return `${sign}$${formatNumber(absValue, 0)}`
                          }}
                          tick={{ fontSize: 9 }}
                          width={50}
                          domain={['dataMin', 'dataMax']}
                          allowDataOverflow={false}
                        />
                        <ChartTooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const chartData = payload[0].payload
                              const poolsVal = sourceChartTab === 'realized' ? chartData.poolsRealized : sourceChartTab === 'unrealized' ? chartData.poolsUnrealized : chartData.poolsTotal
                              const backstopVal = sourceChartTab === 'realized' ? chartData.backstopRealized : sourceChartTab === 'unrealized' ? chartData.backstopUnrealized : chartData.backstopTotal
                              return (
                                <div className="bg-background border rounded-lg p-2 shadow-lg text-xs">
                                  <p className="text-muted-foreground mb-1">{formatShortDate(chartData.date)}</p>
                                  {poolsVal !== 0 && (
                                    <p className="font-medium text-blue-500">Pools: {poolsVal >= 0 ? '+' : ''}{formatUsd(poolsVal)}</p>
                                  )}
                                  {backstopVal !== 0 && (
                                    <p className="font-medium text-purple-500">Backstop: {backstopVal >= 0 ? '+' : ''}{formatUsd(backstopVal)}</p>
                                  )}
                                </div>
                              )
                            }
                            return null
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey={sourceChartTab === 'realized' ? 'poolsRealized' : sourceChartTab === 'unrealized' ? 'poolsUnrealized' : 'poolsTotal'}
                          stroke="rgb(59, 130, 246)"
                          strokeWidth={1.5}
                          fill="url(#poolsGradient)"
                        />
                        <Area
                          type="monotone"
                          dataKey={sourceChartTab === 'realized' ? 'backstopRealized' : sourceChartTab === 'unrealized' ? 'backstopUnrealized' : 'backstopTotal'}
                          stroke="rgb(168, 85, 247)"
                          strokeWidth={1.5}
                          fill="url(#backstopGradient)"
                        />
                      </AreaChart>
                    </ChartContainer>
                    <div className="flex justify-center gap-4 mt-1">
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <span className="text-muted-foreground">Lending Pools</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <div className="w-2 h-2 rounded-full bg-purple-500" />
                        <span className="text-muted-foreground">Backstop</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Per-Pool Breakdown */}
            {perPoolBreakdown.length > 0 && (
              <Card>
                <CardHeader className="pb-2 sm:pb-3">
                  <CardTitle className="text-base font-semibold">Activity by Pool</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 sm:space-y-3">
                  {perPoolBreakdown.map((poolData) => {
                    const totalDeposited = poolData.lending.deposited + poolData.backstop.deposited
                    const totalEmissions = poolData.lending.emissionsClaimed + poolData.backstop.emissionsClaimed

                    // Estimate per-pool current balance and unrealized based on proportion of deposits
                    const lendingCurrentBalance = data.pools.deposited > 0
                      ? (poolData.lending.deposited / data.pools.deposited) * unrealizedData.poolsCurrentUsd
                      : 0
                    const lendingUnrealized = data.pools.deposited > 0
                      ? (poolData.lending.deposited / data.pools.deposited) * displayPnl.poolsUnrealized
                      : 0
                    const backstopCurrentBalance = data.backstop.deposited > 0
                      ? (poolData.backstop.deposited / data.backstop.deposited) * unrealizedData.backstopCurrentUsd
                      : 0
                    const backstopUnrealized = data.backstop.deposited > 0
                      ? (poolData.backstop.deposited / data.backstop.deposited) * displayPnl.backstopUnrealized
                      : 0

                    // Total P&L for each source in this pool
                    const lendingTotalPnl = lendingUnrealized + poolData.lending.emissionsClaimed
                    const backstopTotalPnl = backstopUnrealized + poolData.backstop.emissionsClaimed
                    const poolTotalPnl = lendingTotalPnl + backstopTotalPnl
                    const poolTotalCurrentBalance = lendingCurrentBalance + backstopCurrentBalance

                    return (
                      <div
                        key={poolData.poolId}
                        className="p-2 sm:p-3 rounded-lg bg-muted/50 space-y-3"
                      >
                        {/* Pool Header */}
                        <div className="flex items-center justify-between pb-1 border-b border-border/50">
                          <p className="font-medium text-sm">
                            {poolData.poolName || poolData.poolId.slice(0, 8) + '...'}
                          </p>
                        </div>

                        {/* Lending Position */}
                        {poolData.lending.deposited > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 rounded-full bg-blue-500/10">
                                <PiggyBank className="h-3.5 w-3.5 text-blue-500" />
                              </div>
                              <p className="font-medium text-sm">Lending</p>
                            </div>
                            <div className="space-y-1 text-sm">
                              {lendingCurrentBalance > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Current Balance</span>
                                  <span className="tabular-nums">{formatUsd(lendingCurrentBalance)}</span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Deposited</span>
                                <span className="tabular-nums">{formatUsd(poolData.lending.deposited)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Withdrawn</span>
                                <span className="tabular-nums">{formatUsd(poolData.lending.withdrawn)}</span>
                              </div>
                              {poolData.lending.emissionsClaimed > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    <InfoLabel label="Emissions Claimed" tooltip="BLND tokens received as rewards from this lending position." />
                                  </span>
                                  <span className="tabular-nums">{formatUsd(poolData.lending.emissionsClaimed)}</span>
                                </div>
                              )}
                              {poolData.lending.emissionsClaimed > 0 && (
                                <div className="flex justify-between items-center pt-1 border-t border-border/50">
                                  <span className="text-muted-foreground">
                                    <InfoLabel label="Realized P&L" tooltip="Profits already withdrawn from the protocol (emissions claimed)." />
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span className="tabular-nums text-emerald-400">+{formatUsd(poolData.lending.emissionsClaimed)}</span>
                                    {poolData.lending.deposited > 0 && (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-400 border-emerald-400/30">
                                        +{((poolData.lending.emissionsClaimed / poolData.lending.deposited) * 100).toFixed(1)}%
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              )}
                              {lendingCurrentBalance > 0 && (
                                <>
                                  <div className="flex justify-between items-center pt-1 border-t border-border/50">
                                    <span className="text-muted-foreground">
                                      <InfoLabel label="Unrealized P&L" tooltip="Current Balance minus Cost Basis. Profit still in the protocol." />
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <span className={`tabular-nums ${lendingUnrealized >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                        {lendingUnrealized >= 0 ? "+" : ""}{formatUsd(lendingUnrealized)}
                                      </span>
                                      {poolData.lending.deposited > 0 && (
                                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${lendingUnrealized >= 0 ? "text-emerald-400 border-emerald-400/30" : "text-red-400 border-red-400/30"}`}>
                                          {lendingUnrealized >= 0 ? "+" : ""}{((lendingUnrealized / poolData.lending.deposited) * 100).toFixed(1)}%
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex justify-between items-center font-medium pt-1 border-t border-border/50">
                                    <span>
                                      <InfoLabel label="P&L" tooltip="Total profit: Unrealized P&L + Realized P&L" />
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <span className={`tabular-nums ${lendingTotalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                        {lendingTotalPnl >= 0 ? "+" : ""}{formatUsd(lendingTotalPnl)}
                                      </span>
                                      {poolData.lending.deposited > 0 && (
                                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${lendingTotalPnl >= 0 ? "text-emerald-400 border-emerald-400/30" : "text-red-400 border-red-400/30"}`}>
                                          {lendingTotalPnl >= 0 ? "+" : ""}{((lendingTotalPnl / poolData.lending.deposited) * 100).toFixed(1)}%
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Backstop Position */}
                        {poolData.backstop.deposited > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 rounded-full bg-purple-500/10">
                                <Shield className="h-3.5 w-3.5 text-purple-500" />
                              </div>
                              <p className="font-medium text-sm">Backstop</p>
                            </div>
                            <div className="space-y-1 text-sm">
                              {backstopCurrentBalance > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Current Balance</span>
                                  <span className="tabular-nums">{formatUsd(backstopCurrentBalance)}</span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Deposited</span>
                                <span className="tabular-nums">{formatUsd(poolData.backstop.deposited)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Withdrawn</span>
                                <span className="tabular-nums">{formatUsd(poolData.backstop.withdrawn)}</span>
                              </div>
                              {poolData.backstop.emissionsClaimed > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    <InfoLabel label="Emissions Claimed" tooltip="BLND and LP tokens received as rewards from this backstop position." />
                                  </span>
                                  <span className="tabular-nums">{formatUsd(poolData.backstop.emissionsClaimed)}</span>
                                </div>
                              )}
                              {poolData.backstop.emissionsClaimed > 0 && (
                                <div className="flex justify-between items-center pt-1 border-t border-border/50">
                                  <span className="text-muted-foreground">
                                    <InfoLabel label="Realized P&L" tooltip="Profits already withdrawn from the protocol (emissions claimed)." />
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span className="tabular-nums text-emerald-400">+{formatUsd(poolData.backstop.emissionsClaimed)}</span>
                                    {poolData.backstop.deposited > 0 && (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-400 border-emerald-400/30">
                                        +{((poolData.backstop.emissionsClaimed / poolData.backstop.deposited) * 100).toFixed(1)}%
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              )}
                              {backstopCurrentBalance > 0 && (
                                <>
                                  <div className="flex justify-between items-center pt-1 border-t border-border/50">
                                    <span className="text-muted-foreground">
                                      <InfoLabel label="Unrealized P&L" tooltip="Current Balance minus Cost Basis. Profit still in the protocol." />
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <span className={`tabular-nums ${backstopUnrealized >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                        {backstopUnrealized >= 0 ? "+" : ""}{formatUsd(backstopUnrealized)}
                                      </span>
                                      {poolData.backstop.deposited > 0 && (
                                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${backstopUnrealized >= 0 ? "text-emerald-400 border-emerald-400/30" : "text-red-400 border-red-400/30"}`}>
                                          {backstopUnrealized >= 0 ? "+" : ""}{((backstopUnrealized / poolData.backstop.deposited) * 100).toFixed(1)}%
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex justify-between items-center font-medium pt-1 border-t border-border/50">
                                    <span>
                                      <InfoLabel label="P&L" tooltip="Total profit: Unrealized P&L + Realized P&L" />
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <span className={`tabular-nums ${backstopTotalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                        {backstopTotalPnl >= 0 ? "+" : ""}{formatUsd(backstopTotalPnl)}
                                      </span>
                                      {poolData.backstop.deposited > 0 && (
                                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${backstopTotalPnl >= 0 ? "text-emerald-400 border-emerald-400/30" : "text-red-400 border-red-400/30"}`}>
                                          {backstopTotalPnl >= 0 ? "+" : ""}{((backstopTotalPnl / poolData.backstop.deposited) * 100).toFixed(1)}%
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Pool Summary - only show if both lending and backstop exist */}
                        {poolData.lending.deposited > 0 && poolData.backstop.deposited > 0 && (
                          <div className="pt-2 border-t border-border/50 space-y-1">
                            {poolTotalCurrentBalance > 0 && (
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Current Balance</span>
                                <span className="tabular-nums font-medium">{formatUsd(poolTotalCurrentBalance)}</span>
                              </div>
                            )}
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-muted-foreground">Total Deposited</span>
                              <span className="tabular-nums font-medium">{formatUsd(totalDeposited)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-muted-foreground">Total Withdrawn</span>
                              <span className="tabular-nums font-medium">{formatUsd(poolData.lending.withdrawn + poolData.backstop.withdrawn)}</span>
                            </div>
                            {poolTotalCurrentBalance > 0 && (
                              <>
                                <Separator className="my-1" />
                                <div className="flex justify-between items-center">
                                  <span className="font-semibold">Total P&L</span>
                                  <p className={`text-lg font-bold tabular-nums ${poolTotalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                    {poolTotalPnl >= 0 ? "+" : ""}{formatUsd(poolTotalPnl)}
                                  </p>
                                </div>
                              </>
                            )}
                            {poolTotalCurrentBalance === 0 && totalEmissions > 0 && (
                              <>
                                <Separator className="my-1" />
                                <div className="flex justify-between items-center">
                                  <span className="font-semibold">Realized P&L</span>
                                  <p className="text-lg font-bold tabular-nums text-emerald-400">
                                    +{formatUsd(totalEmissions)}
                                  </p>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Per-Pool P&L Stacked Bar Chart Over Time */}
                  {perPoolChartData.data.length > 1 && perPoolChartData.pools.length > 0 && (
                    <div className="pt-2">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-muted-foreground">P&L over time by Pool</p>
                        <Tabs value={poolChartTab} onValueChange={(v) => setPoolChartTab(v as PnlTab)}>
                          <TabsList className="h-6">
                            <TabsTrigger value="total" className="text-[10px] px-1.5 py-0.5">P&L</TabsTrigger>
                            <TabsTrigger value="realized" className="text-[10px] px-1.5 py-0.5">Realized</TabsTrigger>
                            <TabsTrigger value="unrealized" className="text-[10px] px-1.5 py-0.5">Unrealized</TabsTrigger>
                          </TabsList>
                        </Tabs>
                      </div>
                      <ChartContainer config={chartConfig} className="h-56 w-full">
                        <BarChart
                          data={perPoolChartData.data}
                          margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                        >
                          <XAxis
                            dataKey="date"
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={formatShortDate}
                            tick={{ fontSize: 9 }}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => {
                              const absValue = Math.abs(value)
                              const sign = value < 0 ? '-' : ''
                              if (absValue >= 1000) {
                                return `${sign}$${formatNumber(absValue / 1000, 0)}k`
                              }
                              return `${sign}$${formatNumber(absValue, 0)}`
                            }}
                            tick={{ fontSize: 9 }}
                            width={50}
                            domain={['dataMin', 'dataMax']}
                            allowDataOverflow={false}
                          />
                          <ChartTooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const chartData = payload[0].payload
                                const suffix = poolChartTab === 'realized' ? '_realized' : poolChartTab === 'unrealized' ? '_unrealized' : '_total'
                                return (
                                  <div className="bg-background border rounded-lg p-2 shadow-lg text-xs">
                                    <p className="font-medium mb-1.5">{formatShortDate(chartData.date)}</p>
                                    <div className="space-y-1">
                                      {perPoolChartData.pools.map(pool => {
                                        const lending = chartData[`${pool.poolKey}_lending${suffix}`] || 0
                                        const backstop = chartData[`${pool.poolKey}_backstop${suffix}`] || 0
                                        if (lending === 0 && backstop === 0) return null
                                        return (
                                          <div key={pool.poolId}>
                                            <p className="font-medium text-muted-foreground">{pool.poolKey}</p>
                                            {lending !== 0 && <p className="text-blue-500 pl-2">Lending: {lending >= 0 ? '+' : ''}{formatUsd(lending)}</p>}
                                            {backstop !== 0 && <p className="text-purple-500 pl-2">Backstop: {backstop >= 0 ? '+' : ''}{formatUsd(backstop)}</p>}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )
                              }
                              return null
                            }}
                          />
                          {/* Render stacked bars for each pool */}
                          {perPoolChartData.pools.map((pool, index) => {
                            const suffix = poolChartTab === 'realized' ? '_realized' : poolChartTab === 'unrealized' ? '_unrealized' : '_total'
                            // Generate colors based on index
                            const colors = [
                              { lending: 'rgb(59, 130, 246)', backstop: 'rgb(147, 197, 253)' },  // Blue
                              { lending: 'rgb(168, 85, 247)', backstop: 'rgb(216, 180, 254)' },  // Purple
                              { lending: 'rgb(34, 197, 94)', backstop: 'rgb(134, 239, 172)' },   // Green
                              { lending: 'rgb(249, 115, 22)', backstop: 'rgb(253, 186, 116)' },  // Orange
                            ]
                            const colorPair = colors[index % colors.length]

                            return [
                              <Bar
                                key={`${pool.poolId}_lending`}
                                dataKey={`${pool.poolKey}_lending${suffix}`}
                                stackId={pool.poolId}
                                fill={colorPair.lending}
                                radius={[0, 0, 0, 0]}
                              />,
                              <Bar
                                key={`${pool.poolId}_backstop`}
                                dataKey={`${pool.poolKey}_backstop${suffix}`}
                                stackId={pool.poolId}
                                fill={colorPair.backstop}
                                radius={[2, 2, 0, 0]}
                              />
                            ]
                          })}
                        </BarChart>
                      </ChartContainer>
                      {/* Legend */}
                      <div className="flex flex-wrap justify-center gap-3 mt-2">
                        {perPoolChartData.pools.map((pool, index) => {
                          const colors = [
                            { lending: 'rgb(59, 130, 246)', backstop: 'rgb(147, 197, 253)' },
                            { lending: 'rgb(168, 85, 247)', backstop: 'rgb(216, 180, 254)' },
                            { lending: 'rgb(34, 197, 94)', backstop: 'rgb(134, 239, 172)' },
                            { lending: 'rgb(249, 115, 22)', backstop: 'rgb(253, 186, 116)' },
                          ]
                          const colorPair = colors[index % colors.length]

                          return (
                            <div key={pool.poolId} className="flex items-center gap-1.5 text-[10px]">
                              <div className="flex gap-0.5">
                                <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: colorPair.lending }} />
                                <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: colorPair.backstop }} />
                              </div>
                              <span className="text-muted-foreground">{pool.poolKey}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

          </>
        )}
        </div>
      </div>
    </DashboardLayout>
  )
}

export default function RealizedYieldPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <RealizedYieldContent />
    </Suspense>
  )
}
