/**
 * Blend Snapshot API Route
 *
 * Returns the Blend wallet snapshot data (positions, backstop, etc.)
 * This endpoint wraps SDK calls so demo wallet addresses stay server-side.
 */

import { NextRequest } from 'next/server'
import {
  createApiHandler,
  requireString,
  resolveWalletAddress,
  CACHE_CONFIGS,
} from '@/lib/api'
import { fetchWalletBlendSnapshot, type BlendWalletSnapshot, type BlendBackstopPosition } from '@/lib/blend/positions'
import { toTrackedPools } from '@/lib/blend/pools'
import { metadataRepository } from '@/lib/db/repositories/metadata-repository'

// Serializable version of backstop position (BigInt converted to string)
type SerializableBackstopPosition = Omit<BlendBackstopPosition, 'shares' | 'q4wShares' | 'unlockedQ4wShares' | 'q4wChunks'> & {
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

type SerializableSnapshot = Omit<BlendWalletSnapshot, 'backstopPositions' | 'backstopPoolBlnd' | 'backstopPoolShares'> & {
  backstopPositions: SerializableBackstopPosition[]
  backstopPoolBlnd: string
  backstopPoolShares: string
}

// Convert BigInt values to strings for JSON serialization
function serializeSnapshot(snapshot: BlendWalletSnapshot): SerializableSnapshot {
  return {
    ...snapshot,
    backstopPositions: snapshot.backstopPositions.map(bp => ({
      ...bp,
      shares: bp.shares.toString(),
      q4wShares: bp.q4wShares.toString(),
      unlockedQ4wShares: bp.unlockedQ4wShares.toString(),
      q4wChunks: bp.q4wChunks.map(chunk => ({
        ...chunk,
        shares: chunk.shares.toString(),
      })),
    })),
    backstopPoolBlnd: snapshot.backstopPoolBlnd.toString(),
    backstopPoolShares: snapshot.backstopPoolShares.toString(),
  }
}

export const GET = createApiHandler<SerializableSnapshot>({
  logPrefix: '[Blend Snapshot API]',
  cache: CACHE_CONFIGS.MEDIUM, // 5 minute cache

  async handler(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams

    // Get and resolve the user parameter (handles demo wallet aliases)
    const userParam = requireString(searchParams, 'user')
    const userAddress = resolveWalletAddress(userParam)

    // Get tracked pools from database
    const pools = await metadataRepository.getPools()
    const trackedPools = toTrackedPools(pools)

    if (trackedPools.length === 0) {
      // Return empty snapshot if no pools
      return {
        positions: [],
        backstopPositions: [],
        poolEstimates: [],
        totalSupplyUsd: 0,
        totalBorrowUsd: 0,
        totalCollateralUsd: 0,
        totalNonCollateralUsd: 0,
        totalBackstopUsd: 0,
        totalBackstopQ4wUsd: 0,
        netPositionUsd: 0,
        weightedSupplyApy: null,
        weightedBorrowApy: null,
        netApy: null,
        weightedBlndApy: null,
        weightedSupplyBorrowBlndApy: null,
        totalEmissions: 0,
        totalSupplyEmissions: 0,
        totalBorrowEmissions: 0,
        perPoolEmissions: {},
        perPoolSupplyEmissions: {},
        perPoolBorrowEmissions: {},
        blndPrice: null,
        lpTokenPrice: null,
        blndPerLpToken: 0,
        backstopPoolBlnd: '0',
        backstopPoolShares: '0',
      }
    }

    // Fetch the wallet snapshot using the resolved address
    const snapshot = await fetchWalletBlendSnapshot(userAddress, trackedPools)

    // Serialize BigInt values to strings for JSON response
    return serializeSnapshot(snapshot)
  },
})
