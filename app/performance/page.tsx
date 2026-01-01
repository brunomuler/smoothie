"use client"

import { useState, useMemo, Suspense } from "react"
import Link from "next/link"
import { ArrowLeft, TrendingUp, TrendingDown, Shield, PiggyBank, Calendar, Wallet, Info } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
import { LP_TOKEN_ADDRESS } from "@/lib/constants"
import { DashboardLayout } from "@/components/dashboard-layout"
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
  } = useWalletState()

  const publicKey = activeWallet?.publicKey

  // Get blend positions for current prices and balances
  const { blndPrice, lpTokenPrice, data: blendSnapshot, backstopPositions, totalBackstopUsd, isLoading: isLoadingPositions, totalEmissions: unclaimedBlndTokens } = useBlendPositions(publicKey)

  // Build SDK prices map
  const sdkPricesMap = useMemo(() => {
    const map: Record<string, number> = {}
    if (blendSnapshot?.positions) {
      blendSnapshot.positions.forEach(pos => {
        if (pos.assetId && pos.price?.usdPrice && pos.price.usdPrice > 0) {
          map[pos.assetId] = pos.price.usdPrice
        }
      })
    }
    if (lpTokenPrice && lpTokenPrice > 0) {
      map[LP_TOKEN_ADDRESS] = lpTokenPrice
    }
    return map
  }, [blendSnapshot?.positions, lpTokenPrice])

  // Wait for SDK prices to be ready before fetching performance data
  // This prevents a flash of incorrect values when prices load
  const sdkReady = !isLoadingPositions && blendSnapshot !== undefined

  const { data, isLoading } = useRealizedYield({
    publicKey,
    sdkBlndPrice: blndPrice ?? 0,
    sdkLpPrice: lpTokenPrice ?? 0,
    sdkPrices: sdkPricesMap,
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

  // Determine display state based on whether user has current positions
  const hasCurrentPositions = unrealizedData.totalCurrentUsd > 0
  const totalPnlPositive = displayPnl.totalPnl >= 0

  if (!activeWallet) {
    return (
      <DashboardLayout
        wallets={wallets}
        activeWallet={activeWallet}
        onSelectWallet={handleSelectWallet}
        onConnectWallet={handleConnectWallet}
        onDisconnect={handleDisconnect}
      >
        <div className="text-center py-12 px-4">
          <Wallet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-xl font-semibold mb-2">Connect a wallet</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Connect a wallet to view your realized yield and P&L history.
          </p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout
      wallets={wallets}
      activeWallet={activeWallet}
      onSelectWallet={handleSelectWallet}
      onConnectWallet={handleConnectWallet}
      onDisconnect={handleDisconnect}
    >
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">Performance</h1>
            <p className="text-xs text-muted-foreground">
              Track your P&L and activity over time
            </p>
          </div>
        </div>

        {(isLoading || !sdkReady) ? (
          <div className="space-y-4">
            <Card>
              <CardContent>
                <div className="space-y-4">
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-10 w-48" />
                  <Skeleton className="h-4 w-64" />
                </div>
              </CardContent>
            </Card>
            <div className="grid grid-cols-2 gap-3">
              {[...Array(2)].map((_, i) => (
                <Card key={i} className="py-4">
                  <CardContent>
                    <Skeleton className="h-4 w-20 mb-2" />
                    <Skeleton className="h-6 w-28" />
                  </CardContent>
                </Card>
              ))}
            </div>
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
            {data.cumulativeRealized.length > 1 && (data.emissions.usdValue > 0 || unrealizedData.totalUnrealized !== 0) && (
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
                      data={data.cumulativeRealized.map((d, i, arr) => {
                        // For unrealized, we estimate based on the final unrealized value
                        // distributed proportionally based on cost basis at each point
                        const costBasis = d.cumulativeDeposited - (d.cumulativeWithdrawn - d.cumulativeRealizedPnl)
                        const finalCostBasis = unrealizedData.totalCostBasis || 1
                        const unrealizedEstimate = costBasis > 0 ? (costBasis / finalCostBasis) * displayPnl.totalUnrealized : 0
                        return {
                          ...d,
                          unrealized: unrealizedEstimate,
                          total: d.cumulativeRealizedPnl + unrealizedEstimate,
                        }
                      })}
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
                        tick={{ fontSize: 10 }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => {
                          const absValue = Math.abs(value)
                          if (absValue >= 1000) {
                            return `$${formatNumber(absValue / 1000, 0)}k`
                          }
                          return `$${formatNumber(absValue, 0)}`
                        }}
                        tick={{ fontSize: 9 }}
                        width={45}
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
                                      P&L: {chartData.total >= 0 ? '+' : ''}{formatUsd(chartData.total)}
                                    </p>
                                  )}
                                  {mainChartTab === 'realized' && (
                                    <p className="font-medium text-emerald-400">
                                      Realized: +{formatUsd(chartData.cumulativeRealizedPnl)}
                                    </p>
                                  )}
                                  {mainChartTab === 'unrealized' && (
                                    <p className="font-medium text-blue-500">
                                      Unrealized: {chartData.unrealized >= 0 ? '+' : ''}{formatUsd(chartData.unrealized)}
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
                          type="stepAfter"
                          dataKey="cumulativeRealizedPnl"
                          stroke="rgb(34, 197, 94)"
                          strokeWidth={2}
                          fill="url(#realizedGradientPositive)"
                        />
                      )}
                      {mainChartTab === 'unrealized' && (
                        <Area
                          type="monotone"
                          dataKey="unrealized"
                          stroke="rgb(59, 130, 246)"
                          strokeWidth={2}
                          fill="url(#unrealizedGradient)"
                        />
                      )}
                      {mainChartTab === 'total' && (
                        <Area
                          type="monotone"
                          dataKey="total"
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
                <CardTitle className="text-sm font-medium">Breakdown by Source</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 sm:space-y-3">
                {/* Pools */}
                {(data.pools.deposited > 0 || data.pools.withdrawn > 0) && (
                  <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-full bg-blue-500/10">
                        <PiggyBank className="h-3.5 w-3.5 text-blue-500" />
                      </div>
                      <p className="font-medium text-sm">Lending Pools</p>
                    </div>
                    <div className="pl-7 space-y-1 text-sm">
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
                  <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-full bg-purple-500/10">
                        <Shield className="h-3.5 w-3.5 text-purple-500" />
                      </div>
                      <p className="font-medium text-sm">Backstop</p>
                    </div>
                    <div className="pl-7 space-y-1 text-sm">
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

                {/* Combined P&L Chart by Source */}
                {((data.cumulativeBySource?.pools?.length > 1) || (data.cumulativeBySource?.backstop?.length > 1)) && (
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
                    <ChartContainer config={chartConfig} className="h-24 w-full">
                      <AreaChart
                        data={(() => {
                          // Create lookup maps for each source
                          const poolsRealizedMap = new Map<string, number>()
                          const backstopRealizedMap = new Map<string, number>()
                          const poolsCostBasisMap = new Map<string, number>()
                          const backstopCostBasisMap = new Map<string, number>()

                          for (const d of data.cumulativeBySource?.pools || []) {
                            poolsRealizedMap.set(d.date, d.cumulativeRealizedPnl)
                            poolsCostBasisMap.set(d.date, d.cumulativeDeposited - (d.cumulativeWithdrawn - d.cumulativeRealizedPnl))
                          }
                          for (const d of data.cumulativeBySource?.backstop || []) {
                            backstopRealizedMap.set(d.date, d.cumulativeRealizedPnl)
                            backstopCostBasisMap.set(d.date, d.cumulativeDeposited - (d.cumulativeWithdrawn - d.cumulativeRealizedPnl))
                          }

                          // Get all unique dates and sort them
                          const allDates = new Set<string>([...poolsRealizedMap.keys(), ...backstopRealizedMap.keys()])
                          const sortedDates = Array.from(allDates).sort()

                          // Build merged array with carried forward values
                          let lastPoolsRealized = 0, lastBackstopRealized = 0
                          let lastPoolsCostBasis = 0, lastBackstopCostBasis = 0
                          const finalPoolsCostBasis = unrealizedData.poolsCostBasis || 1
                          const finalBackstopCostBasis = unrealizedData.backstopCostBasis || 1

                          return sortedDates.map(date => {
                            if (poolsRealizedMap.has(date)) {
                              lastPoolsRealized = poolsRealizedMap.get(date)!
                              lastPoolsCostBasis = poolsCostBasisMap.get(date)!
                            }
                            if (backstopRealizedMap.has(date)) {
                              lastBackstopRealized = backstopRealizedMap.get(date)!
                              lastBackstopCostBasis = backstopCostBasisMap.get(date)!
                            }
                            // Estimate unrealized based on cost basis proportion
                            const poolsUnrealizedEst = lastPoolsCostBasis > 0 ? (lastPoolsCostBasis / finalPoolsCostBasis) * displayPnl.poolsUnrealized : 0
                            const backstopUnrealizedEst = lastBackstopCostBasis > 0 ? (lastBackstopCostBasis / finalBackstopCostBasis) * displayPnl.backstopUnrealized : 0
                            return {
                              date,
                              poolsRealized: lastPoolsRealized,
                              backstopRealized: lastBackstopRealized,
                              poolsUnrealized: poolsUnrealizedEst,
                              backstopUnrealized: backstopUnrealizedEst,
                              poolsTotal: lastPoolsRealized + poolsUnrealizedEst,
                              backstopTotal: lastBackstopRealized + backstopUnrealizedEst,
                            }
                          })
                        })()}
                        margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
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
                        <YAxis domain={['dataMin', 'dataMax']} hide />
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
              </CardContent>
            </Card>

            {/* Per-Pool Breakdown */}
            {perPoolBreakdown.length > 0 && (
              <Card>
                <CardHeader className="pb-2 sm:pb-3">
                  <CardTitle className="text-sm font-medium">Activity by Pool</CardTitle>
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
                        className="p-3 rounded-lg bg-muted/50 space-y-3"
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
                            <div className="pl-7 space-y-1 text-sm">
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
                            <div className="pl-7 space-y-1 text-sm">
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
                  {data.cumulativeByPool && data.cumulativeByPool.length > 0 && data.cumulativeByPool.some(p =>
                    p.timeSeries.some(ts => ts.lendingRealizedPnl > 0 || ts.backstopRealizedPnl > 0)
                  ) && (
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
                      <ChartContainer config={chartConfig} className="h-40 w-full">
                        <BarChart
                          data={(() => {
                            // Calculate total deposits per pool for proportional unrealized distribution
                            const poolDeposits = new Map<string, { lending: number; backstop: number }>()
                            for (const poolData of perPoolBreakdown) {
                              const poolKey = data.cumulativeByPool?.find(p => p.poolId === poolData.poolId)?.poolName || poolData.poolId.slice(0, 8)
                              poolDeposits.set(poolKey, {
                                lending: poolData.lending.deposited,
                                backstop: poolData.backstop.deposited,
                              })
                            }

                            // Calculate totals for proportional distribution
                            const totalPoolsDeposited = data.pools.deposited || 1
                            const totalBackstopDeposited = data.backstop.deposited || 1

                            // Merge all pool time series into a single dataset
                            const dateMap = new Map<string, Record<string, string | number>>()

                            for (const pool of data.cumulativeByPool || []) {
                              const poolKey = pool.poolName || pool.poolId.slice(0, 8)
                              const deposits = poolDeposits.get(poolKey) || { lending: 0, backstop: 0 }

                              // Calculate this pool's share of unrealized P&L
                              const lendingUnrealizedShare = deposits.lending > 0
                                ? (deposits.lending / totalPoolsDeposited) * displayPnl.poolsUnrealized
                                : 0
                              const backstopUnrealizedShare = deposits.backstop > 0
                                ? (deposits.backstop / totalBackstopDeposited) * displayPnl.backstopUnrealized
                                : 0

                              for (const ts of pool.timeSeries) {
                                const existing = dateMap.get(ts.date) || { date: ts.date }
                                // Realized
                                existing[`${poolKey}_lending_realized`] = ts.lendingRealizedPnl
                                existing[`${poolKey}_backstop_realized`] = ts.backstopRealizedPnl
                                // Unrealized (estimate based on proportion)
                                existing[`${poolKey}_lending_unrealized`] = lendingUnrealizedShare
                                existing[`${poolKey}_backstop_unrealized`] = backstopUnrealizedShare
                                // Total
                                existing[`${poolKey}_lending_total`] = ts.lendingRealizedPnl + lendingUnrealizedShare
                                existing[`${poolKey}_backstop_total`] = ts.backstopRealizedPnl + backstopUnrealizedShare
                                dateMap.set(ts.date, existing)
                              }
                            }

                            // Convert to array and sort by date
                            return Array.from(dateMap.values())
                              .sort((a, b) => String(a.date).localeCompare(String(b.date)))
                          })()}
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
                              if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`
                              return `$${value.toFixed(0)}`
                            }}
                            tick={{ fontSize: 9 }}
                            width={40}
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
                                      {(data.cumulativeByPool || []).map(pool => {
                                        const poolKey = pool.poolName || pool.poolId.slice(0, 8)
                                        const lending = chartData[`${poolKey}_lending${suffix}`] || 0
                                        const backstop = chartData[`${poolKey}_backstop${suffix}`] || 0
                                        if (lending === 0 && backstop === 0) return null
                                        return (
                                          <div key={pool.poolId}>
                                            <p className="font-medium text-muted-foreground">{poolKey}</p>
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
                          {(data.cumulativeByPool || []).map((pool, index) => {
                            const poolKey = pool.poolName || pool.poolId.slice(0, 8)
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
                                dataKey={`${poolKey}_lending${suffix}`}
                                stackId={pool.poolId}
                                fill={colorPair.lending}
                                radius={[0, 0, 0, 0]}
                              />,
                              <Bar
                                key={`${pool.poolId}_backstop`}
                                dataKey={`${poolKey}_backstop${suffix}`}
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
                        {(data.cumulativeByPool || []).map((pool, index) => {
                          const poolKey = pool.poolName || pool.poolId.slice(0, 8)
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
                              <span className="text-muted-foreground">{poolKey}</span>
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
