"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchWalletBlendSnapshot, type BlendWalletSnapshot, type BlendBackstopPosition } from "@/lib/blend/positions"
import { toTrackedPools } from "@/lib/blend/pools"
import { useMetadata } from "@/hooks/use-metadata"
import type { BalanceData } from "@/types/wallet-balance"
import type { AssetCardData } from "@/types/asset-card"
import type { BackstopCostBasis } from "@/lib/db/types"

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
  BLND: "/tokens/xlm.png",
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

  return snapshot.positions
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
}

// Fetch backstop cost basis from API
async function fetchBackstopCostBases(userAddress: string): Promise<BackstopCostBasis[]> {
  const response = await fetch(`/api/backstop-cost-basis?user=${encodeURIComponent(userAddress)}`)
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
  console.log('[backstop-yield] ========== DEBUG START ==========')
  console.log('[backstop-yield] Positions count:', positions.length)
  console.log('[backstop-yield] Cost bases count:', costBases.length)
  console.log('[backstop-yield] Cost bases raw:', JSON.stringify(costBases, null, 2))
  console.log('[backstop-yield] Positions raw:', positions.map(p => ({
    poolId: p.poolId,
    poolName: p.poolName,
    lpTokens: p.lpTokens,
    q4wLpTokens: p.q4wLpTokens,
    totalLp: p.lpTokens + p.q4wLpTokens
  })))

  return positions.map(position => {
    // Try to find matching cost basis - log all pool addresses for comparison
    console.log('[backstop-yield] Searching for poolId:', position.poolId)
    console.log('[backstop-yield] Available pool_addresses:', costBases.map(cb => cb.pool_address))

    const costBasis = costBases.find(cb => cb.pool_address === position.poolId)
    console.log('[backstop-yield] Match found:', !!costBasis)

    if (!costBasis) {
      // No cost basis data - return position with zero yield
      console.log('[backstop-yield] NO COST BASIS - checking if pool addresses differ in format')
      // Check for partial matches
      const partialMatch = costBases.find(cb =>
        cb.pool_address?.includes(position.poolId) ||
        position.poolId?.includes(cb.pool_address)
      )
      if (partialMatch) {
        console.log('[backstop-yield] PARTIAL MATCH FOUND:', partialMatch.pool_address)
      }
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
    const yieldLp = totalLpTokens - costBasis.cost_basis_lp
    const yieldPercent = costBasis.cost_basis_lp > 0
      ? (yieldLp / costBasis.cost_basis_lp) * 100
      : 0

    console.log('[backstop-yield] YIELD CALCULATED:', {
      poolId: position.poolId,
      currentLpTokens: position.lpTokens,
      q4wLpTokens: position.q4wLpTokens,
      totalLpTokens,
      costBasisLp: costBasis.cost_basis_lp,
      yieldLp,
      yieldPercent: yieldPercent.toFixed(4) + '%'
    })
    console.log('[backstop-yield] ========== DEBUG END ==========')

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

  // Fetch wallet snapshot from SDK
  const snapshotQuery = useQuery({
    queryKey: ["blend-wallet-snapshot", walletPublicKey, trackedPools.map(p => p.id).join(',')],
    enabled: !!walletPublicKey && trackedPools.length > 0,
    queryFn: () => fetchWalletBlendSnapshot(walletPublicKey, trackedPools),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })

  // Fetch backstop cost bases from database
  const costBasisQuery = useQuery({
    queryKey: ["backstop-cost-basis", walletPublicKey],
    enabled: !!walletPublicKey,
    queryFn: () => fetchBackstopCostBases(walletPublicKey!),
    staleTime: 60_000, // Cost basis changes less frequently
    refetchInterval: 120_000,
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

  const totalEmissions = useMemo(
    () => query.data?.totalEmissions ?? 0,
    [query.data]
  );

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
