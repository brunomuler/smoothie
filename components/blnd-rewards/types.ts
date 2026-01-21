export interface BackstopPositionData {
  poolId: string
  poolName: string
  claimableBlnd?: number
  simulatedEmissionsLp?: number | null // LP tokens claimable from emissions (via on-chain simulation)
  emissionApy?: number // APY from BLND emissions for this pool's backstop (in %)
  lpTokensUsd?: number // USD value of LP tokens in this backstop position
}

export interface BlndRewardsCardProps {
  publicKey: string
  pendingEmissions: number // Supply/borrow claimable BLND (total)
  pendingSupplyEmissions?: number // Claimable BLND from deposits
  pendingBorrowEmissions?: number // Claimable BLND from borrows
  backstopClaimableBlnd?: number // Backstop claimable BLND from SDK (usually 0 - SDK doesn't estimate)
  blndPrice: number | null
  lpTokenPrice?: number | null // LP token price for historical pricing fallback
  blndPerLpToken?: number // For converting backstop LP to BLND
  blndApy?: number
  totalPositionUsd?: number // Total USD value of positions earning BLND (for yield projection)
  isLoading?: boolean
  // Per-pool data for table display
  perPoolEmissions?: Record<string, number> // poolId -> claimable BLND (total)
  perPoolSupplyEmissions?: Record<string, number> // poolId -> claimable BLND from deposits
  perPoolBorrowEmissions?: Record<string, number> // poolId -> claimable BLND from borrows
  backstopPositions?: BackstopPositionData[] // Backstop positions with pool info
  poolNames?: Record<string, string> // poolId -> pool name (for supply/borrow positions)
}

export type EmissionType = 'deposit' | 'borrow' | 'backstop'

export interface TableRow {
  name: string
  claimable: number
  claimed: number
  type: EmissionType
  tokenUnit: 'BLND' | 'LP'
}
