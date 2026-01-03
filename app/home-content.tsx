"use client"

import { useMemo, useEffect, useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useAnalytics } from "@/hooks/use-analytics"
import { generateChartData, type PoolProjectionInput } from "@/lib/chart-utils"
import { useWalletState } from "@/hooks/use-wallet-state"
import { useBalanceHistoryData } from "@/hooks/use-balance-history-data"
import { useComputedBalance } from "@/hooks/use-computed-balance"
import { useChartHistoricalPrices } from "@/hooks/use-chart-historical-prices"
import { useHistoricalYieldBreakdown } from "@/hooks/use-historical-yield-breakdown"
import { AuthenticatedPage } from "@/components/authenticated-page"
import { WalletBalance } from "@/components/wallet-balance"
import { useBlendPositions } from "@/hooks/use-blend-positions"
import { useDisplayPreferences } from "@/contexts/display-preferences-context"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ArrowDownFromLine, PiggyBank } from "lucide-react"
import { BlndRewardsCard } from "@/components/blnd-rewards-card"
import { PortfolioAllocationBar } from "@/components/portfolio-allocation-bar"
import { SupplyPositions } from "@/components/supply-positions"
import { BorrowPositions } from "@/components/borrow-positions"
import { LP_TOKEN_ADDRESS } from "@/lib/constants"

