"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchWalletBlendSnapshot, type BlendWalletSnapshot } from "@/lib/blend/positions"
import { toTrackedPools } from "@/lib/blend/pools"
import { useMetadata } from "@/hooks/use-metadata"
import type { BalanceData } from "@/types/wallet-balance"
import type { AssetCardData } from "@/types/asset-card"

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
  const weightedSupplyApy = snapshot.weightedSupplyApy ?? 0
  // APY is already the effective annual rate (compound rate), so annual yield is simply Balance × APY
  const estimatedAnnualYield = (totalSupplyUsd * weightedSupplyApy) / 100

  return {
    balance: formatUsdWithDecimals(totalSupplyUsd),
    rawBalance: totalSupplyUsd, // USD value for yield calculation
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

export function useBlendPositions(walletPublicKey: string | undefined, totalCostBasis?: number) {
  const { pools: dbPools } = useMetadata()
  const trackedPools = useMemo(() => toTrackedPools(dbPools), [dbPools])

  const query = useQuery({
    queryKey: ["blend-wallet-snapshot", walletPublicKey, trackedPools.map(p => p.id).join(',')],
    enabled: !!walletPublicKey && trackedPools.length > 0,
    queryFn: () => fetchWalletBlendSnapshot(walletPublicKey, trackedPools),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false, // Don't waste requests when tab is hidden
  })

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

  return {
    ...query,
    balanceData,
    assetCards,
    totalEmissions,
    blndPrice,
  }
}
