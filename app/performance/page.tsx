"use client"

import { useMemo, Suspense, useEffect, useState } from "react"
import { TrendingUp, TrendingDown, Shield, PiggyBank, Calendar, Wallet, Banknote } from "lucide-react"
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
import { useBorrowYieldBreakdown } from "@/hooks/use-borrow-yield-breakdown"
import { useAnalytics } from "@/hooks/use-analytics"
import { AuthenticatedPage } from "@/components/authenticated-page"
import { PageTitle } from "@/components/page-title"
import { useWalletState } from "@/hooks/use-wallet-state"
import { InfoLabel } from "@/components/performance"
import { PoolLogo } from "@/components/pool-logo"
import { PnlChangeChart } from "@/components/pnl-change-chart"
import { usePnlChangeChart, type PnlPeriodType } from "@/hooks/use-pnl-change-chart"

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

  const [pnlChartPeriod, setPnlChartPeriod] = useState<PnlPeriodType>("1W")

  const { activeWallet } = useWalletState()

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

  // Build borrow positions for cost breakdown
  const borrowPositions = useMemo(() => {
    if (!blendSnapshot?.positions) return []
    return blendSnapshot.positions.filter(pos => pos.borrowAmount > 0)
  }, [blendSnapshot?.positions])

  // Borrow cost breakdown (similar to yield breakdown but for debt)
  const borrowBreakdown = useBorrowYieldBreakdown(
    publicKey,
    borrowPositions.length > 0 ? borrowPositions : null
  )

  // Check if user has any borrows
  const hasBorrows = borrowPositions.length > 0 && borrowBreakdown.totalCurrentDebtUsd > 0

  // P&L change chart data
  const { data: pnlChartData, isLoading: isLoadingPnlChart } = usePnlChangeChart({
    publicKey,
    period: pnlChartPeriod,
    enabled: !!publicKey && sdkReady,
  })

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
      lending: { protocolYieldUsd: number; totalEarnedUsd: number; priceChangeUsd: number }
      backstop: { protocolYieldUsd: number; totalEarnedUsd: number; priceChangeUsd: number }
    }>()

    // Aggregate lending yield by poolId from byAsset (keyed by poolId-assetAddress)
    for (const [compositeKey, breakdown] of yieldBreakdown.byAsset) {
      // compositeKey format is "poolId-assetAddress", extract poolId
      const poolId = compositeKey.split('-')[0]
      const existing = poolData.get(poolId) || {
        lending: { protocolYieldUsd: 0, totalEarnedUsd: 0, priceChangeUsd: 0 },
        backstop: { protocolYieldUsd: 0, totalEarnedUsd: 0, priceChangeUsd: 0 },
      }
      existing.lending.protocolYieldUsd += breakdown.protocolYieldUsd
      existing.lending.totalEarnedUsd += breakdown.totalEarnedUsd
      existing.lending.priceChangeUsd += breakdown.priceChangeUsd
      poolData.set(poolId, existing)
    }

    // Add backstop yield by poolId
    for (const [poolId, breakdown] of yieldBreakdown.byBackstop) {
      const existing = poolData.get(poolId) || {
        lending: { protocolYieldUsd: 0, totalEarnedUsd: 0, priceChangeUsd: 0 },
        backstop: { protocolYieldUsd: 0, totalEarnedUsd: 0, priceChangeUsd: 0 },
      }
      existing.backstop.protocolYieldUsd += breakdown.protocolYieldUsd
      existing.backstop.totalEarnedUsd += breakdown.totalEarnedUsd
      existing.backstop.priceChangeUsd += breakdown.priceChangeUsd
      poolData.set(poolId, existing)
    }

    return poolData
  }, [yieldBreakdown.byAsset, yieldBreakdown.byBackstop])

  // Calculate per-pool borrow data from borrowBreakdown (for per-pool breakdown)
  const perPoolBorrowData = useMemo(() => {
    const poolData = new Map<string, {
      currentDebtUsd: number
      principalUsd: number
      interestAccruedUsd: number
      priceChangeOnDebtUsd: number
      totalCostUsd: number
    }>()

    // Aggregate borrow data by poolId from byAsset (keyed by poolId-assetAddress)
    for (const [compositeKey, breakdown] of borrowBreakdown.byAsset) {
      // compositeKey format is "poolId-assetAddress", extract poolId
      const poolId = compositeKey.split('-')[0]
      const existing = poolData.get(poolId) || {
        currentDebtUsd: 0,
        principalUsd: 0,
        interestAccruedUsd: 0,
        priceChangeOnDebtUsd: 0,
        totalCostUsd: 0,
      }
      existing.currentDebtUsd += breakdown.currentDebtUsd
      existing.principalUsd += breakdown.borrowCostBasisUsd
      existing.interestAccruedUsd += breakdown.interestAccruedUsd
      existing.priceChangeOnDebtUsd += breakdown.priceChangeOnDebtUsd
      existing.totalCostUsd += breakdown.totalCostUsd
      poolData.set(poolId, existing)
    }

    return poolData
  }, [borrowBreakdown.byAsset])

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
    let poolsPriceChange = 0
    for (const breakdown of yieldBreakdown.byAsset.values()) {
      poolsProtocolYield += breakdown.protocolYieldUsd
      poolsTotalEarned += breakdown.totalEarnedUsd
      poolsPriceChange += breakdown.priceChangeUsd
    }

    // Calculate backstop values from yieldBreakdown.byBackstop (active positions only)
    let backstopProtocolYield = 0
    let backstopTotalEarned = 0
    let backstopPriceChange = 0
    for (const breakdown of yieldBreakdown.byBackstop.values()) {
      backstopProtocolYield += breakdown.protocolYieldUsd
      backstopTotalEarned += breakdown.totalEarnedUsd
      backstopPriceChange += breakdown.priceChangeUsd
    }

    // Add realized yield from exited positions
    poolsProtocolYield += realizedYieldFromExitedPositions.pools
    poolsTotalEarned += realizedYieldFromExitedPositions.pools
    backstopProtocolYield += realizedYieldFromExitedPositions.backstop
    backstopTotalEarned += realizedYieldFromExitedPositions.backstop

    // Realized P&L = emissions (BLND/LP claims)
    const totalEmissions = emissionsBySource.pools.usd + emissionsBySource.backstop.usd

    // Borrow costs (interest + price change on debt)
    // Note: For borrowers, these are costs that reduce P&L
    const borrowInterestCost = borrowBreakdown.totalInterestAccruedUsd
    const borrowPriceChangeCost = borrowBreakdown.totalPriceChangeOnDebtUsd
    const borrowTotalCost = borrowBreakdown.totalCostUsd

    if (showPriceChanges) {
      // Include price changes: use totalEarnedUsd (same as home page)
      const totalUnrealized = poolsTotalEarned + backstopTotalEarned
      // Total P&L = yield (unrealized + realized from exits) + emissions - borrow costs
      const totalPnl = totalUnrealized + totalEmissions - borrowTotalCost
      return {
        totalPnl,
        poolsUnrealized: poolsTotalEarned,
        backstopUnrealized: backstopTotalEarned,
        totalUnrealized,
        realizedFromWithdrawals: totalEmissions,
        poolsYield: poolsProtocolYield,
        backstopYield: backstopProtocolYield,
        poolsPriceChange,
        backstopPriceChange,
        // Borrow data
        borrowInterestCost,
        borrowPriceChangeCost,
        borrowTotalCost,
      }
    } else {
      // Exclude price changes: use protocolYieldUsd only (same as home page)
      const totalUnrealized = poolsProtocolYield + backstopProtocolYield
      // Total P&L = yield + emissions - borrow interest cost (exclude price change)
      const totalPnl = totalUnrealized + totalEmissions - borrowInterestCost
      return {
        totalPnl,
        poolsUnrealized: poolsProtocolYield,
        backstopUnrealized: backstopProtocolYield,
        totalUnrealized,
        realizedFromWithdrawals: totalEmissions,
        poolsYield: poolsProtocolYield,
        backstopYield: backstopProtocolYield,
        poolsPriceChange,
        backstopPriceChange,
        // Borrow data
        borrowInterestCost,
        borrowPriceChangeCost,
        borrowTotalCost: borrowInterestCost, // Only interest when price changes excluded
      }
    }
  }, [showPriceChanges, yieldBreakdown, emissionsBySource, realizedYieldFromExitedPositions, borrowBreakdown])

  // Determine display state based on whether user has current positions
  const hasCurrentPositions = unrealizedData.totalCurrentUsd > 0
  const totalPnlPositive = displayPnl.totalPnl >= 0

  return (
    <AuthenticatedPage>
      <TooltipProvider>
      <div>
        <PageTitle badge="Beta">Performance</PageTitle>

        <div className="space-y-4 sm:space-y-6">
        {(isLoading || !sdkReady) ? (
          <div className="space-y-4 sm:space-y-6">
            {/* Hero Summary Card Skeleton */}
            <Card>
              <CardContent>
                <div className="flex items-start justify-between mb-4">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <div className="flex items-baseline gap-3">
                      <Skeleton className="h-9 w-36" />
                      <Skeleton className="h-5 w-14 rounded-full" />
                    </div>
                  </div>
                  <Skeleton className="h-9 w-9 rounded-full" />
                </div>
                <Separator className="my-4" />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-5 w-24" />
                  </div>
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-5 w-24" />
                  </div>
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-5 w-24" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Date Info Skeleton */}
            <div className="flex items-center justify-center gap-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>

            {/* P&L Over Time Chart Skeleton */}
            <div className="space-y-3 mt-8">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="aspect-[3/1] md:aspect-[4/1] w-full" />
              <Skeleton className="aspect-[5/1] md:aspect-[6/1] w-full" />
              <div className="flex justify-center">
                <Skeleton className="h-9 sm:h-10 w-40 rounded-md" />
              </div>
            </div>

            {/* Breakdown by Source Skeleton */}
            <div className="space-y-3">
              <Skeleton className="h-5 w-36" />
              <Card>
                <CardContent className="space-y-4 pt-4">
                  {/* Lending Pools Section */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-7 w-7 rounded-full" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                      <div className="flex justify-between">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                      <div className="flex justify-between">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                      <div className="flex justify-between pt-3">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    </div>
                  </div>

                  {/* Backstop Section */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-7 w-7 rounded-full" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                      <div className="flex justify-between">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                      <div className="flex justify-between">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                      <div className="flex justify-between pt-3">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Summary */}
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                    <div className="flex justify-between">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                    <div className="flex justify-between">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <Skeleton className="h-5 w-20" />
                      <Skeleton className="h-6 w-28" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Breakdown by Pool Skeleton */}
            <div className="space-y-3">
              <Skeleton className="h-5 w-32" />
              <Card>
                <CardContent className="space-y-4 pt-4">
                  {/* Pool Item */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-5 rounded-full" />
                      <Skeleton className="h-4 w-28" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-7 w-7 rounded-full" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                      <div className="flex justify-between">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                      <div className="flex justify-between pt-3">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    </div>
                    <div className="pt-3 space-y-2">
                      <div className="flex justify-between">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                      <div className="flex justify-between">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                      <Separator className="my-1" />
                      <div className="flex justify-between">
                        <Skeleton className="h-5 w-20" />
                        <Skeleton className="h-6 w-24" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
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
                            label={hasBorrows ? "Net P&L" : "Total P&L"}
                            tooltip={hasBorrows
                              ? "Supply P&L minus Borrow Costs. Your net profit from Blend protocol."
                              : "(Current Balance + Withdrawn) - Deposited. Your total profit from Blend protocol."}
                          />
                        </p>
                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
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
                    {/* P&L Breakdown when user has borrows */}
                    {hasBorrows && (
                      <div className="mt-4 pt-4 border-t border-border/50 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            <InfoLabel label="Supply P&L" tooltip="Profit from lending: Yield earned + Price changes on deposits" />
                          </span>
                          <span className={`tabular-nums font-medium ${(displayPnl.totalUnrealized + displayPnl.realizedFromWithdrawals) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {(displayPnl.totalUnrealized + displayPnl.realizedFromWithdrawals) >= 0 ? "+" : ""}{formatUsd(displayPnl.totalUnrealized + displayPnl.realizedFromWithdrawals)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            <InfoLabel label="Borrow Cost" tooltip="Cost of borrowing: Interest accrued + Price changes on debt" />
                          </span>
                          <span className={`tabular-nums font-medium ${displayPnl.borrowTotalCost > 0 ? "text-orange-400" : "text-emerald-400"}`}>
                            {displayPnl.borrowTotalCost > 0 ? "-" : "+"}{formatUsd(Math.abs(displayPnl.borrowTotalCost))}
                          </span>
                        </div>
                      </div>
                    )}
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
              <div className="flex items-center justify-center gap-4 text-xs sm:text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Since {formatDate(data.firstActivityDate)}</span>
                </div>
                <span>•</span>
                <span>{data.daysActive} days active</span>
              </div>
            )}

            {/* P&L Over Time Chart */}
            <div className="space-y-3 mt-8">
              <h2 className="text-base font-semibold">P&L Over Time</h2>
              <PnlChangeChart
                data={pnlChartData}
                period={pnlChartPeriod}
                onPeriodChange={setPnlChartPeriod}
                showPriceChanges={showPriceChanges}
                isLoading={isLoadingPnlChart}
              />
            </div>

            {/* Breakdown by Source */}
            <div className="space-y-3 mt-8">
              <h2 className="text-base font-semibold">Breakdown by Source</h2>
              <Card>
                <CardContent className="space-y-4">
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
                      {displayPnl.poolsYield !== 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            <InfoLabel label="Yield" tooltip="Interest earned from lending. This is protocol yield (tokens earned × current price)." />
                          </span>
                          <span className={`tabular-nums ${displayPnl.poolsYield >= 0 ? "" : "text-red-400"}`}>{formatUsd(displayPnl.poolsYield)}</span>
                        </div>
                      )}
                      {showPriceChanges && displayPnl.poolsPriceChange !== 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            <InfoLabel
                              label="Price Change"
                              tooltip="Impact of price changes on your deposited assets. Price increase = your deposits are worth more."
                            />
                          </span>
                          <span className={`tabular-nums ${displayPnl.poolsPriceChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {displayPnl.poolsPriceChange >= 0 ? "+" : ""}{formatUsd(displayPnl.poolsPriceChange)}
                          </span>
                        </div>
                      )}
                      {unrealizedData.poolsCurrentUsd > 0 && (
                        <>
                          <div className="flex justify-between items-center pt-2 border-t border-border/50">
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
                          <div className="flex justify-between items-center font-semibold text-base pt-2 border-t border-border/50">
                            <span>
                              <InfoLabel label="P&L" tooltip="Profit from lending yield. Pool emissions shown in summary below." />
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
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Backstop */}
                {(data.backstop.deposited > 0 || data.backstop.withdrawn > 0) && (
                  <div className="space-y-2 mt-6">
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
                      {displayPnl.backstopYield !== 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            <InfoLabel label="Yield" tooltip="LP token appreciation from backstop positions. This is protocol yield." />
                          </span>
                          <span className={`tabular-nums ${displayPnl.backstopYield >= 0 ? "" : "text-red-400"}`}>{formatUsd(displayPnl.backstopYield)}</span>
                        </div>
                      )}
                      {showPriceChanges && displayPnl.backstopPriceChange !== 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            <InfoLabel
                              label="Price Change"
                              tooltip="Impact of LP token price changes on your backstop position. Price increase = your position is worth more."
                            />
                          </span>
                          <span className={`tabular-nums ${displayPnl.backstopPriceChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {displayPnl.backstopPriceChange >= 0 ? "+" : ""}{formatUsd(displayPnl.backstopPriceChange)}
                          </span>
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
                        <div className="flex justify-between items-center pt-2 border-t border-border/50">
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
                          <div className="flex justify-between items-center pt-2 border-t border-border/50">
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
                          <div className="flex justify-between items-center font-semibold text-base pt-2 border-t border-border/50">
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

                {/* Borrow Positions (Costs) */}
                {hasBorrows && (
                  <div className="space-y-2 mt-6">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-full bg-orange-500/10">
                        <Banknote className="h-3.5 w-3.5 text-orange-500" />
                      </div>
                      <p className="font-medium text-sm">Borrows</p>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Current Debt</span>
                        <span className="tabular-nums">{formatUsd(borrowBreakdown.totalCurrentDebtUsd)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          <InfoLabel label="Principal" tooltip="Original amount borrowed at borrow-time prices (net of repayments)." />
                        </span>
                        <span className="tabular-nums">{formatUsd(borrowBreakdown.totalBorrowCostBasisUsd)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          <InfoLabel label="Interest Accrued" tooltip="Interest owed beyond the original borrowed amount. This is your borrowing cost." />
                        </span>
                        <span className="tabular-nums text-orange-400">{displayPnl.borrowInterestCost > 0 ? "-" : ""}{formatUsd(Math.abs(displayPnl.borrowInterestCost))}</span>
                      </div>
                      {showPriceChanges && displayPnl.borrowPriceChangeCost !== 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            <InfoLabel
                              label="Price Change"
                              tooltip="Impact of price changes on debt. Price increase = debt is more expensive to repay (bad for borrower)."
                            />
                          </span>
                          <span className={`tabular-nums ${displayPnl.borrowPriceChangeCost > 0 ? "text-red-400" : "text-emerald-400"}`}>
                            {displayPnl.borrowPriceChangeCost > 0 ? "-" : "+"}{formatUsd(Math.abs(displayPnl.borrowPriceChangeCost))}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-center font-semibold text-base pt-2 border-t border-border/50">
                        <span>
                          <InfoLabel label="Borrow Cost" tooltip="Total cost of borrowing: Interest + Price Impact (negative = cost to you)" />
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={`tabular-nums ${displayPnl.borrowTotalCost > 0 ? "text-orange-400" : "text-emerald-400"}`}>
                            {displayPnl.borrowTotalCost > 0 ? "-" : "+"}{formatUsd(Math.abs(displayPnl.borrowTotalCost))}
                          </span>
                          {borrowBreakdown.totalBorrowCostBasisUsd > 0 && (
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${displayPnl.borrowTotalCost > 0 ? "text-orange-400 border-orange-400/30" : "text-emerald-400 border-emerald-400/30"}`}>
                              {displayPnl.borrowTotalCost > 0 ? "-" : "+"}{Math.abs((displayPnl.borrowTotalCost / borrowBreakdown.totalBorrowCostBasisUsd) * 100).toFixed(1)}%
                            </Badge>
                          )}
                        </div>
                      </div>
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
                      {hasBorrows && (
                        <div className="flex items-center justify-between text-sm">
                          <p className="text-muted-foreground">Current Debt</p>
                          <p className="font-medium tabular-nums text-orange-400">-{formatUsd(borrowBreakdown.totalCurrentDebtUsd)}</p>
                        </div>
                      )}
                      {emissionsBySource.pools.usd > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <p className="text-muted-foreground">
                            <InfoLabel label="Pool Emissions" tooltip="BLND tokens claimed from pool positions (supply and/or borrow)." />
                          </p>
                          <p className="font-medium tabular-nums">{formatUsd(emissionsBySource.pools.usd)}</p>
                        </div>
                      )}
                      {unclaimedEmissions.pools.usd > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <p className="text-muted-foreground">
                            <InfoLabel label="Unclaimed Emissions" tooltip="BLND tokens available to claim from pool positions (supply and/or borrow)." />
                          </p>
                          <p className="font-medium tabular-nums">{formatUsd(unclaimedEmissions.pools.usd)}</p>
                        </div>
                      )}
                      <div className="flex items-center justify-between bg-muted/50 -mx-4 px-4 py-2 rounded-md mt-3">
                        <p className="font-semibold">
                          <InfoLabel
                            label="Total P&L"
                            tooltip={hasBorrows
                              ? "Net profit: Supply Yield + Emissions - Borrow Costs"
                              : "Total profit: Yield + Emissions"}
                          />
                        </p>
                        <p className={`text-lg font-bold tabular-nums ${displayPnl.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {displayPnl.totalPnl >= 0 ? "+" : ""}{formatUsd(displayPnl.totalPnl)}
                        </p>
                      </div>
                    </>
                  )}
                  {unrealizedData.totalCurrentUsd === 0 && (
                    <div className="flex items-center justify-between bg-muted/50 -mx-4 px-4 py-2 rounded-md mt-3">
                      <p className="font-semibold">{data.realizedPnl >= 0 ? "Realized Profit" : "Net Cash Flow"}</p>
                      <p className={`text-lg font-bold tabular-nums ${data.realizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {data.realizedPnl >= 0 ? "+" : ""}{formatUsd(data.realizedPnl)}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            </div>

            {/* Per-Pool Breakdown */}
            {perPoolBreakdown.length > 0 && (
              <div className="space-y-3 mt-8">
                <h2 className="text-base font-semibold">Breakdown by Pool</h2>
                <Card>
                  <CardContent className="space-y-4">
                  {perPoolBreakdown.map((poolData, poolIndex) => {
                    const totalDeposited = poolData.lending.deposited + poolData.backstop.deposited
                    const totalEmissions = poolData.lending.emissionsClaimed + poolData.backstop.emissionsClaimed

                    // Get actual per-pool current balances from SDK positions
                    const poolBalances = perPoolCurrentBalances.get(poolData.poolId)
                    const lendingCurrentBalance = poolBalances?.lending ?? 0
                    const backstopCurrentBalance = poolBalances?.backstop ?? 0

                    // Get per-pool yield data (consistent with source breakdown)
                    const poolYield = perPoolYieldData.get(poolData.poolId)

                    // For active positions: use yield breakdown data
                    // For exited positions: yield is realized = Withdrawn - Deposited (already included in withdrawal)
                    const lendingProtocolYield = lendingCurrentBalance > 0
                      ? (poolYield?.lending.protocolYieldUsd ?? 0)
                      : Math.max(0, poolData.lending.withdrawn - poolData.lending.deposited) // Realized yield from withdrawal
                    const lendingPriceChange = lendingCurrentBalance > 0
                      ? (poolYield?.lending.priceChangeUsd ?? 0)
                      : 0 // No price change for exited positions
                    const lendingYield = showPriceChanges
                      ? lendingProtocolYield + lendingPriceChange
                      : lendingProtocolYield

                    const backstopProtocolYield = backstopCurrentBalance > 0
                      ? (poolYield?.backstop.protocolYieldUsd ?? 0)
                      : Math.max(0, poolData.backstop.withdrawn - poolData.backstop.deposited) // Realized yield from withdrawal
                    const backstopPriceChange = backstopCurrentBalance > 0
                      ? (poolYield?.backstop.priceChangeUsd ?? 0)
                      : 0 // No price change for exited positions
                    const backstopYield = showPriceChanges
                      ? backstopProtocolYield + backstopPriceChange
                      : backstopProtocolYield

                    // Get per-pool borrow data
                    const poolBorrow = perPoolBorrowData.get(poolData.poolId)
                    const poolBorrowCost = showPriceChanges
                      ? (poolBorrow?.totalCostUsd ?? 0)
                      : (poolBorrow?.interestAccruedUsd ?? 0) // Exclude price change when setting is off

                    // Total P&L = Yield + Emissions - Borrow Cost
                    // Note: Pool emissions (from lending.emissionsClaimed) are shown at pool level
                    // since we can't distinguish between supply vs borrow emissions
                    const lendingTotalPnl = lendingYield // Emissions shown separately at pool level
                    const backstopTotalPnl = backstopYield + poolData.backstop.emissionsClaimed
                    const poolEmissions = poolData.lending.emissionsClaimed // Pool-level emissions (supply + borrow combined)

                    const poolTotalPnl = lendingTotalPnl + backstopTotalPnl + poolEmissions - poolBorrowCost
                    const poolTotalCurrentBalance = lendingCurrentBalance + backstopCurrentBalance

                    return (
                      <div
                        key={poolData.poolId}
                        className="space-y-4"
                      >
                        {poolIndex > 0 && <div className="pt-4" />}
                        {/* Pool Header */}
                        <div className="flex items-center gap-3">
                          <PoolLogo poolName={poolData.poolName || poolData.poolId} size={28} />
                          <p className="font-semibold text-lg">
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
                              {lendingProtocolYield !== 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    <InfoLabel
                                      label="Yield"
                                      tooltip={lendingCurrentBalance > 0
                                        ? "Interest earned from lending. This is protocol yield."
                                        : "Interest earned from lending (realized when withdrawn)."}
                                    />
                                  </span>
                                  <span className={`tabular-nums ${lendingProtocolYield >= 0 ? "" : "text-red-400"}`}>{formatUsd(lendingProtocolYield)}</span>
                                </div>
                              )}
                              {showPriceChanges && lendingPriceChange !== 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    <InfoLabel
                                      label="Price Change"
                                      tooltip="Impact of price changes on your deposited assets."
                                    />
                                  </span>
                                  <span className={`tabular-nums ${lendingPriceChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                    {lendingPriceChange >= 0 ? "+" : ""}{formatUsd(lendingPriceChange)}
                                  </span>
                                </div>
                              )}
                              {/* P&L Section */}
                              <div className="flex justify-between items-center font-semibold text-base pt-2 border-t border-border/50">
                                <span>
                                  <InfoLabel label="P&L" tooltip="Profit from lending yield. Pool emissions shown separately below." />
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
                          <div className="space-y-2 mt-6">
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
                              {backstopProtocolYield !== 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    <InfoLabel
                                      label="Yield"
                                      tooltip={backstopCurrentBalance > 0
                                        ? "LP token appreciation from backstop positions. This is protocol yield."
                                        : "LP token appreciation (realized when withdrawn)."}
                                    />
                                  </span>
                                  <span className={`tabular-nums ${backstopProtocolYield >= 0 ? "" : "text-red-400"}`}>{formatUsd(backstopProtocolYield)}</span>
                                </div>
                              )}
                              {showPriceChanges && backstopPriceChange !== 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    <InfoLabel
                                      label="Price Change"
                                      tooltip="Impact of LP token price changes on your backstop position."
                                    />
                                  </span>
                                  <span className={`tabular-nums ${backstopPriceChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                    {backstopPriceChange >= 0 ? "+" : ""}{formatUsd(backstopPriceChange)}
                                  </span>
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
                              <div className="flex justify-between items-center font-semibold text-base pt-2 border-t border-border/50">
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

                        {/* Borrows Position */}
                        {poolBorrow && poolBorrow.currentDebtUsd > 0 && (
                          <div className="space-y-2 mt-6">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 rounded-full bg-orange-500/10">
                                <Banknote className="h-3.5 w-3.5 text-orange-500" />
                              </div>
                              <p className="font-medium text-sm">Borrows</p>
                            </div>
                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Current Debt</span>
                                <span className="tabular-nums">{formatUsd(poolBorrow.currentDebtUsd)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  <InfoLabel label="Principal" tooltip="Original amount borrowed at borrow-time prices (net of repayments)." />
                                </span>
                                <span className="tabular-nums">{formatUsd(poolBorrow.principalUsd)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  <InfoLabel label="Interest Accrued" tooltip="Interest owed beyond the original borrowed amount." />
                                </span>
                                <span className="tabular-nums text-orange-400">
                                  {poolBorrow.interestAccruedUsd > 0 ? "-" : ""}{formatUsd(Math.abs(poolBorrow.interestAccruedUsd))}
                                </span>
                              </div>
                              {showPriceChanges && poolBorrow.priceChangeOnDebtUsd !== 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    <InfoLabel label="Price Change" tooltip="Impact of price changes on debt. Price increase = debt is more expensive to repay." />
                                  </span>
                                  <span className={`tabular-nums ${poolBorrow.priceChangeOnDebtUsd > 0 ? "text-red-400" : "text-emerald-400"}`}>
                                    {poolBorrow.priceChangeOnDebtUsd > 0 ? "-" : "+"}{formatUsd(Math.abs(poolBorrow.priceChangeOnDebtUsd))}
                                  </span>
                                </div>
                              )}
                              {/* Borrow Cost Section */}
                              <div className="flex justify-between items-center font-semibold text-base pt-2 border-t border-border/50">
                                <span>
                                  <InfoLabel label="Borrow Cost" tooltip="Total cost of borrowing: Interest + Price Impact" />
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className={`tabular-nums ${poolBorrowCost > 0 ? "text-orange-400" : "text-emerald-400"}`}>
                                    {poolBorrowCost > 0 ? "-" : "+"}{formatUsd(Math.abs(poolBorrowCost))}
                                  </span>
                                  {poolBorrow.principalUsd > 0 && (
                                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${poolBorrowCost > 0 ? "text-orange-400 border-orange-400/30" : "text-emerald-400 border-emerald-400/30"}`}>
                                      {poolBorrowCost > 0 ? "-" : "+"}{Math.abs((poolBorrowCost / poolBorrow.principalUsd) * 100).toFixed(1)}%
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Pool Summary */}
                        <div className="pt-4 border-t border-border/50 space-y-1">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Current Balance</span>
                            <span className="tabular-nums font-medium">{formatUsd(poolTotalCurrentBalance)}</span>
                          </div>
                          {poolBorrow && poolBorrow.currentDebtUsd > 0 && (
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-muted-foreground">Current Debt</span>
                              <span className="tabular-nums font-medium text-orange-400">-{formatUsd(poolBorrow.currentDebtUsd)}</span>
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
                          {poolEmissions > 0 && (
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-muted-foreground">
                                <InfoLabel label="Pool Emissions" tooltip="BLND tokens claimed from this pool's lending positions (supply and/or borrow)." />
                              </span>
                              <span className="tabular-nums font-medium">{formatUsd(poolEmissions)}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center bg-muted/50 -mx-4 px-4 py-2 rounded-md mt-3">
                            <span className="font-semibold">{poolBorrow && poolBorrow.currentDebtUsd > 0 ? "Net P&L" : "Total P&L"}</span>
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
    </AuthenticatedPage>
  )
}

function PerformanceSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header skeleton */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between px-4">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-9 w-32 rounded-full" />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-4 sm:space-y-6">
        {/* Page title skeleton */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-5 w-10 rounded-full" />
        </div>

        {/* Hero Summary Card Skeleton */}
        <Card>
          <CardContent>
            <div className="flex items-start justify-between mb-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <div className="flex items-baseline gap-3">
                  <Skeleton className="h-9 w-36" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
              </div>
              <Skeleton className="h-9 w-9 rounded-full" />
            </div>
            <Separator className="my-4" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="space-y-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-24" />
              </div>
              <div className="space-y-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-24" />
              </div>
              <div className="space-y-1 col-span-2 sm:col-span-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-24" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Date Info Skeleton */}
        <div className="flex items-center justify-center gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>

        {/* P&L Over Time Chart Skeleton */}
        <div className="space-y-3 mt-8">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="aspect-[3/1] md:aspect-[4/1] w-full" />
          <Skeleton className="aspect-[5/1] md:aspect-[6/1] w-full" />
          <div className="flex justify-center">
            <Skeleton className="h-9 sm:h-10 w-40 rounded-md" />
          </div>
        </div>

        {/* Breakdown by Source Skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-36" />
          <Card>
            <CardContent className="space-y-4 pt-4">
              {/* Lending Pools Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-7 w-7 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="flex justify-between pt-3">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
              </div>

              {/* Backstop Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-7 w-7 rounded-full" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="flex justify-between pt-3">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Summary */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Separator />
                <div className="flex justify-between">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-6 w-28" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Breakdown by Pool Skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-32" />
          <Card>
            <CardContent className="space-y-4 pt-4">
              {/* Pool Item */}
              <div className="space-y-3">
                <Skeleton className="h-4 w-28" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-7 w-7 rounded-full" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="flex justify-between pt-3">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
                <div className="pt-3 space-y-2">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Separator className="my-1" />
                  <div className="flex justify-between">
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-6 w-24" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

export default function RealizedYieldPage() {
  return (
    <Suspense fallback={<PerformanceSkeleton />}>
      <RealizedYieldContent />
    </Suspense>
  )
}
