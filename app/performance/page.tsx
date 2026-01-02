"use client"

import { useMemo, Suspense, useEffect } from "react"
import { TrendingUp, TrendingDown, Shield, PiggyBank, Calendar, Wallet } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useRealizedYield } from "@/hooks/use-realized-yield"
import { useBlendPositions } from "@/hooks/use-blend-positions"
import { useCurrencyPreference } from "@/hooks/use-currency-preference"
import { useDisplayPreferences } from "@/contexts/display-preferences-context"
import { useHistoricalYieldBreakdown } from "@/hooks/use-historical-yield-breakdown"
import { useAnalytics } from "@/hooks/use-analytics"
import { DashboardLayout } from "@/components/dashboard-layout"
import { LandingPage } from "@/components/landing-page"
import { PageTitle } from "@/components/page-title"
import { useWalletState } from "@/hooks/use-wallet-state"
import { InfoLabel } from "@/components/performance"

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}


function RealizedYieldContent() {
  const { capture } = useAnalytics()
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
  const { blndPrice, lpTokenPrice, data: blendSnapshot, backstopPositions, totalBackstopUsd, isLoading: isLoadingPositions, totalEmissions: unclaimedBlndTokens } = useBlendPositions(publicKey)

  // Build SDK prices as Record for useRealizedYield
  const sdkPricesRecord = useMemo(() => {
    const record: Record<string, number> = {}
    if (!blendSnapshot?.positions) return record

    blendSnapshot.positions.forEach(pos => {
      if (pos.assetId && pos.price?.usdPrice && pos.price.usdPrice > 0) {
        record[pos.assetId] = pos.price.usdPrice
      }
    })

    return record
  }, [blendSnapshot?.positions])

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

  // Calculate actual per-pool balances from SDK positions (not proportional estimates)
  const perPoolCurrentBalances = useMemo(() => {
    const balances = new Map<string, { lending: number; backstop: number }>()

    // Aggregate lending positions by poolId
    if (blendSnapshot?.positions) {
      for (const pos of blendSnapshot.positions) {
        const existing = balances.get(pos.poolId) || { lending: 0, backstop: 0 }
        existing.lending += pos.supplyUsdValue || 0
        balances.set(pos.poolId, existing)
      }
    }

    // Add backstop positions by poolId
    if (backstopPositions) {
      for (const bp of backstopPositions) {
        const existing = balances.get(bp.poolId) || { lending: 0, backstop: 0 }
        existing.backstop += bp.lpTokensUsd || 0
        balances.set(bp.poolId, existing)
      }
    }

    return balances
  }, [blendSnapshot?.positions, backstopPositions])

  // Calculate per-pool yield data from yieldBreakdown (consistent with source breakdown)
  const perPoolYieldData = useMemo(() => {
    const poolData = new Map<string, {
      lending: { protocolYieldUsd: number; totalEarnedUsd: number }
      backstop: { protocolYieldUsd: number; totalEarnedUsd: number }
    }>()

    // Aggregate lending yield by poolId from byAsset (keyed by poolId-assetAddress)
    for (const [compositeKey, breakdown] of yieldBreakdown.byAsset) {
      // compositeKey format is "poolId-assetAddress", extract poolId
      const poolId = compositeKey.split('-')[0]
      const existing = poolData.get(poolId) || {
        lending: { protocolYieldUsd: 0, totalEarnedUsd: 0 },
        backstop: { protocolYieldUsd: 0, totalEarnedUsd: 0 },
      }
      existing.lending.protocolYieldUsd += breakdown.protocolYieldUsd
      existing.lending.totalEarnedUsd += breakdown.totalEarnedUsd
      poolData.set(poolId, existing)
    }

    // Add backstop yield by poolId
    for (const [poolId, breakdown] of yieldBreakdown.byBackstop) {
      const existing = poolData.get(poolId) || {
        lending: { protocolYieldUsd: 0, totalEarnedUsd: 0 },
        backstop: { protocolYieldUsd: 0, totalEarnedUsd: 0 },
      }
      existing.backstop.protocolYieldUsd += breakdown.protocolYieldUsd
      existing.backstop.totalEarnedUsd += breakdown.totalEarnedUsd
      poolData.set(poolId, existing)
    }

    return poolData
  }, [yieldBreakdown.byAsset, yieldBreakdown.byBackstop])

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

  // Calculate realized yield from fully exited positions (not included in yieldBreakdown)
  // For exited positions: realized yield = Withdrawn - Deposited (if positive)
  const realizedYieldFromExitedPositions = useMemo(() => {
    if (!data?.transactions) return { pools: 0, backstop: 0 }

    // Get pools with current positions from perPoolCurrentBalances
    const poolsWithCurrentBalance = new Set<string>()
    for (const [poolId, balances] of perPoolCurrentBalances) {
      if (balances.lending > 0 || balances.backstop > 0) {
        poolsWithCurrentBalance.add(poolId)
      }
    }

    // Calculate realized yield from exited positions using perPoolBreakdown data
    let poolsRealizedYield = 0
    let backstopRealizedYield = 0

    // We need to aggregate by pool from transactions
    const poolMap = new Map<string, {
      lending: { deposited: number; withdrawn: number }
      backstop: { deposited: number; withdrawn: number }
    }>()

    for (const tx of data.transactions) {
      if (tx.type === 'claim') continue // Skip emissions

      const existing = poolMap.get(tx.poolId) || {
        lending: { deposited: 0, withdrawn: 0 },
        backstop: { deposited: 0, withdrawn: 0 },
      }

      const target = tx.source === 'pool' ? existing.lending : existing.backstop

      if (tx.type === 'deposit') {
        target.deposited += tx.valueUsd
      } else {
        target.withdrawn += tx.valueUsd
      }

      poolMap.set(tx.poolId, existing)
    }

    // For pools with no current balance, count realized yield
    for (const [poolId, poolData] of poolMap) {
      const currentBalances = perPoolCurrentBalances.get(poolId)
      const lendingCurrentBalance = currentBalances?.lending ?? 0
      const backstopCurrentBalance = currentBalances?.backstop ?? 0

      // Lending: if no current balance, count realized yield
      if (lendingCurrentBalance === 0 && poolData.lending.deposited > 0) {
        const realizedYield = Math.max(0, poolData.lending.withdrawn - poolData.lending.deposited)
        poolsRealizedYield += realizedYield
      }

      // Backstop: if no current balance, count realized yield
      if (backstopCurrentBalance === 0 && poolData.backstop.deposited > 0) {
        const realizedYield = Math.max(0, poolData.backstop.withdrawn - poolData.backstop.deposited)
        backstopRealizedYield += realizedYield
      }
    }

    return { pools: poolsRealizedYield, backstop: backstopRealizedYield }
  }, [data?.transactions, perPoolCurrentBalances])

  // Display P&L values based on showPriceChanges setting
  // Uses yieldBreakdown (same as home page) for consistency
  // When OFF: show only protocol yield (excludes price changes)
  // When ON: show total earned (includes price changes)
  const displayPnl = useMemo(() => {
    // Calculate pools values from yieldBreakdown.byAsset (active positions only)
    let poolsProtocolYield = 0
    let poolsTotalEarned = 0
    for (const breakdown of yieldBreakdown.byAsset.values()) {
      poolsProtocolYield += breakdown.protocolYieldUsd
      poolsTotalEarned += breakdown.totalEarnedUsd
    }

    // Calculate backstop values from yieldBreakdown.byBackstop (active positions only)
    let backstopProtocolYield = 0
    let backstopTotalEarned = 0
    for (const breakdown of yieldBreakdown.byBackstop.values()) {
      backstopProtocolYield += breakdown.protocolYieldUsd
      backstopTotalEarned += breakdown.totalEarnedUsd
    }

    // Add realized yield from exited positions
    poolsProtocolYield += realizedYieldFromExitedPositions.pools
    poolsTotalEarned += realizedYieldFromExitedPositions.pools
    backstopProtocolYield += realizedYieldFromExitedPositions.backstop
    backstopTotalEarned += realizedYieldFromExitedPositions.backstop

    // Realized P&L = emissions (BLND/LP claims)
    const totalEmissions = emissionsBySource.pools.usd + emissionsBySource.backstop.usd

    if (showPriceChanges) {
      // Include price changes: use totalEarnedUsd (same as home page)
      const totalUnrealized = poolsTotalEarned + backstopTotalEarned
      // Total P&L = yield (unrealized + realized from exits) + emissions
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
      // Total P&L = yield + emissions
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
  }, [showPriceChanges, yieldBreakdown, emissionsBySource, realizedYieldFromExitedPositions])

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
      <TooltipProvider>
      <div>
        <PageTitle badge="Beta">Performance</PageTitle>

        <div className="space-y-4 sm:space-y-6">
        {(isLoading || !sdkReady) ? (
          <div className="space-y-4 sm:space-y-6">
            {/* Summary Skeleton */}
            <div className="rounded-xl border bg-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-40" />
                </div>
                <Skeleton className="h-10 w-10 rounded-full" />
              </div>
              <div className="flex gap-6">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-20" />
              </div>
            </div>

            {/* Breakdown Skeleton */}
            <div className="rounded-xl border bg-card p-6 space-y-3">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
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
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Since {formatDate(data.firstActivityDate)}</span>
                </div>
                <span>•</span>
                <span>{data.daysActive} days active</span>
              </div>
            )}

            {/* Breakdown by Source */}
            <div className="space-y-3">
              <h2 className="text-base font-semibold">Breakdown by Source</h2>
              <Card>
                <CardContent className="space-y-4 pt-4">
                {/* Pools */}
                {(data.pools.deposited > 0 || data.pools.withdrawn > 0) && (
                  <div className="space-y-2">
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
                  <div className="space-y-2">
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
                <div className="space-y-2">
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
            </div>

            {/* Per-Pool Breakdown */}
            {perPoolBreakdown.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-base font-semibold">Breakdown by Pool</h2>
                <Card>
                  <CardContent className="space-y-4 pt-4">
                  {perPoolBreakdown.map((poolData, poolIndex) => {
                    const totalDeposited = poolData.lending.deposited + poolData.backstop.deposited
                    const totalEmissions = poolData.lending.emissionsClaimed + poolData.backstop.emissionsClaimed

                    // Get actual per-pool current balances from SDK positions
                    const poolBalances = perPoolCurrentBalances.get(poolData.poolId)
                    const lendingCurrentBalance = poolBalances?.lending ?? 0
                    const backstopCurrentBalance = poolBalances?.backstop ?? 0

                    // Get per-pool yield data (consistent with source breakdown)
                    const poolYield = perPoolYieldData.get(poolData.poolId)

                    // For active positions: use yield breakdown data (respects showPriceChanges setting)
                    // For exited positions: yield is realized = Withdrawn - Deposited (already included in withdrawal)
                    const lendingYield = lendingCurrentBalance > 0
                      ? (showPriceChanges
                          ? (poolYield?.lending.totalEarnedUsd ?? 0)
                          : (poolYield?.lending.protocolYieldUsd ?? 0))
                      : Math.max(0, poolData.lending.withdrawn - poolData.lending.deposited) // Realized yield from withdrawal
                    const backstopYield = backstopCurrentBalance > 0
                      ? (showPriceChanges
                          ? (poolYield?.backstop.totalEarnedUsd ?? 0)
                          : (poolYield?.backstop.protocolYieldUsd ?? 0))
                      : Math.max(0, poolData.backstop.withdrawn - poolData.backstop.deposited) // Realized yield from withdrawal

                    // Total P&L = Yield + Emissions
                    const lendingTotalPnl = lendingYield + poolData.lending.emissionsClaimed
                    const backstopTotalPnl = backstopYield + poolData.backstop.emissionsClaimed

                    const poolTotalPnl = lendingTotalPnl + backstopTotalPnl
                    const poolTotalCurrentBalance = lendingCurrentBalance + backstopCurrentBalance

                    return (
                      <div
                        key={poolData.poolId}
                        className="space-y-4"
                      >
                        {poolIndex > 0 && <Separator />}
                        {/* Pool Header */}
                        <p className="font-semibold text-sm">
                          {poolData.poolName || poolData.poolId.slice(0, 8) + '...'}
                        </p>

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
                              {lendingYield > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    <InfoLabel
                                      label="Yield"
                                      tooltip={lendingCurrentBalance > 0
                                        ? "Interest earned from lending. This is protocol yield."
                                        : "Interest earned from lending (realized when withdrawn)."}
                                    />
                                  </span>
                                  <span className="tabular-nums">{formatUsd(lendingYield)}</span>
                                </div>
                              )}
                              {poolData.lending.emissionsClaimed > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    <InfoLabel label="Emissions Claimed" tooltip="BLND tokens received as rewards from this lending position." />
                                  </span>
                                  <span className="tabular-nums">{formatUsd(poolData.lending.emissionsClaimed)}</span>
                                </div>
                              )}
                              {/* P&L Section */}
                              <div className="flex justify-between items-center font-medium pt-1 border-t border-border/50">
                                <span>
                                  <InfoLabel label="P&L" tooltip="Total profit: Yield + Emissions" />
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
                              {backstopYield > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    <InfoLabel
                                      label="Yield"
                                      tooltip={backstopCurrentBalance > 0
                                        ? "LP token appreciation from backstop positions. This is protocol yield."
                                        : "LP token appreciation (realized when withdrawn)."}
                                    />
                                  </span>
                                  <span className="tabular-nums">{formatUsd(backstopYield)}</span>
                                </div>
                              )}
                              {poolData.backstop.emissionsClaimed > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    <InfoLabel label="Emissions Claimed" tooltip="BLND and LP tokens received as rewards from this backstop position." />
                                  </span>
                                  <span className="tabular-nums">{formatUsd(poolData.backstop.emissionsClaimed)}</span>
                                </div>
                              )}
                              {/* P&L Section */}
                              <div className="flex justify-between items-center font-medium pt-1 border-t border-border/50">
                                <span>
                                  <InfoLabel label="P&L" tooltip="Total profit: Yield + Emissions" />
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
                            </div>
                          </div>
                        )}

                        {/* Pool Summary */}
                        <div className="pt-2 border-t border-border/50 space-y-1">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Current Balance</span>
                            <span className="tabular-nums font-medium">{formatUsd(poolTotalCurrentBalance)}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Total Deposited</span>
                            <span className="tabular-nums font-medium">{formatUsd(totalDeposited)}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Total Withdrawn</span>
                            <span className="tabular-nums font-medium">{formatUsd(poolData.lending.withdrawn + poolData.backstop.withdrawn)}</span>
                          </div>
                          <Separator className="my-1" />
                          <div className="flex justify-between items-center">
                            <span className="font-semibold">Total P&L</span>
                            <p className={`text-lg font-bold tabular-nums ${poolTotalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {poolTotalPnl >= 0 ? "+" : ""}{formatUsd(poolTotalPnl)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  </CardContent>
                </Card>
              </div>
            )}

          </>
        )}
        </div>
      </div>
      </TooltipProvider>
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