export function HomeContent() {
  const queryClient = useQueryClient()
  const { activeWallet } = useWalletState()
  const { capture } = useAnalytics()
  const { preferences: displayPreferences } = useDisplayPreferences()

  // Handle pull-to-refresh
  const handleRefresh = useCallback(async () => {
    if (!activeWallet?.publicKey) return

    capture('pull_to_refresh')

    // Invalidate all queries related to wallet data to trigger refetch
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["blend-wallet-snapshot", activeWallet.publicKey] }),
      queryClient.invalidateQueries({ queryKey: ["backstop-cost-basis", activeWallet.publicKey] }),
      queryClient.invalidateQueries({ queryKey: ["balance-history-batch", activeWallet.publicKey] }),
      queryClient.invalidateQueries({ queryKey: ["backstop-balance-history", activeWallet.publicKey] }),
      queryClient.invalidateQueries({ queryKey: ["transactions", activeWallet.publicKey] }),
    ])
  }, [activeWallet?.publicKey, queryClient, capture])

  // Track page view
  useEffect(() => {
    capture('page_viewed', {
      page: activeWallet ? 'dashboard' : 'landing'
    })
  }, [capture, activeWallet])

  const { balanceData: initialBalanceData, assetCards, isLoading, error, data: blendSnapshot, totalEmissions, blndPrice, lpTokenPrice, backstopPositions } = useBlendPositions(
    activeWallet?.publicKey,
    undefined // We'll calculate totalCostBasis separately
  )

  const chartData = useMemo(
    () => generateChartData(initialBalanceData.rawBalance),
    [initialBalanceData.rawBalance]
  )

  // Fetch balance history data for all assets
  const {
    uniqueAssetAddresses,
    balanceHistoryQueries,
    backstopBalanceHistoryQuery,
    poolAssetCostBasisMap,
    poolAssetBorrowCostBasisMap,
    balanceHistoryDataMap,
  } = useBalanceHistoryData(activeWallet?.publicKey, assetCards, blendSnapshot)

  // Build SDK prices map from blend positions for historical price lookups
  const sdkPricesMap = useMemo(() => {
    const map = new Map<string, number>()
    if (!blendSnapshot?.positions) return map

    blendSnapshot.positions.forEach(pos => {
      if (pos.assetId && pos.price?.usdPrice && pos.price.usdPrice > 0) {
        map.set(pos.assetId, pos.price.usdPrice)
      }
    })

    // Add LP token price if available
    if (lpTokenPrice && lpTokenPrice > 0) {
      map.set(LP_TOKEN_ADDRESS, lpTokenPrice)
    }

    return map
  }, [blendSnapshot?.positions, lpTokenPrice])

  // Extract all unique dates from balance history for historical price lookups
  const chartDates = useMemo(() => {
    const datesSet = new Set<string>()

    // Collect dates from all asset histories
    balanceHistoryDataMap.forEach((historyData) => {
      historyData.chartData.forEach((point) => {
        datesSet.add(point.date)
      })
    })

    // Also add backstop dates
    backstopBalanceHistoryQuery.data?.history?.forEach((point) => {
      datesSet.add(point.date)
    })

    return Array.from(datesSet).sort()
  }, [balanceHistoryDataMap, backstopBalanceHistoryQuery.data?.history])

  // Build the full list of token addresses for historical prices (assets + LP token)
  const allTokenAddresses = useMemo(() => {
    const addresses = [...uniqueAssetAddresses]
    // Include LP token for backstop historical pricing
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

  // Compute derived balance data (enriched cards, aggregated history, etc.)
  const {
    enrichedAssetCards,
    balanceData,
    aggregatedHistoryData,
  } = useComputedBalance(
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
    displayPreferences.showPriceChanges  // When false, chart uses current prices instead of historical
  )

  // Fetch historical yield breakdown data for tooltips
  const yieldBreakdown = useHistoricalYieldBreakdown(
    activeWallet?.publicKey,
    blendSnapshot?.positions,
    backstopPositions,
    lpTokenPrice
  )

  // Merge yield breakdown data into enriched asset cards
  // This updates BOTH the earnedYield value AND adds the breakdown tooltip data
  const enrichedAssetCardsWithBreakdown = useMemo(() => {
    if (yieldBreakdown.isLoading || yieldBreakdown.byAsset.size === 0) {
      return enrichedAssetCards
    }

    return enrichedAssetCards.map(card => {
      const breakdown = yieldBreakdown.byAsset.get(card.id)
      if (!breakdown) {
        return card
      }

      return {
        ...card,
        // Update the displayed yield value with historical calculation
        earnedYield: breakdown.totalEarnedUsd,
        // Update the yield percentage (not growthPercentage - that's for BLND APY)
        yieldPercentage: breakdown.totalEarnedPercent,
        // Add the full breakdown for tooltip
        yieldBreakdown: {
          costBasisHistorical: breakdown.costBasisHistorical,
          weightedAvgDepositPrice: breakdown.weightedAvgDepositPrice,
          netDepositedTokens: breakdown.netDepositedTokens,
          protocolYieldTokens: breakdown.protocolYieldTokens,
          protocolYieldUsd: breakdown.protocolYieldUsd,
          priceChangeUsd: breakdown.priceChangeUsd,
          priceChangePercent: breakdown.priceChangePercent,
          currentValueUsd: breakdown.currentValueUsd,
          totalEarnedUsd: breakdown.totalEarnedUsd,
          totalEarnedPercent: breakdown.totalEarnedPercent,
        },
      }
    })
  }, [enrichedAssetCards, yieldBreakdown.byAsset, yieldBreakdown.isLoading])

  // Enrich backstop positions with per-pool yield breakdown data
  const backstopPositionsWithBreakdown = useMemo(() => {
    // If no backstop breakdowns available, return original positions
    if (yieldBreakdown.byBackstop.size === 0) {
      return backstopPositions
    }

    // Add the pool-specific yield breakdown to each backstop position
    return backstopPositions.map(bp => {
      const poolBreakdown = yieldBreakdown.byBackstop.get(bp.poolId)
      if (!poolBreakdown) {
        return bp
      }
      return {
        ...bp,
        yieldBreakdown: {
          costBasisHistorical: poolBreakdown.costBasisHistorical,
          protocolYieldUsd: poolBreakdown.protocolYieldUsd,
          priceChangeUsd: poolBreakdown.priceChangeUsd,
          totalEarnedUsd: poolBreakdown.totalEarnedUsd,
          totalEarnedPercent: poolBreakdown.totalEarnedPercent,
        },
      }
    })
  }, [backstopPositions, yieldBreakdown.byBackstop])

  // Override balanceData with historical yield calculations when available
  const balanceDataWithHistorical = useMemo(() => {
    // Only use historical data if it's loaded and has meaningful values
    if (yieldBreakdown.isLoading || yieldBreakdown.totalCostBasisHistorical <= 0) {
      return balanceData
    }

    const usdFormatter = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })

    // Use historical yield calculations
    const historicalYield = yieldBreakdown.totalEarnedUsd
    const historicalYieldPercent = yieldBreakdown.totalCostBasisHistorical > 0
      ? (historicalYield / yieldBreakdown.totalCostBasisHistorical) * 100
      : 0

    return {
      ...balanceData,
      interestEarned: `$${usdFormatter.format(historicalYield)}`,
      rawInterestEarned: historicalYield,
      growthPercentage: historicalYieldPercent,
    }
  }, [balanceData, yieldBreakdown.isLoading, yieldBreakdown.totalCostBasisHistorical, yieldBreakdown.totalEarnedUsd])

  // Override the latest chart bar's yield with yield breakdown value for consistency
  // This ensures the chart's latest bar matches the "Total Yield" displayed at top
  const aggregatedHistoryDataWithCorrectYield = useMemo(() => {
    if (!aggregatedHistoryData?.chartData || aggregatedHistoryData.chartData.length === 0) {
      return aggregatedHistoryData
    }

    // Only override if we have valid yield breakdown data
    if (yieldBreakdown.isLoading || yieldBreakdown.totalCostBasisHistorical <= 0) {
      return aggregatedHistoryData
    }

    // Get today's date string in local timezone (matches chart data format)
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    // Find the latest chart point (should be today or most recent)
    const chartData = [...aggregatedHistoryData.chartData]
    const latestIndex = chartData.length - 1

    if (latestIndex >= 0) {
      const latestPoint = chartData[latestIndex]

      // Only override if this is today's data (or very recent)
      if (latestPoint.date >= today || latestIndex === chartData.length - 1) {
        // Override the yield with yieldBreakdown.totalEarnedUsd
        chartData[latestIndex] = {
          ...latestPoint,
          yield: yieldBreakdown.totalEarnedUsd,
        }
      }
    }

    return {
      ...aggregatedHistoryData,
      chartData,
    }
  }, [aggregatedHistoryData, yieldBreakdown.isLoading, yieldBreakdown.totalCostBasisHistorical, yieldBreakdown.totalEarnedUsd])

  // Build per-pool data for projection breakdown
  // This must be before conditional returns to follow Rules of Hooks
  const poolInputs = useMemo((): PoolProjectionInput[] => {
    if (!blendSnapshot?.poolEstimates || blendSnapshot.poolEstimates.length === 0) {
      return []
    }

    // Get per-pool BLND APY from positions (weighted by supply value in each pool)
    const poolBlndApyMap = new Map<string, number>()
    if (blendSnapshot.positions) {
      // Group positions by pool and calculate weighted BLND APY
      const poolSupplyTotals = new Map<string, number>()
      const poolBlndWeighted = new Map<string, number>()

      for (const pos of blendSnapshot.positions) {
        const poolId = pos.poolId
        const supplyValue = pos.supplyUsdValue || 0
        const blndApyValue = pos.blndApy || 0

        poolSupplyTotals.set(poolId, (poolSupplyTotals.get(poolId) || 0) + supplyValue)
        poolBlndWeighted.set(poolId, (poolBlndWeighted.get(poolId) || 0) + supplyValue * blndApyValue)
      }

      // Calculate weighted average BLND APY per pool
      for (const [poolId, total] of poolSupplyTotals) {
        if (total > 0) {
          poolBlndApyMap.set(poolId, (poolBlndWeighted.get(poolId) || 0) / total)
        }
      }
    }

    return blendSnapshot.poolEstimates
      .filter(pe => pe.totalSupplied > 0) // Only include pools with positions
      .map(pe => ({
        poolId: pe.poolId,
        poolName: pe.poolName,
        balance: pe.totalSupplied,
        supplyApy: pe.supplyApy || 0,
        blndApy: poolBlndApyMap.get(pe.poolId) || 0,
      }))
  }, [blendSnapshot?.poolEstimates, blendSnapshot?.positions])

  // Check if there are no positions AND no history (empty account)
  const hasNoPositions = !isLoading && assetCards.length === 0 && backstopPositions.length === 0
  const hasNoHistory = !aggregatedHistoryData?.isLoading && (!aggregatedHistoryData?.chartData || aggregatedHistoryData.chartData.length === 0)
  const isEmptyAccount = hasNoPositions && hasNoHistory

  return (
    <AuthenticatedPage onRefresh={handleRefresh} error={error}>
      {isEmptyAccount ? (
        <div className="text-center py-12 px-4">
          <h2 className="text-xl font-semibold mb-2">No Blend positions yet</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Start earning yield by depositing assets into Blend pools. Your positions and earnings history will appear here.
          </p>
        </div>
      ) : (
        <>
          <WalletBalance
            data={balanceDataWithHistorical}
            chartData={chartData}
            publicKey={activeWallet!.publicKey}
            balanceHistoryData={aggregatedHistoryDataWithCorrectYield ?? undefined}
            loading={isLoading || !aggregatedHistoryDataWithCorrectYield || aggregatedHistoryDataWithCorrectYield.isLoading}
            usdcPrice={1}
            poolInputs={poolInputs}
            yieldBreakdown={!yieldBreakdown.isLoading && yieldBreakdown.totalCostBasisHistorical > 0 ? {
              totalProtocolYieldUsd: yieldBreakdown.totalProtocolYieldUsd,
              totalPriceChangeUsd: yieldBreakdown.totalPriceChangeUsd,
              totalCostBasisHistorical: yieldBreakdown.totalCostBasisHistorical,
              totalEarnedUsd: yieldBreakdown.totalEarnedUsd,
            } : undefined}
            balanceHistoryDataMap={balanceHistoryDataMap}
            historicalPrices={historicalPrices}
            blendPositions={blendSnapshot?.positions}
            backstopPositions={backstopPositions}
            lpTokenPrice={lpTokenPrice}
          />

          {(isLoading || totalEmissions > 0 || backstopPositions.some(bp => bp.lpTokens > 0)) && (
            <BlndRewardsCard
              publicKey={activeWallet!.publicKey}
              pendingEmissions={totalEmissions}
              pendingSupplyEmissions={blendSnapshot?.totalSupplyEmissions}
              pendingBorrowEmissions={blendSnapshot?.totalBorrowEmissions}
              backstopClaimableBlnd={backstopPositions.reduce((sum, bp) => sum + (bp.claimableBlnd || 0), 0)}
              blndPrice={blndPrice}
              blndPerLpToken={backstopPositions[0]?.blndAmount && backstopPositions[0]?.lpTokens
                ? backstopPositions[0].blndAmount / backstopPositions[0].lpTokens
                : 0}
              blndApy={balanceData.blndApy}
              totalPositionUsd={(blendSnapshot?.totalSupplyUsd || 0) + (blendSnapshot?.totalBorrowUsd || 0) + (blendSnapshot?.totalBackstopUsd || 0)}
              isLoading={isLoading}
              perPoolEmissions={blendSnapshot?.perPoolEmissions}
              perPoolSupplyEmissions={blendSnapshot?.perPoolSupplyEmissions}
              perPoolBorrowEmissions={blendSnapshot?.perPoolBorrowEmissions}
              backstopPositions={backstopPositions.map(bp => ({
                poolId: bp.poolId,
                poolName: bp.poolName,
                claimableBlnd: bp.claimableBlnd,
              }))}
              poolNames={blendSnapshot?.positions?.reduce((acc, pos) => {
                if (pos.poolId && pos.poolName) {
                  acc[pos.poolId] = pos.poolName
                }
                return acc
              }, {} as Record<string, string>) || {}}
            />
          )}

          <Tabs defaultValue="positions" className="w-full" onValueChange={(tab) => capture('tab_changed', { tab })}>
            <TabsList className="grid w-full grid-cols-2 h-10 sm:h-11 mb-2 bg-transparent border border-gray-500/20 rounded-lg">
              <TabsTrigger value="positions" className="gap-1.5 text-xs sm:text-sm">
                <PiggyBank className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                Supplied
              </TabsTrigger>
              <TabsTrigger value="borrows" className="gap-1.5 text-xs sm:text-sm">
                <ArrowDownFromLine className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                Borrowed
              </TabsTrigger>
            </TabsList>

            <TabsContent value="positions" className="space-y-4">
              <PortfolioAllocationBar
                positions={blendSnapshot?.positions || []}
                backstopPositions={backstopPositions}
                isLoading={isLoading}
              />

              <SupplyPositions
                isLoading={isLoading}
                enrichedAssetCards={enrichedAssetCardsWithBreakdown}
                backstopPositions={backstopPositionsWithBreakdown}
                blendSnapshot={blendSnapshot}
                onPoolClick={(poolId, poolName) => capture('pool_clicked', { pool_id: poolId, pool_name: poolName })}
              />
            </TabsContent>

            <TabsContent value="borrows" className="space-y-4">
              <BorrowPositions
                blendSnapshot={blendSnapshot}
                enrichedAssetCards={enrichedAssetCardsWithBreakdown}
                poolAssetBorrowCostBasisMap={poolAssetBorrowCostBasisMap}
                onPoolClick={(poolId, poolName) => capture('pool_clicked', { pool_id: poolId, pool_name: poolName })}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </AuthenticatedPage>
  )
}
