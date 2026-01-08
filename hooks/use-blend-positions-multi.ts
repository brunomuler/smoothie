"use client"

import { useMemo } from "react"
import { useQueries } from "@tanstack/react-query"
import { fetchWalletBlendSnapshot, type BlendWalletSnapshot, type BlendBackstopPosition } from "@/lib/blend/positions"
import { toTrackedPools, type TrackedPool } from "@/lib/blend/pools"
import { useMetadata } from "@/hooks/use-metadata"
import { fetchWithTimeout } from "@/lib/fetch-utils"
import { formatUsd, formatUsdWithDecimals } from "@/lib/format-utils"
import type { BalanceData } from "@/types/wallet-balance"

// Helper to check if a wallet is a demo wallet (by alias format)
function isDemoWallet(publicKey: string | undefined): boolean {
  return !!publicKey && publicKey.startsWith('demo-')
}

// API response has BigInt values serialized as strings
interface SerializedBackstopPosition extends Omit<BlendBackstopPosition, 'shares' | 'q4wShares' | 'unlockedQ4wShares' | 'q4wChunks'> {
  shares: string
  q4wShares: string
  unlockedQ4wShares: string
  q4wChunks: Array<{
    shares: string
    lpTokens: number
    lpTokensUsd: number
    expiration: number
  }>
}

interface SerializedSnapshot extends Omit<BlendWalletSnapshot, 'backstopPositions'> {
  backstopPositions: SerializedBackstopPosition[]
}

// Convert serialized strings back to BigInt
function deserializeSnapshot(data: SerializedSnapshot): BlendWalletSnapshot {
  return {
    ...data,
    backstopPositions: data.backstopPositions.map(bp => ({
      ...bp,
      shares: BigInt(bp.shares),
      q4wShares: BigInt(bp.q4wShares),
      unlockedQ4wShares: BigInt(bp.unlockedQ4wShares),
      q4wChunks: bp.q4wChunks.map(chunk => ({
        ...chunk,
        shares: BigInt(chunk.shares),
      })),
    })),
  }
}

// Fetch snapshot from backend API (for demo wallets - keeps addresses server-side)
async function fetchSnapshotFromApi(walletAlias: string): Promise<BlendWalletSnapshot> {
  const response = await fetchWithTimeout(`/api/blend-snapshot?user=${encodeURIComponent(walletAlias)}`)
  if (!response.ok) {
    throw new Error('Failed to fetch blend snapshot')
  }
  const data: SerializedSnapshot = await response.json()
  return deserializeSnapshot(data)
}

// Fetch snapshot - either from API (demo) or SDK (regular wallets)
async function fetchSnapshot(
  walletPublicKey: string,
  trackedPools: TrackedPool[]
): Promise<BlendWalletSnapshot> {
  if (isDemoWallet(walletPublicKey)) {
    // Demo wallet: fetch from backend API (address resolution happens server-side)
    return fetchSnapshotFromApi(walletPublicKey)
  }
  // Regular wallet: call SDK directly
  return fetchWalletBlendSnapshot(walletPublicKey, trackedPools)
}

/**
 * Hook to fetch and aggregate blend positions from multiple wallets.
 *
 * Returns combined totals across all selected wallets.
 */
