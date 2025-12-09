"use client"

import { useState, useMemo, useEffect, Suspense, useCallback } from "react"
import Image from "next/image"
import { useSearchParams } from "next/navigation"
import { usePostHog } from "@/hooks/use-posthog"
import { TokenLogo } from "@/components/token-logo"
import { useQueries } from "@tanstack/react-query"
import Link from "next/link"
import { fetchWithTimeout } from "@/lib/fetch-utils"
import { StrKey } from "@stellar/stellar-sdk"
import { WalletSelector } from "@/components/wallet-selector"
import { LandingPage } from "@/components/landing-page"
import { WalletBalance } from "@/components/wallet-balance"
import { TransactionHistory } from "@/components/transaction-history"
import { useBlendPositions } from "@/hooks/use-blend-positions"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowDownFromLine, History, TrendingUp, TrendingDown, PiggyBank, ChevronRight } from "lucide-react"
import { BlndRewardsCard } from "@/components/blnd-rewards-card"
import type { Wallet } from "@/types/wallet"
import type { ChartDataPoint } from "@/types/wallet-balance"
import type { AssetCardData } from "@/types/asset-card"

const WALLETS_STORAGE_KEY = "stellar-wallet-tracked-addresses"
const ACTIVE_WALLET_STORAGE_KEY = "stellar-wallet-active-id"

function generateChartData(balance: number): ChartDataPoint[] {
  // Generate simple chart data with current balance
  const now = new Date()
  const data: ChartDataPoint[] = []
  
  // Add historical points (last 30 days)
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    data.push({
      date: date.toISOString(),
      balance: balance,
      deposit: balance * 0.9, // Approximate deposit amount
      yield: balance * 0.1, // Approximate yield
      type: i === 0 ? 'current' : 'historical',
    })
  }
  
  return data
}

function isValidStellarAddress(addr: string): boolean {
  if (!addr || typeof addr !== "string") return false
  try {
    const trimmed = addr.trim()
    return StrKey.isValidEd25519PublicKey(trimmed) || StrKey.isValidContract(trimmed)
  } catch {
    return false
  }
}

