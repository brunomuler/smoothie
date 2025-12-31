"use client"

import { useMemo, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchWalletBlendSnapshot, type BlendWalletSnapshot, type BlendBackstopPosition } from "@/lib/blend/positions"
import { toTrackedPools } from "@/lib/blend/pools"
import { useMetadata } from "@/hooks/use-metadata"
import { fetchWithTimeout } from "@/lib/fetch-utils"
import type { BalanceData } from "@/types/wallet-balance"
import type { AssetCardData } from "@/types/asset-card"
import type { BackstopCostBasis } from "@/lib/db/types"

// localStorage cache for instant repeat loads
const POSITIONS_CACHE_KEY = "blend-positions-cache"
const POSITIONS_CACHE_MAX_AGE = 24 * 60 * 60 * 1000 // 24 hours

interface PositionsCache {
  data: BlendWalletSnapshot
  timestamp: number
  publicKey: string
}

function getCachedPositions(publicKey: string): BlendWalletSnapshot | undefined {
  if (typeof window === "undefined") return undefined
  try {
    const cached = localStorage.getItem(POSITIONS_CACHE_KEY)
    if (!cached) return undefined
    const parsed: PositionsCache = JSON.parse(cached)
    // Validate cache: same wallet and not expired
    if (parsed.publicKey !== publicKey) return undefined
    if (Date.now() - parsed.timestamp > POSITIONS_CACHE_MAX_AGE) {
      localStorage.removeItem(POSITIONS_CACHE_KEY)
      return undefined
    }
    return parsed.data
  } catch {
    return undefined
  }
}

function setCachedPositions(publicKey: string, data: BlendWalletSnapshot): void {
  if (typeof window === "undefined") return
  try {
    const cache: PositionsCache = { data, timestamp: Date.now(), publicKey }
    localStorage.setItem(POSITIONS_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // localStorage full or unavailable - ignore
  }
}

const usdFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.00"
  }
  return usdFormatter.format(value)
}

function formatUsdWithDecimals(value: number, decimals = 7): string {
  if (!Number.isFinite(value)) {
    return "$0.00"
  }
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}

const ASSET_LOGO_MAP: Record<string, string> = {
  USDC: "/tokens/usdc.png",
  USDT: "/tokens/usdc.png",
  XLM: "/tokens/xlm.png",
  AQUA: "/tokens/aqua.png",
  EURC: "/tokens/eurc.png",
  CETES: "/tokens/cetes.png",
  USDGLO: "/tokens/usdglo.png",
  USTRY: "/tokens/ustry.png",
  BLND: "/tokens/blnd.png",
}

function resolveAssetLogo(symbol: string | undefined): string {
  if (!symbol) {
    return "/tokens/xlm.png"
  }
  const normalized = symbol.toUpperCase()
  return ASSET_LOGO_MAP[normalized] ?? "/tokens/xlm.png"
}

