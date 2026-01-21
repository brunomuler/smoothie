"use client"

import { fetchWalletBlendSnapshot, type BlendWalletSnapshot, type BlendBackstopPosition } from "@/lib/blend/positions"
import { type TrackedPool } from "@/lib/blend/pools"
import { fetchWithTimeout } from "@/lib/fetch-utils"

/**
 * Check if a wallet is a demo wallet (by alias format)
 */
export function isDemoWallet(publicKey: string | undefined): boolean {
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

/**
 * Convert serialized strings back to BigInt
 */
export function deserializeSnapshot(data: SerializedSnapshot): BlendWalletSnapshot {
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

/**
 * Fetch snapshot from backend API (for demo wallets - keeps addresses server-side)
 */
export async function fetchSnapshotFromApi(walletAlias: string): Promise<BlendWalletSnapshot> {
  const response = await fetchWithTimeout(`/api/blend-snapshot?user=${encodeURIComponent(walletAlias)}`)
  if (!response.ok) {
    throw new Error('Failed to fetch blend snapshot')
  }
  const data: SerializedSnapshot = await response.json()
  return deserializeSnapshot(data)
}

/**
 * Fetch snapshot - either from API (demo) or SDK (regular wallets)
 */
export async function fetchSnapshot(
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