export function useBlendPositionsMulti(walletPublicKeys: string[] | undefined) {
  const { pools: dbPools } = useMetadata()
  const trackedPools = useMemo(() => toTrackedPools(dbPools), [dbPools])

  // Fetch wallet snapshots for all wallets in parallel
  // Demo wallets use 'demo' key suffix since they don't need trackedPools on client
  const snapshotQueries = useQueries({
    queries: (walletPublicKeys ?? []).map(publicKey => {
      const isDemo = isDemoWallet(publicKey)
      return {
        queryKey: ["blend-wallet-snapshot", publicKey, isDemo ? 'demo' : trackedPools.map(p => p.id).join(',')],
        enabled: !!publicKey && (isDemo || trackedPools.length > 0),
        queryFn: () => fetchSnapshot(publicKey, trackedPools),
        staleTime: 5 * 60_000,
        refetchInterval: 10 * 60_000,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: false,
      }
    }),
  })

  // Check if all queries are done loading
  // For demo wallets, we don't need trackedPools (they fetch from API)
  // For regular wallets, we need trackedPools to be loaded first
  const hasNonDemoWallet = walletPublicKeys?.some(pk => !isDemoWallet(pk)) ?? false
  const needsTrackedPools = hasNonDemoWallet && trackedPools.length === 0
  const isLoading = snapshotQueries.some(q => q.isLoading) || needsTrackedPools
  const isError = snapshotQueries.some(q => q.isError)
  const error = snapshotQueries.find(q => q.error)?.error ?? null

  // Aggregate data from all wallets
  // CRITICAL: Only aggregate when ALL wallet queries have completed
  // Otherwise we'd have partial position data that doesn't match the cost basis
  // (which is fetched for all wallets at once)
  const aggregatedData = useMemo(() => {
    // Don't aggregate until all queries are done loading
    if (snapshotQueries.some(q => q.isLoading)) {
      return null
    }

    const snapshots = snapshotQueries
      .map(q => q.data)
      .filter((d): d is BlendWalletSnapshot => d !== undefined)

    // Only return data if we have snapshots for ALL requested wallets
    const expectedWalletCount = walletPublicKeys?.length ?? 0
    if (snapshots.length === 0 || snapshots.length < expectedWalletCount) {
      return null
    }

    // Sum totals across wallets
    const totalSupplyUsd = snapshots.reduce((sum, s) =>
      sum + s.positions.reduce((acc, p) => acc + p.supplyUsdValue, 0), 0)
    const totalBackstopUsd = snapshots.reduce((sum, s) =>
      sum + (s.totalBackstopUsd ?? 0), 0)
    const totalEmissions = snapshots.reduce((sum, s) =>
      sum + (s.totalEmissions ?? 0), 0)

    // Calculate weighted APYs
    const weightedSupplyApy = totalSupplyUsd > 0
      ? snapshots.reduce((sum, s) => {
          const walletSupply = s.positions.reduce((acc, p) => acc + p.supplyUsdValue, 0)
          return sum + (s.weightedSupplyApy ?? 0) * walletSupply
        }, 0) / totalSupplyUsd
      : 0

    const weightedBlndApy = totalSupplyUsd > 0
      ? snapshots.reduce((sum, s) => {
          const walletSupply = s.positions.reduce((acc, p) => acc + p.supplyUsdValue, 0)
          return sum + (s.weightedBlndApy ?? 0) * walletSupply
        }, 0) / totalSupplyUsd
      : 0

    // Use prices from first wallet (they should be the same across wallets)
    const blndPrice = snapshots[0]?.blndPrice ?? null
    const lpTokenPrice = snapshots[0]?.lpTokenPrice ?? null

    // Combine all positions
    const allPositions = snapshots.flatMap(s => s.positions)

    // Combine all backstop positions
    const allBackstopPositions = snapshots.flatMap(s => s.backstopPositions ?? [])

    // Build SDK prices from all positions (deduped)
    const sdkPrices: Record<string, number> = {}
    allPositions.forEach(p => {
      if (p.assetId && p.price?.usdPrice && p.price.usdPrice > 0) {
        sdkPrices[p.assetId] = p.price.usdPrice
      }
    })

    // MULTI-WALLET FIX: Track per-wallet position AMOUNTS for each pool-asset
    // This is needed for correct per-wallet yield calculation
    // Structure: compositeKey -> walletAddress -> { tokens, usdPrice }
    const perWalletSupplyAmounts = new Map<string, Map<string, { tokens: number; usdPrice: number }>>()
    const perWalletBorrowAmounts = new Map<string, Map<string, { tokens: number; usdPrice: number }>>()

    snapshotQueries.forEach((query, idx) => {
      const walletAddress = walletPublicKeys?.[idx]
      if (!walletAddress || !query.data) return

      query.data.positions.forEach(pos => {
        // Track supply positions with amounts
        if (pos.supplyAmount > 0 && pos.poolId && pos.assetId) {
          const compositeKey = `${pos.poolId}-${pos.assetId}`
          if (!perWalletSupplyAmounts.has(compositeKey)) {
            perWalletSupplyAmounts.set(compositeKey, new Map())
          }
          perWalletSupplyAmounts.get(compositeKey)!.set(walletAddress, {
            tokens: pos.supplyAmount,
            usdPrice: pos.price?.usdPrice || 0,
          })
        }
        // Track borrow positions with amounts
        if (pos.borrowAmount > 0 && pos.poolId && pos.assetId) {
          const compositeKey = `${pos.poolId}-${pos.assetId}`
          if (!perWalletBorrowAmounts.has(compositeKey)) {
            perWalletBorrowAmounts.set(compositeKey, new Map())
          }
          perWalletBorrowAmounts.get(compositeKey)!.set(walletAddress, {
            tokens: pos.borrowAmount,
            usdPrice: pos.price?.usdPrice || 0,
          })
        }
      })
    })

    return {
      totalSupplyUsd,
      totalBackstopUsd,
      totalEmissions,
      weightedSupplyApy,
      weightedBlndApy,
      blndPrice,
      lpTokenPrice,
      positions: allPositions,
      backstopPositions: allBackstopPositions,
      sdkPrices,
      perWalletSupplyAmounts,
      perWalletBorrowAmounts,
    }
  }, [snapshotQueries, walletPublicKeys])

  // Build balance data
  const balanceData: BalanceData = useMemo(() => {
    if (!aggregatedData) {
      return {
        balance: "0.00",
        rawBalance: 0,
        apyPercentage: 0,
        interestEarned: "0.00",
        rawInterestEarned: 0,
        annualYield: "0.00",
        growthPercentage: 0,
        blndApy: 0,
      }
    }

    const totalBalance = aggregatedData.totalSupplyUsd + aggregatedData.totalBackstopUsd
    const estimatedAnnualYield = (aggregatedData.totalSupplyUsd * aggregatedData.weightedSupplyApy) / 100

    return {
      balance: formatUsdWithDecimals(totalBalance),
      rawBalance: totalBalance,
      apyPercentage: aggregatedData.weightedSupplyApy,
      interestEarned: "0.00",
      rawInterestEarned: 0,
      annualYield: formatUsd(estimatedAnnualYield),
      growthPercentage: 0,
      blndApy: aggregatedData.weightedBlndApy,
    }
  }, [aggregatedData])

  return {
    data: aggregatedData ? {
      positions: aggregatedData.positions,
      totalBackstopUsd: aggregatedData.totalBackstopUsd,
      weightedSupplyApy: aggregatedData.weightedSupplyApy,
      weightedBlndApy: aggregatedData.weightedBlndApy,
      backstopPositions: aggregatedData.backstopPositions,
      blndPrice: aggregatedData.blndPrice,
      lpTokenPrice: aggregatedData.lpTokenPrice,
      totalEmissions: aggregatedData.totalEmissions,
    } : undefined,
    isLoading,
    isError,
    error,
    balanceData,
    totalEmissions: aggregatedData?.totalEmissions ?? 0,
    blndPrice: aggregatedData?.blndPrice ?? null,
    lpTokenPrice: aggregatedData?.lpTokenPrice ?? null,
    backstopPositions: aggregatedData?.backstopPositions ?? [],
    totalBackstopUsd: aggregatedData?.totalBackstopUsd ?? 0,
    sdkPrices: aggregatedData?.sdkPrices ?? {},
    // MULTI-WALLET FIX: Track per-wallet position AMOUNTS for accurate yield calculation
    // Structure: compositeKey -> walletAddress -> { tokens, usdPrice }
    perWalletSupplyAmounts: aggregatedData?.perWalletSupplyAmounts,
    perWalletBorrowAmounts: aggregatedData?.perWalletBorrowAmounts,
  }
}