function HomeContent() {
  const searchParams = useSearchParams()
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [activeWalletId, setActiveWalletId] = useState<string | null>(null)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [urlAddressProcessed, setUrlAddressProcessed] = useState(false)
  const { capture } = usePostHog()

  // Track page view
  useEffect(() => {
    capture('page_viewed', { page: 'home' })
  }, [capture])

  // Load wallets from localStorage on mount
  useEffect(() => {
    try {
      const savedWallets = localStorage.getItem(WALLETS_STORAGE_KEY)
      const savedActiveId = localStorage.getItem(ACTIVE_WALLET_STORAGE_KEY)

      if (savedWallets) {
        const parsedWallets = JSON.parse(savedWallets) as Wallet[]
        setWallets(parsedWallets)
      }

      if (savedActiveId) {
        setActiveWalletId(savedActiveId)
      }
    } catch (error) {
      console.error("Error loading wallets from localStorage:", error)
    } finally {
      setIsHydrated(true)
    }
  }, [])

  // Save wallets to localStorage whenever they change (only after hydration)
  useEffect(() => {
    if (!isHydrated) return

    try {
      if (wallets.length > 0) {
        localStorage.setItem(WALLETS_STORAGE_KEY, JSON.stringify(wallets))
      } else {
        localStorage.removeItem(WALLETS_STORAGE_KEY)
      }
    } catch (error) {
      console.error("Error saving wallets to localStorage:", error)
    }
  }, [wallets, isHydrated])

  // Save active wallet ID to localStorage whenever it changes (only after hydration)
  useEffect(() => {
    if (!isHydrated) return

    try {
      if (activeWalletId) {
        localStorage.setItem(ACTIVE_WALLET_STORAGE_KEY, activeWalletId)
      } else {
        localStorage.removeItem(ACTIVE_WALLET_STORAGE_KEY)
      }
    } catch (error) {
      console.error("Error saving active wallet ID to localStorage:", error)
    }
  }, [activeWalletId, isHydrated])

  // Handle URL address parameter - add to followed list and show automatically
  useEffect(() => {
    if (!isHydrated || urlAddressProcessed) return

    const addressParam = searchParams.get("address")
    if (!addressParam) {
      setUrlAddressProcessed(true)
      return
    }

    const trimmedAddress = addressParam.trim()
    if (!isValidStellarAddress(trimmedAddress)) {
      console.warn("Invalid address in URL parameter:", trimmedAddress)
      setUrlAddressProcessed(true)
      return
    }

    // Check if this address already exists in wallets
    const existingWallet = wallets.find(
      (w) => w.publicKey.toLowerCase() === trimmedAddress.toLowerCase()
    )

    if (existingWallet) {
      // Address already exists, just select it
      setActiveWalletId(existingWallet.id)
      setWallets((prev) =>
        prev.map((w) => ({ ...w, isActive: w.id === existingWallet.id }))
      )
    } else {
      // Add as a new watched wallet
      const isContract = trimmedAddress.startsWith("C")
      const shortAddr = `${trimmedAddress.slice(0, 4)}...${trimmedAddress.slice(-4)}`
      const walletName = isContract ? `Contract ${shortAddr}` : `Watch ${shortAddr}`

      const newWallet: Wallet = {
        id: `wallet-${Date.now()}`,
        publicKey: trimmedAddress,
        name: walletName,
        isActive: true,
      }

      setWallets((prev) => {
        const updated = prev.map((w) => ({ ...w, isActive: false }))
        return [...updated, newWallet]
      })
      setActiveWalletId(newWallet.id)
    }

    setUrlAddressProcessed(true)
  }, [isHydrated, urlAddressProcessed, searchParams, wallets])

  const activeWallet = useMemo(
    () => wallets.find((w) => w.id === activeWalletId) ?? null,
    [wallets, activeWalletId]
  )

  const { balanceData: initialBalanceData, assetCards, isLoading, error, data: blendSnapshot, totalEmissions, blndPrice } = useBlendPositions(
    activeWallet?.publicKey,
    undefined // We'll calculate totalCostBasis separately
  )

  const chartData = useMemo(
    () => generateChartData(initialBalanceData.rawBalance),
    [initialBalanceData.rawBalance]
  )

  // Get unique asset addresses from both supply and borrow positions
  const uniqueAssetAddresses = useMemo(() => {
    const addresses = new Set<string>()
    // Include assets from supply positions (assetCards)
    assetCards.forEach((asset) => {
      const assetAddress = asset.id.includes('-') ? asset.id.split('-')[1] : asset.id
      addresses.add(assetAddress)
    })
    // Also include assets from borrow positions
    if (blendSnapshot?.positions) {
      blendSnapshot.positions.forEach((position) => {
        if (position.borrowAmount > 0 && position.assetId) {
          addresses.add(position.assetId)
        }
      })
    }
    return Array.from(addresses)
  }, [assetCards, blendSnapshot?.positions])

  // Batch fetch balance history for all unique assets using useQueries
  // This eliminates the N+1 query problem by managing all queries in parallel
  const balanceHistoryQueries = useQueries({
    queries: uniqueAssetAddresses.map((assetAddress) => ({
      queryKey: ["balance-history", activeWallet?.publicKey || '', assetAddress, 365],
      queryFn: async ({ signal }) => {
        const params = new URLSearchParams({
          user: activeWallet?.publicKey || '',
          asset: assetAddress,
          days: '365',
        })

        const response = await fetchWithTimeout(`/api/balance-history?${params.toString()}`, { signal })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.message || "Failed to fetch balance history")
        }

        return response.json()
      },
      enabled: !!activeWallet?.publicKey && !!assetAddress,
      staleTime: 5 * 60 * 1000, // 5 minutes (historical data doesn't change frequently)
      refetchOnWindowFocus: false,
      retry: 2,
    })),
  })

  // Build a mapping from composite key (poolId-assetAddress) to cost basis (from database)
  const poolAssetCostBasisMap = useMemo(() => {
    const map = new Map<string, number>()

    balanceHistoryQueries.forEach((query, index) => {
      if (!query.data?.history || query.data.history.length === 0) return

      const assetAddress = uniqueAssetAddresses[index]

      // Get latest cost_basis for each pool from this asset's history
      const latestByPool = new Map<string, number>()
      query.data.history.forEach((record: any) => {
        if (record.total_cost_basis !== null && record.total_cost_basis !== undefined) {
          // Since records are sorted newest first, first occurrence is the latest
          if (!latestByPool.has(record.pool_id)) {
            latestByPool.set(record.pool_id, record.total_cost_basis)
          }
        }
      })

      // Add to the overall map using composite key: poolId-assetAddress
      latestByPool.forEach((costBasis, poolId) => {
        const compositeKey = `${poolId}-${assetAddress}`
        map.set(compositeKey, costBasis)
      })
    })

    return map
  }, [balanceHistoryQueries, uniqueAssetAddresses])

  // Build a mapping from composite key (poolId-assetAddress) to borrow cost basis (from database)
  const poolAssetBorrowCostBasisMap = useMemo(() => {
    const map = new Map<string, number>()

    balanceHistoryQueries.forEach((query, index) => {
      if (!query.data?.history || query.data.history.length === 0) return

      const assetAddress = uniqueAssetAddresses[index]

      // Get latest borrow_cost_basis for each pool from this asset's history
      const latestByPool = new Map<string, number>()
      query.data.history.forEach((record: any) => {
        if (record.borrow_cost_basis !== null && record.borrow_cost_basis !== undefined) {
          // Since records are sorted newest first, first occurrence is the latest
          if (!latestByPool.has(record.pool_id)) {
            latestByPool.set(record.pool_id, record.borrow_cost_basis)
          }
        }
      })

      // Add to the overall map using composite key: poolId-assetAddress
      latestByPool.forEach((borrowCostBasis, poolId) => {
        const compositeKey = `${poolId}-${assetAddress}`
        map.set(compositeKey, borrowCostBasis)
      })
    })

    return map
  }, [balanceHistoryQueries, uniqueAssetAddresses])

  // Build a mapping from assetAddress to balance history data
  // This prevents redundant fetches in child components
  const balanceHistoryDataMap = useMemo(() => {
    const map = new Map<string, any>()

    uniqueAssetAddresses.forEach((assetAddress, index) => {
      const query = balanceHistoryQueries[index]
      if (query?.data) {
        // Import balance history utilities
        const { fillMissingDates, detectPositionChanges, calculateEarningsStats } = require('@/lib/balance-history-utils')

        const chartData = fillMissingDates(query.data.history, true, query.data.firstEventDate)
        const positionChanges = detectPositionChanges(query.data.history)
        const earningsStats = calculateEarningsStats(chartData, positionChanges)

        map.set(assetAddress, {
          chartData,
          positionChanges,
          earningsStats,
          rawData: query.data.history,
          isLoading: query.isLoading,
          error: query.error,
        })
      }
    })

    return map
  }, [uniqueAssetAddresses, balanceHistoryQueries])

  // Build a map of asset address -> USD price from SDK positions
  const assetPriceMap = useMemo(() => {
    const map = new Map<string, number>()
    if (!blendSnapshot?.positions) return map

    blendSnapshot.positions.forEach(pos => {
      if (pos.assetId && pos.price?.usdPrice && pos.price.usdPrice > 0) {
        map.set(pos.assetId, pos.price.usdPrice)
      }
    })

    return map
  }, [blendSnapshot?.positions])

  // Enrich asset cards with yield calculated as: SDK Balance (USD) - Database Cost Basis (token amount × USD price)
  const enrichedAssetCards = useMemo(() => {
    return assetCards.map((asset) => {
      // asset.id is already in the format: poolId-assetAddress
      const compositeKey = asset.id

      // Get cost basis in token amount from database
      const costBasisTokens = poolAssetCostBasisMap.get(compositeKey)

      if (costBasisTokens === undefined) {
        return {
          ...asset,
          earnedYield: 0,
          yieldPercentage: 0,
        } as AssetCardData
      }

      // Get USD price for this asset from SDK
      const assetAddress = asset.id.includes('-') ? asset.id.split('-')[1] : asset.id
      const usdPrice = assetPriceMap.get(assetAddress) || 1

      // Convert cost basis from tokens to USD
      const costBasisUsd = costBasisTokens * usdPrice

      // Calculate yield: SDK Balance (USD) - Database Cost Basis (USD)
      const earnedYield = asset.rawBalance - costBasisUsd

      // Calculate yield percentage: (Yield / Cost Basis) * 100
      const yieldPercentage = costBasisUsd > 0
        ? (earnedYield / costBasisUsd) * 100
        : 0

      return {
        ...asset,
        earnedYield,
        yieldPercentage,
      } as AssetCardData
    })
  }, [assetCards, poolAssetCostBasisMap, assetPriceMap])

  // Calculate total cost basis from all assets in USD
  const totalCostBasis = useMemo(() => {
    if (!blendSnapshot?.positions || blendSnapshot.positions.length === 0) {
      return undefined
    }

    let totalCostBasisUsd = 0

    // For each SDK position, get the cost basis from database and convert to USD
    blendSnapshot.positions.forEach((position) => {
      if (position.supplyAmount <= 0) return // Skip positions with no supply

      const compositeKey = position.id // Already in format: poolId-assetAddress
      const costBasisTokens = poolAssetCostBasisMap.get(compositeKey)

      if (costBasisTokens !== undefined && costBasisTokens > 0) {
        // Convert cost basis from tokens to USD using SDK price
        const usdPrice = position.price?.usdPrice || 1
        const costBasisUsd = costBasisTokens * usdPrice
        totalCostBasisUsd += costBasisUsd
      }
    })

    return totalCostBasisUsd > 0 ? totalCostBasisUsd : undefined
  }, [blendSnapshot?.positions, poolAssetCostBasisMap])

  // Recalculate balanceData with correct total cost basis and yield
  const balanceData = useMemo(() => {
    if (!totalCostBasis || totalCostBasis <= 0) {
      return initialBalanceData
    }

    const realYield = initialBalanceData.rawBalance - totalCostBasis
    const yieldPercentage = totalCostBasis > 0 ? (realYield / totalCostBasis) * 100 : 0

    const usdFormatter = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })

    return {
      ...initialBalanceData,
      interestEarned: `$${usdFormatter.format(realYield)}`,
      rawInterestEarned: realYield,
      growthPercentage: yieldPercentage,
    }
  }, [initialBalanceData, totalCostBasis])

  // Aggregate historical data from ALL assets, converting each to USD
  // This provides the combined total history for the top chart
  const aggregatedHistoryData = useMemo(() => {
    if (balanceHistoryDataMap.size === 0) return null

    const { detectPositionChanges, calculateEarningsStats } = require('@/lib/balance-history-utils')

    // Collect all dates across all assets
    const allDatesSet = new Set<string>()
    balanceHistoryDataMap.forEach((historyData) => {
      historyData.chartData.forEach((point: any) => {
        allDatesSet.add(point.date)
      })
    })

    const allDates = Array.from(allDatesSet).sort()

    // For each date, sum up all assets' values (converted to USD)
    const aggregatedChartData = allDates.map(date => {
      let totalBalance = 0
      let totalDeposit = 0
      let totalYield = 0
      let totalBorrow = 0
      const pools: any[] = []

      // Sum across all assets
      uniqueAssetAddresses.forEach(assetAddress => {
        const historyData = balanceHistoryDataMap.get(assetAddress)
        if (!historyData) return

        const point = historyData.chartData.find((p: any) => p.date === date)
        if (!point) return

        // Get USD price for this asset
        const usdPrice = assetPriceMap.get(assetAddress) || 1

        // Convert token amounts to USD and add to totals
        totalBalance += (point.total || 0) * usdPrice
        totalDeposit += (point.deposit || 0) * usdPrice
        totalYield += (point.yield || 0) * usdPrice
        totalBorrow += (point.borrow || 0) * usdPrice

        // Also aggregate pool data
        point.pools?.forEach((pool: any) => {
          pools.push({
            ...pool,
            balance: pool.balance * usdPrice,
            deposit: pool.deposit * usdPrice,
            yield: pool.yield * usdPrice,
            borrow: (pool.borrow || 0) * usdPrice,
          })
        })
      })

      const dateObj = new Date(date)
      return {
        date,
        formattedDate: dateObj.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        timestamp: dateObj.getTime(),
        total: totalBalance,
        deposit: totalDeposit,
        yield: totalYield,
        borrow: totalBorrow,
        pools,
      }
    })

    // Calculate combined position changes and earnings stats
    const positionChanges = detectPositionChanges([]) // Simplified for now
    const earningsStats = calculateEarningsStats(aggregatedChartData, positionChanges)

    return {
      chartData: aggregatedChartData,
      positionChanges,
      earningsStats,
      rawData: [],
      isLoading: balanceHistoryQueries.some(q => q.isLoading),
      error: balanceHistoryQueries.find(q => q.error)?.error || null,
    }
  }, [balanceHistoryDataMap, assetPriceMap, uniqueAssetAddresses, balanceHistoryQueries])

  const handleSelectWallet = (walletId: string) => {
    setActiveWalletId(walletId)
    setWallets((prev) =>
      prev.map((w) => ({ ...w, isActive: w.id === walletId }))
    )
  }

  const handleConnectWallet = (address: string, walletName?: string) => {
    const newWallet: Wallet = {
      id: `wallet-${Date.now()}`,
      publicKey: address,
      name: walletName,
      isActive: true,
    }

    setWallets((prev) => {
      const updated = prev.map((w) => ({ ...w, isActive: false }))
      return [...updated, newWallet]
    })

    setActiveWalletId(newWallet.id)
  }

  const handleDisconnect = (walletId: string) => {
    setWallets((prev) => prev.filter((w) => w.id !== walletId))
    if (activeWalletId === walletId) {
      const remaining = wallets.filter((w) => w.id !== walletId)
      if (remaining.length > 0) {
        setActiveWalletId(remaining[0].id)
        setWallets((prev) =>
          prev
            .filter((w) => w.id !== walletId)
            .map((w, idx) => ({ ...w, isActive: idx === 0 }))
        )
      } else {
        setActiveWalletId(null)
      }
    }
  }

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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container max-w-4xl mx-auto px-4 py-1.5 sm:py-2 flex items-center justify-between gap-2">
          <div className="relative h-12">
            <Image
              src="/logo/logo-light.png"
              alt="Smoothie"
              width={0}
              height={0}
              sizes="100vw"
              className="h-12 w-auto dark:hidden"
              priority
            />
            <Image
              src="/logo/logo.png"
              alt="Smoothie"
              width={0}
              height={0}
              sizes="100vw"
              className="h-12 w-auto hidden dark:block"
              priority
            />
          </div>
          <div className="flex items-center gap-2">
            <WalletSelector
              wallets={wallets}
              activeWallet={activeWallet}
              onSelectWallet={handleSelectWallet}
              onConnectWallet={handleConnectWallet}
              onDisconnect={handleDisconnect}
            />
          </div>
        </div>
      </header>

      <main className="container max-w-4xl mx-auto px-4 py-3 sm:py-4">
        <div className="space-y-6">
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
                <p className="text-destructive text-sm">
                  Error loading positions: {error instanceof Error ? error.message : "Unknown error"}
                </p>
              </div>
            )}

            {!error && (
              <>
                <WalletBalance
                  data={balanceData}
                  chartData={chartData}
                  publicKey={activeWallet.publicKey}
                  balanceHistoryData={
                    // Use aggregated history (all assets combined, already in USD)
                    aggregatedHistoryData ?? undefined
                  }
                  loading={isLoading || !aggregatedHistoryData || aggregatedHistoryData.isLoading}
                  isDemoMode={isDemoMode}
                  onToggleDemoMode={() => setIsDemoMode(!isDemoMode)}
                  usdcPrice={1} // Aggregated data is already in USD
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
                    {/* BLND Rewards Card */}
                    {activeWallet && (totalEmissions > 0 || !isLoading) && (
                      <BlndRewardsCard
                        publicKey={activeWallet.publicKey}
                        pendingEmissions={totalEmissions}
                        blndPrice={blndPrice}
                        blndApy={balanceData.blndApy}
                        isLoading={isLoading}
                      />
                    )}

                    {isLoading ? (
                      <div className="grid gap-4 grid-cols-1">
                        {[...Array(2)].map((_, i) => (
                          <Card key={i}>
                            <CardHeader>
                              <Skeleton className="h-6 w-32" />
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-3">
                                {[...Array(3)].map((_, j) => (
                                  <div key={j} className="flex items-center justify-between py-3">
                                    <div className="flex items-center gap-3">
                                      <Skeleton className="h-10 w-10 rounded-full" />
                                      <div className="space-y-2">
                                        <Skeleton className="h-4 w-24" />
                                        <Skeleton className="h-3 w-32" />
                                      </div>
                                    </div>
                                    <Skeleton className="h-6 w-20" />
                                  </div>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : enrichedAssetCards.length > 0 ? (
                      <div className="grid gap-4 grid-cols-1">
                        {Object.entries(
                          enrichedAssetCards.reduce((acc, asset) => {
                            // Extract pool ID from composite ID (format: poolId-assetAddress)
                            const poolId = asset.id.includes('-') ? asset.id.split('-')[0] : asset.id
                            const poolName = asset.protocolName

                            if (!acc[poolId]) {
                              acc[poolId] = {
                                poolName,
                                assets: []
                              }
                            }
                            acc[poolId].assets.push(asset)
                            return acc
                          }, {} as Record<string, { poolName: string; assets: typeof enrichedAssetCards }>)
                        ).map(([poolId, { poolName, assets }]) => {
                          return (
                            <Card key={poolId} className="py-2 gap-0">
                              <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                                <CardTitle>{poolName} Pool</CardTitle>
                                <Link
                                  href={`/pool/${encodeURIComponent(poolId)}`}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                  onClick={() => capture('pool_clicked', { pool_id: poolId, pool_name: poolName })}
                                >
                                  <ChevronRight className="h-5 w-5" />
                                </Link>
                              </CardHeader>
                              <CardContent className="px-4 pt-0 pb-1">
                                <div className="space-y-1">
                                  {assets.map((asset) => {
                                    const yieldFormatter = new Intl.NumberFormat("en-US", {
                                      style: "currency",
                                      currency: "USD",
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                      signDisplay: "always",
                                    })
                                    const yieldToShow = asset.earnedYield ?? 0
                                    const formattedYield = yieldFormatter.format(yieldToShow)
                                    const hasSignificantYield = Math.abs(yieldToShow) >= 0.01
                                    const yieldPercentage = asset.yieldPercentage ?? 0
                                    const formattedYieldPercentage = yieldPercentage !== 0 ? ` (${yieldPercentage >= 0 ? '+' : ''}${yieldPercentage.toFixed(2)}%)` : ''

                                    // Find the corresponding position to get token amount
                                    const position = blendSnapshot?.positions.find(p => p.id === asset.id)
                                    const tokenAmount = position?.supplyAmount || 0
                                    const symbol = position?.symbol || asset.assetName
                                    const isUSDC = symbol === 'USDC'

                                    return (
                                      <div key={asset.id} className="flex items-center justify-between py-2 gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                          <TokenLogo
                                            src={asset.logoUrl}
                                            symbol={asset.assetName}
                                            size={40}
                                          />
                                          <div className="min-w-0 flex-1">
                                            <p className="font-medium truncate">{asset.assetName}</p>
                                            <p className="text-sm text-muted-foreground truncate">
                                              {isUSDC ? (
                                                `$${asset.rawBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                              ) : (
                                                <>
                                                  {tokenAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {symbol}
                                                  <span className="text-xs ml-1">
                                                    (${asset.rawBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                                  </span>
                                                </>
                                              )}
                                            </p>
                                            {hasSignificantYield && (
                                              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                                {formattedYield} yield{formattedYieldPercentage}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex flex-col gap-1 items-end shrink-0">
                                          <Badge variant="secondary" className="text-xs">
                                            <TrendingUp className="mr-1 h-3 w-3" />
                                            {asset.apyPercentage.toFixed(2)}% APY
                                          </Badge>
                                          {asset.growthPercentage > 0.005 && (
                                            <Badge variant="secondary" className="text-xs">
                                              <PiggyBank className="mr-1 h-3 w-3" />
                                              +{asset.growthPercentage.toFixed(2)}% BLND
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </CardContent>
                            </Card>
                          )
                        })}
                      </div>
                    ) : (
                      !isLoading && (
                        <div className="text-center py-8 text-muted-foreground">
                          <p>No positions found for this wallet.</p>
                          <p className="text-sm mt-2">
                            Start by depositing assets to Blend pools.
                          </p>
                        </div>
                      )
                    )}
                  </TabsContent>

                  <TabsContent value="borrows" className="space-y-4">
                    {blendSnapshot && blendSnapshot.positions.some(pos => pos.borrowUsdValue > 0) ? (
                      <div className="grid gap-4 grid-cols-1">
                        {Object.entries(
                          blendSnapshot.positions
                            .filter(pos => pos.borrowUsdValue > 0)
                            .reduce((acc, position) => {
                              const poolId = position.poolId
                              const poolName = position.poolName

                              if (!acc[poolId]) {
                                acc[poolId] = {
                                  poolName,
                                  positions: []
                                }
                              }
                              acc[poolId].positions.push(position)
                              return acc
                            }, {} as Record<string, { poolName: string; positions: typeof blendSnapshot.positions }>)
                        ).map(([poolId, { poolName, positions }]) => {
                          return (
                            <Card key={poolId} className="py-2 gap-0">
                              <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                                <CardTitle>{poolName} Pool</CardTitle>
                                <Link
                                  href={`/pool/${encodeURIComponent(poolId)}`}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                  onClick={() => capture('pool_clicked', { pool_id: poolId, pool_name: poolName })}
                                >
                                  <ChevronRight className="h-5 w-5" />
                                </Link>
                              </CardHeader>
                              <CardContent className="px-4 pt-0 pb-1">
                                <div className="space-y-1">
                                  {positions.map((position) => {
                                    // Find the matching asset card to get the correct logoUrl
                                    const matchingAsset = enrichedAssetCards.find(asset => asset.id === position.id)
                                    const logoUrl = matchingAsset?.logoUrl || `/tokens/${position.symbol.toLowerCase()}.png`
                                    const isUSDC = position.symbol === 'USDC'

                                    // Calculate interest accrued similar to position yield calculation
                                    const compositeKey = position.id // poolId-assetAddress
                                    const borrowCostBasisTokens = poolAssetBorrowCostBasisMap.get(compositeKey) || 0
                                    const usdPrice = position.price?.usdPrice || 1
                                    const borrowCostBasisUsd = borrowCostBasisTokens * usdPrice
                                    const currentDebtUsd = position.borrowUsdValue
                                    const interestAccrued = currentDebtUsd - borrowCostBasisUsd
                                    const interestPercentage = borrowCostBasisUsd > 0
                                      ? (interestAccrued / borrowCostBasisUsd) * 100
                                      : 0

                                    // Format interest like yield is formatted
                                    const interestFormatter = new Intl.NumberFormat("en-US", {
                                      style: "currency",
                                      currency: "USD",
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                      signDisplay: "always",
                                    })
                                    const formattedInterest = interestFormatter.format(interestAccrued)
                                    const hasSignificantInterest = Math.abs(interestAccrued) >= 0.01
                                    const formattedInterestPercentage = interestPercentage !== 0 ? ` (${interestPercentage >= 0 ? '+' : ''}${interestPercentage.toFixed(2)}%)` : ''

                                    return (
                                      <div key={position.id} className="flex items-center justify-between py-2 gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                          <TokenLogo
                                            src={logoUrl}
                                            symbol={position.symbol}
                                            size={40}
                                          />
                                          <div className="min-w-0 flex-1">
                                            <p className="font-medium truncate">{position.symbol}</p>
                                            <p className="text-sm text-muted-foreground truncate">
                                              {isUSDC ? (
                                                `$${position.borrowUsdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                              ) : (
                                                <>
                                                  {position.borrowAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {position.symbol}
                                                  <span className="text-xs ml-1">
                                                    (${position.borrowUsdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                                  </span>
                                                </>
                                              )}
                                            </p>
                                            {hasSignificantInterest && (
                                              <p className="text-xs text-orange-600 dark:text-orange-400">
                                                {formattedInterest} interest{formattedInterestPercentage}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex flex-col gap-1 items-end shrink-0">
                                          <Badge variant="secondary" className="text-xs">
                                            <TrendingDown className="mr-1 h-3 w-3" />
                                            {position.borrowApy.toFixed(2)}% APY
                                          </Badge>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </CardContent>
                            </Card>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <p>No borrows found for this wallet.</p>
                      </div>
                    )}
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
        </div>
      </main>
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <HomeContent />
    </Suspense>
  )
}
