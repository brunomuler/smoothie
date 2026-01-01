/**
 * Explore Page Types
 */

export type ApyPeriod = 'current' | '7d' | '30d' | '90d' | '180d'

export interface SupplyExploreItem {
  poolId: string
  poolName: string
  assetAddress: string
  tokenSymbol: string
  tokenName: string | null
  iconUrl: string | null
  supplyApy: number | null
  blndApy: number | null
}

export interface BackstopExploreItem {
  poolId: string
  poolName: string
  iconUrl: string | null
  interestApr: number
  emissionApy: number
  totalApy: number
}

export type SortBy = 'apy' | 'blnd' | 'total'

export interface ExploreFilters {
  period: ApyPeriod
  tokenFilter: 'all' | 'usdc'
  sortBy: SortBy
}

export interface ExploreData {
  period: ApyPeriod
  supplyItems: SupplyExploreItem[]
  backstopItems: BackstopExploreItem[]
}