function buildBalanceData(snapshot: BlendWalletSnapshot | undefined): BalanceData {
  if (!snapshot) {
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

  const totalSupplyUsd = snapshot.positions.reduce(
    (acc, position) => acc + position.supplyUsdValue,
    0
  )

  // Include backstop balance in total
  const totalBackstopUsd = snapshot.totalBackstopUsd ?? 0
  const totalBalanceUsd = totalSupplyUsd + totalBackstopUsd

  const weightedSupplyApy = snapshot.weightedSupplyApy ?? 0
  // APY is already the effective annual rate (compound rate), so annual yield is simply Balance × APY
  const estimatedAnnualYield = (totalSupplyUsd * weightedSupplyApy) / 100

  return {
    balance: formatUsdWithDecimals(totalBalanceUsd),
    rawBalance: totalBalanceUsd, // USD value for yield calculation (includes backstop)
    apyPercentage: Number.isFinite(weightedSupplyApy) ? weightedSupplyApy : 0,
    interestEarned: "0.00",
    rawInterestEarned: 0,
    annualYield: formatUsd(estimatedAnnualYield),
    growthPercentage: 0, // Will be set when cost basis is available
    blndApy: snapshot.weightedBlndApy ?? 0,
  }
}

function buildAssetCards(snapshot: BlendWalletSnapshot | undefined): AssetCardData[] {
  if (!snapshot) return []

  const cards = snapshot.positions
    .filter((position) => position.supplyAmount > 0)
    .map<AssetCardData>((position) => ({
      id: position.id,
      protocolName: position.poolName || "Blend",
      assetName: position.symbol,
      logoUrl: resolveAssetLogo(position.symbol),
      balance: formatUsdWithDecimals(position.supplyUsdValue),
      rawBalance: position.supplyUsdValue, // USD value for yield calculation
      apyPercentage: position.supplyApy,
      growthPercentage: position.blndApy,
      earnedYield: 0, // Will be populated from page.tsx using: SDK balance - Dune cost basis
    }))

  return cards
}

// Fetch backstop cost basis from API
async function fetchBackstopCostBases(userAddress: string): Promise<BackstopCostBasis[]> {
  const response = await fetchWithTimeout(`/api/backstop-cost-basis?user=${encodeURIComponent(userAddress)}`)
  if (!response.ok) {
    throw new Error('Failed to fetch backstop cost basis')
  }
  const data = await response.json()
  return data.cost_bases || []
}

// Enrich backstop positions with yield data from cost basis
function enrichBackstopPositionsWithYield(
  positions: BlendBackstopPosition[],
  costBases: BackstopCostBasis[]
): BlendBackstopPosition[] {
  return positions.map(position => {
    const costBasis = costBases.find(cb => cb.pool_address === position.poolId)

    if (!costBasis) {
      return {
        ...position,
        costBasisLp: 0,
        yieldLp: 0,
        yieldPercent: 0,
      }
    }

    // Include queued withdrawals (Q4W) in total position - they're still the user's LP tokens
    // Q4W is just locked for 21 days, not actually withdrawn yet
    const totalLpTokens = position.lpTokens + position.q4wLpTokens
    let yieldLp = totalLpTokens - costBasis.cost_basis_lp

    // Handle floating-point precision: treat very small values as zero
    // The SDK and DB calculations can differ by tiny amounts (< 0.001 LP) due to precision
    const EPSILON = 0.0001
    if (Math.abs(yieldLp) < EPSILON) {
      yieldLp = 0
    }

    const yieldPercent = costBasis.cost_basis_lp > 0
      ? (yieldLp / costBasis.cost_basis_lp) * 100
      : 0

    return {
      ...position,
      costBasisLp: costBasis.cost_basis_lp,
      yieldLp,
      yieldPercent,
    }
  })
}

export function useBlendPositions(walletPublicKey: string | undefined, totalCostBasis?: number) {
  const { pools: dbPools } = useMetadata()
  const trackedPools = useMemo(() => toTrackedPools(dbPools), [dbPools])

  // Get cached data for instant display on repeat visits
  const cachedData = useMemo(
    () => walletPublicKey ? getCachedPositions(walletPublicKey) : undefined,
    [walletPublicKey]
  )

  // Fetch wallet snapshot from SDK
  const snapshotQuery = useQuery({
    queryKey: ["blend-wallet-snapshot", walletPublicKey, trackedPools.map(p => p.id).join(',')],
    enabled: !!walletPublicKey && trackedPools.length > 0,
    queryFn: () => fetchWalletBlendSnapshot(walletPublicKey, trackedPools),
    staleTime: 5 * 60_000, // Data considered stale after 5 minutes - positions change infrequently
    refetchInterval: 10 * 60_000, // Refetch every 10 minutes in background
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true, // Refetch when user returns to tab
    placeholderData: cachedData, // Show cached data instantly while fetching
  })

  // Update localStorage cache when fresh data arrives
  useEffect(() => {
    if (walletPublicKey && snapshotQuery.data && !snapshotQuery.isPlaceholderData) {
      setCachedPositions(walletPublicKey, snapshotQuery.data)
    }
  }, [walletPublicKey, snapshotQuery.data, snapshotQuery.isPlaceholderData])

  // Fetch backstop cost bases from database
  const costBasisQuery = useQuery({
    queryKey: ["backstop-cost-basis", walletPublicKey],
    enabled: !!walletPublicKey,
    queryFn: () => fetchBackstopCostBases(walletPublicKey!),
    staleTime: 5 * 60_000, // Cost basis changes less frequently
    refetchInterval: 10 * 60_000,
  })

  // Combine snapshot and cost basis data
  const query = useMemo(() => ({
    data: snapshotQuery.data,
    isLoading: snapshotQuery.isLoading || costBasisQuery.isLoading,
    isError: snapshotQuery.isError,
    error: snapshotQuery.error,
    refetch: snapshotQuery.refetch,
  }), [snapshotQuery, costBasisQuery])

  const balanceData = useMemo(() => {
    const data = buildBalanceData(query.data)

    // If we have cost basis from Dune, calculate real yield: SDK Balance - Cost Basis
    if (totalCostBasis !== undefined && totalCostBasis > 0) {
      const realYield = data.rawBalance - totalCostBasis
      const yieldPercentage = totalCostBasis > 0 ? (realYield / totalCostBasis) * 100 : 0

      return {
        ...data,
        interestEarned: formatUsd(realYield),
        rawInterestEarned: realYield,
        growthPercentage: yieldPercentage,
      }
    }

    return data
  }, [query.data, totalCostBasis])

  const assetCards = useMemo(() => buildAssetCards(query.data), [query.data])

  const totalEmissions = useMemo(() => query.data?.totalEmissions ?? 0, [query.data]);

  const blndPrice = useMemo(
    () => query.data?.blndPrice ?? null,
    [query.data]
  );

  const lpTokenPrice = useMemo(
    () => query.data?.lpTokenPrice ?? null,
    [query.data]
  );

  const backstopPositions = useMemo(() => {
    const positions = snapshotQuery.data?.backstopPositions ?? []
    const costBases = costBasisQuery.data ?? []
    return enrichBackstopPositionsWithYield(positions, costBases)
  }, [snapshotQuery.data, costBasisQuery.data]);

  const totalBackstopUsd = useMemo(
    () => query.data?.totalBackstopUsd ?? 0,
    [query.data]
  );

  return {
    ...query,
    balanceData,
    assetCards,
    totalEmissions,
    blndPrice,
    lpTokenPrice,
    backstopPositions,
    totalBackstopUsd,
  }
}
