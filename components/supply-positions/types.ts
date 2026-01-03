/**
 * Supply Positions Types
 *
 * Type definitions for the supply positions component.
 */

import type { AssetCardData } from "@/types/asset-card"

export interface Q4WChunkData {
  lpTokens: number
  expiration: number
}

export interface BackstopYieldBreakdown {
  costBasisHistorical: number
  protocolYieldUsd: number
  priceChangeUsd: number
  totalEarnedUsd: number
  totalEarnedPercent: number
}

export interface BackstopPositionData {
  poolId: string
  poolName: string
  lpTokens: number
  lpTokensUsd: number
  yieldLp: number
  yieldPercent: number
  interestApr: number
  emissionApy: number
  q4wShares: bigint
  q4wLpTokens: number
  q4wExpiration: number | null
  q4wChunks: Q4WChunkData[]
  unlockedQ4wShares: bigint
  unlockedQ4wLpTokens: number
  yieldBreakdown?: BackstopYieldBreakdown
}

export interface BlendPosition {
  id: string
  poolId: string
  poolName: string
  supplyAmount: number
  symbol: string
}

export interface SupplyPositionsProps {
  isLoading: boolean
  enrichedAssetCards: AssetCardData[]
  backstopPositions: BackstopPositionData[]
  blendSnapshot: { positions: BlendPosition[] } | null | undefined
  onPoolClick?: (poolId: string, poolName: string) => void
}
