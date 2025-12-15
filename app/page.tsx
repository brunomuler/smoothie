"use client"

import { useState, useMemo, useEffect, Suspense, useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { usePostHog } from "@/hooks/use-posthog"
import { generateChartData, type PoolProjectionInput } from "@/lib/chart-utils"
import { useWalletState } from "@/hooks/use-wallet-state"
import { useBalanceHistoryData } from "@/hooks/use-balance-history-data"
import { useComputedBalance } from "@/hooks/use-computed-balance"
import { LandingPage } from "@/components/landing-page"
import { DashboardLayout } from "@/components/dashboard-layout"
import { WalletBalance } from "@/components/wallet-balance"
import { TransactionHistory } from "@/components/transaction-history"
import { useBlendPositions } from "@/hooks/use-blend-positions"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ArrowDownFromLine, History, PiggyBank } from "lucide-react"
import { BlndRewardsCard } from "@/components/blnd-rewards-card"
import { SupplyPositions } from "@/components/supply-positions"
import { BorrowPositions } from "@/components/borrow-positions"

function HomeContent() {
  const queryClient = useQueryClient()
  const {
    wallets,
    activeWallet,
    handleSelectWallet,
    handleConnectWallet,
    handleDisconnect,
  } = useWalletState()
  const [isDemoMode, setIsDemoMode] = useState(false)
  const { capture } = usePostHog()

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
    capture('page_viewed', { page: 'home' })
  }, [capture])

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
    uniqueAssetAddresses
  )

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

  // Show landing page for non-logged-in users
  if (!activeWallet) {
    return (
      <LandingPage
        wallets={wallets}
        activeWallet={activeWallet}
        onSelectWallet={handleSelectWallet}
        onConnectWallet={handleConnectWallet}
        onDisconnect={handleDisconnect}
      />
    )
  }

  // Check if there are no positions AND no history (empty account)
  const hasNoPositions = !isLoading && assetCards.length === 0 && backstopPositions.length === 0
  const hasNoHistory = !aggregatedHistoryData?.isLoading && (!aggregatedHistoryData?.chartData || aggregatedHistoryData.chartData.length === 0)
  const isEmptyAccount = hasNoPositions && hasNoHistory

  return (
    <DashboardLayout
      wallets={wallets}
      activeWallet={activeWallet}
      onSelectWallet={handleSelectWallet}
      onConnectWallet={handleConnectWallet}
      onDisconnect={handleDisconnect}
      onRefresh={handleRefresh}
      error={error}
    >
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
            data={balanceData}
            chartData={chartData}
            publicKey={activeWallet.publicKey}
            balanceHistoryData={aggregatedHistoryData ?? undefined}
            loading={isLoading || !aggregatedHistoryData || aggregatedHistoryData.isLoading}
            isDemoMode={isDemoMode}
            onToggleDemoMode={() => setIsDemoMode(!isDemoMode)}
            usdcPrice={1}
            poolInputs={poolInputs}
          />

          <Tabs defaultValue="positions" className="w-full" onValueChange={(tab) => capture('tab_changed', { tab })}>
            <TabsList className="grid w-full grid-cols-3 h-10 sm:h-11 mb-2 bg-transparent border border-gray-500/20 rounded-lg">
              <TabsTrigger value="positions" className="gap-1.5 text-xs sm:text-sm">
                <PiggyBank className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                Supplied
              </TabsTrigger>
              <TabsTrigger value="borrows" className="gap-1.5 text-xs sm:text-sm">
                <ArrowDownFromLine className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                Borrowed
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-1.5 text-xs sm:text-sm">
                <History className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="positions" className="space-y-4">
              {(totalEmissions > 0 || backstopPositions.some(bp => bp.lpTokens > 0) || !isLoading || isDemoMode) && (
                <BlndRewardsCard
                  publicKey={activeWallet.publicKey}
                  pendingEmissions={isDemoMode ? 156.75 : totalEmissions}
                  backstopClaimableBlnd={isDemoMode ? 25.5 : backstopPositions.reduce((sum, bp) => sum + (bp.claimableBlnd || 0), 0)}
                  blndPrice={isDemoMode ? 0.0125 : blndPrice}
                  blndPerLpToken={isDemoMode ? 0.85 : (backstopPositions[0]?.blndAmount && backstopPositions[0]?.lpTokens
                    ? backstopPositions[0].blndAmount / backstopPositions[0].lpTokens
                    : 0)}
                  blndApy={isDemoMode ? 0.91 : balanceData.blndApy}
                  isLoading={isDemoMode ? false : isLoading}
                  perPoolEmissions={isDemoMode ? { "demo-pool-1": 156.75 } : blendSnapshot?.perPoolEmissions}
                  backstopPositions={isDemoMode ? [{ poolId: "demo-pool-1", poolName: "YieldBlox", claimableBlnd: 25.5 }] : backstopPositions.map(bp => ({
                    poolId: bp.poolId,
                    poolName: bp.poolName,
                    claimableBlnd: bp.claimableBlnd,
                  }))}
                  poolNames={isDemoMode ? { "demo-pool-1": "YieldBlox", "demo-pool-2": "Blend" } : (blendSnapshot?.positions?.reduce((acc, pos) => {
                    if (pos.poolId && pos.poolName) {
                      acc[pos.poolId] = pos.poolName
                    }
                    return acc
                  }, {} as Record<string, string>) || {})}
                />
              )}

              <SupplyPositions
                isLoading={isLoading}
                isDemoMode={isDemoMode}
                enrichedAssetCards={enrichedAssetCards}
                backstopPositions={backstopPositions}
                blendSnapshot={blendSnapshot}
                onPoolClick={(poolId, poolName) => capture('pool_clicked', { pool_id: poolId, pool_name: poolName })}
              />
            </TabsContent>

            <TabsContent value="borrows" className="space-y-4">
              <BorrowPositions
                isDemoMode={isDemoMode}
                blendSnapshot={blendSnapshot}
                enrichedAssetCards={enrichedAssetCards}
                poolAssetBorrowCostBasisMap={poolAssetBorrowCostBasisMap}
                onPoolClick={(poolId, poolName) => capture('pool_clicked', { pool_id: poolId, pool_name: poolName })}
              />
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              <TransactionHistory
                publicKey={activeWallet.publicKey}
                limit={20}
                hideToggle={true}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </DashboardLayout>
  )
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <HomeContent />
    </Suspense>
  )
}
