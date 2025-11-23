"use client"

import { useState, useMemo, useEffect } from "react"
import { useQueries } from "@tanstack/react-query"
import { WalletSelector } from "@/components/wallet-selector"
import { WalletBalance } from "@/components/wallet-balance"
import { AssetCard } from "@/components/asset-card"
import { BalanceHistoryChart } from "@/components/balance-history-chart"
import { BalanceEarningsStats } from "@/components/balance-earnings-stats"
import { BalanceRawDataTable } from "@/components/balance-raw-data-table"
import { useBlendPositions } from "@/hooks/use-blend-positions"
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

export default function Home() {
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [activeWalletId, setActiveWalletId] = useState<string | null>(null)

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
    }
  }, [])

  // Save wallets to localStorage whenever they change
  useEffect(() => {
    try {
      if (wallets.length > 0) {
        localStorage.setItem(WALLETS_STORAGE_KEY, JSON.stringify(wallets))
      } else {
        localStorage.removeItem(WALLETS_STORAGE_KEY)
      }
    } catch (error) {
      console.error("Error saving wallets to localStorage:", error)
    }
  }, [wallets])

  // Save active wallet ID to localStorage whenever it changes
  useEffect(() => {
    try {
      if (activeWalletId) {
        localStorage.setItem(ACTIVE_WALLET_STORAGE_KEY, activeWalletId)
      } else {
        localStorage.removeItem(ACTIVE_WALLET_STORAGE_KEY)
      }
    } catch (error) {
      console.error("Error saving active wallet ID to localStorage:", error)
    }
  }, [activeWalletId])

  const activeWallet = useMemo(
    () => wallets.find((w) => w.id === activeWalletId) ?? null,
    [wallets, activeWalletId]
  )

  // Fetch balance history to get cost basis from Dune (use first asset for now)
  // This will give us the total cost basis across all pools
  const firstAssetQuery = useQueries({
    queries: [{
      queryKey: ["balance-history-for-cost-basis", activeWallet?.publicKey || '', 90],
      queryFn: async () => {
        // Use USDC asset address for cost basis calculation
        const usdcAsset = 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75'
        const params = new URLSearchParams({
          user: activeWallet?.publicKey || '',
          asset: usdcAsset,
          days: '90',
        })

        const response = await fetch(`/api/balance-history?${params.toString()}`)

        if (!response.ok) {
          return null
        }

        return response.json()
      },
      enabled: !!activeWallet?.publicKey,
      staleTime: 5 * 60 * 1000,
    }],
  })[0]

  // Calculate total cost basis from Dune
  const totalCostBasis = useMemo(() => {
    if (!firstAssetQuery.data?.history || firstAssetQuery.data.history.length === 0) {
      return undefined
    }

    const latestByPool = new Map<string, number>()
    firstAssetQuery.data.history.forEach((record: any) => {
      if (record.total_cost_basis !== null && record.total_cost_basis !== undefined) {
        if (!latestByPool.has(record.pool_id)) {
          latestByPool.set(record.pool_id, record.total_cost_basis)
        }
      }
    })

    let total = 0
    latestByPool.forEach((costBasis) => {
      total += costBasis
    })

    return total
  }, [firstAssetQuery.data])

  const { balanceData, assetCards, isLoading, error, data: blendSnapshot } = useBlendPositions(
    activeWallet?.publicKey,
    totalCostBasis
  )

  const chartData = useMemo(
    () => generateChartData(balanceData.rawBalance),
    [balanceData.rawBalance]
  )

  // Get unique asset addresses from asset cards
  const uniqueAssetAddresses = useMemo(() => {
    const addresses = new Set<string>()
    assetCards.forEach((asset) => {
      const assetAddress = asset.id.includes('-') ? asset.id.split('-')[1] : asset.id
      addresses.add(assetAddress)
    })
    return Array.from(addresses)
  }, [assetCards])

  // Batch fetch balance history for all unique assets using useQueries
  // This eliminates the N+1 query problem by managing all queries in parallel
  const balanceHistoryQueries = useQueries({
    queries: uniqueAssetAddresses.slice(0, 5).map((assetAddress) => ({
      queryKey: ["balance-history", activeWallet?.publicKey || '', assetAddress, 90],
      queryFn: async () => {
        const params = new URLSearchParams({
          user: activeWallet?.publicKey || '',
          asset: assetAddress,
          days: '90',
        })

        const response = await fetch(`/api/balance-history?${params.toString()}`)

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

  // Build a mapping from poolId to cost basis (from Dune)
  const poolCostBasisMap = useMemo(() => {
    const map = new Map<string, number>()

    balanceHistoryQueries.forEach((query) => {
      if (!query.data?.history || query.data.history.length === 0) return

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

      // Add to the overall map
      latestByPool.forEach((costBasis, poolId) => {
        map.set(poolId, costBasis)
      })
    })

    return map
  }, [balanceHistoryQueries])

  // Enrich asset cards with yield calculated as: SDK Balance - Dune Cost Basis
  const enrichedAssetCards = useMemo(() => {
    return assetCards.map((asset) => {
      // Extract pool ID from composite ID (format: poolId-assetAddress)
      const poolId = asset.id.includes('-') ? asset.id.split('-')[0] : asset.id
      const costBasis = poolCostBasisMap.get(poolId)

      // Calculate yield: SDK Balance (USD) - Dune Cost Basis (USD)
      const earnedYield = costBasis !== undefined
        ? asset.rawBalance - costBasis
        : 0

      // Calculate yield percentage: (Yield / Cost Basis) * 100
      const yieldPercentage = costBasis !== undefined && costBasis > 0
        ? (earnedYield / costBasis) * 100
        : 0

      return {
        ...asset,
        earnedYield,
        yieldPercentage,
      } as AssetCardData
    })
  }, [assetCards, poolCostBasisMap])

  // Get the asset address from the first asset card (extract from composite ID)
  const firstAssetAddress = useMemo(() => {
    if (assetCards.length === 0) return undefined
    const assetId = assetCards[0].id
    return assetId.includes('-') ? assetId.split('-')[1] : assetId
  }, [assetCards])

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
      isActive: wallets.length === 0,
    }

    setWallets((prev) => {
      const updated = prev.map((w) => ({ ...w, isActive: false }))
      return [...updated, newWallet]
    })

    if (wallets.length === 0) {
      setActiveWalletId(newWallet.id)
    }
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

  const handleAssetAction = (action: string, assetId: string) => {
    // Handle asset actions (deposit, withdraw, etc.)
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between gap-2">
          <h1 className="text-xl sm:text-2xl font-bold">Smoothie</h1>
          <WalletSelector
            wallets={wallets}
            activeWallet={activeWallet}
            onSelectWallet={handleSelectWallet}
            onConnectWallet={handleConnectWallet}
            onDisconnect={handleDisconnect}
          />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 sm:py-8">
        {!activeWallet ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
            <h2 className="text-2xl sm:text-3xl font-semibold mb-4">
              Welcome to Smoothie
            </h2>
            <p className="text-muted-foreground mb-8 max-w-md text-sm sm:text-base">
              Connect your wallet or follow an address to view your Blend
              positions and track your earnings.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {isLoading && (
              <div className="text-center py-8 text-muted-foreground">
                Loading positions...
              </div>
            )}

            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
                <p className="text-destructive text-sm">
                  Error loading positions: {error instanceof Error ? error.message : "Unknown error"}
                </p>
              </div>
            )}

            {!isLoading && !error && (
              <>
                <WalletBalance
                  data={balanceData}
                  chartData={chartData}
                  publicKey={activeWallet.publicKey}
                  assetAddress={firstAssetAddress}
                />

                {enrichedAssetCards.length > 0 && (
                  <>
                    <div className="space-y-4">
                      <h2 className="text-2xl font-semibold">Your Positions</h2>
                      <div className="grid gap-4 grid-cols-1">
                        {enrichedAssetCards.map((asset) => (
                          <AssetCard
                            key={asset.id}
                            data={asset}
                            onAction={handleAssetAction}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Balance History Section - One per unique asset */}
                    {Array.from(
                      new Map(
                        assetCards.map((asset) => {
                          // Extract asset address from composite ID (format: poolId-assetAddress)
                          const assetAddress = asset.id.includes('-')
                            ? asset.id.split('-')[1]
                            : asset.id
                          return [assetAddress, asset]
                        })
                      ).values()
                    ).map((asset) => {
                      const assetAddress = asset.id.includes('-')
                        ? asset.id.split('-')[1]
                        : asset.id

                      return (
                        <div key={`history-${assetAddress}`} className="space-y-4">
                          <h2 className="text-2xl font-semibold">
                            Balance History - {asset.assetName}
                          </h2>

                          <BalanceEarningsStats
                            publicKey={activeWallet.publicKey}
                            assetAddress={assetAddress}
                            days={30}
                            totalYield={enrichedAssetCards
                              .filter(card => {
                                const cardAssetAddress = card.id.includes('-')
                                  ? card.id.split('-')[1]
                                  : card.id
                                return cardAssetAddress === assetAddress
                              })
                              .reduce((sum, card) => sum + (card.earnedYield || 0), 0)}
                            perPoolYield={new Map(
                              enrichedAssetCards
                                .filter(card => {
                                  const cardAssetAddress = card.id.includes('-')
                                    ? card.id.split('-')[1]
                                    : card.id
                                  return cardAssetAddress === assetAddress
                                })
                                .map(card => {
                                  const poolId = card.id.includes('-')
                                    ? card.id.split('-')[0]
                                    : card.id
                                  return [poolId, card.earnedYield || 0]
                                })
                            )}
                          />

                          <BalanceHistoryChart
                            publicKey={activeWallet.publicKey}
                            assetAddress={assetAddress}
                          />

                          <BalanceRawDataTable
                            publicKey={activeWallet.publicKey}
                            assetAddress={assetAddress}
                            days={30}
                          />
                        </div>
                      )
                    })}
                  </>
                )}

                {assetCards.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No positions found for this wallet.</p>
                    <p className="text-sm mt-2">
                      Start by depositing assets to Blend pools.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
