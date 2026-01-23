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
  supplyApy: number | null // Period-filtered APY (or current if period='current')
  currentSupplyApy: number | null // Always the current SDK APY for sparkline today value
  blndApy: number | null
  totalSupplied: number | null
  totalBorrowed: number | null
  totalSuppliedTokens: number | null
  totalBorrowedTokens: number | null
}

export interface BackstopExploreItem {
  poolId: string
  poolName: string
  iconUrl: string | null
  interestApr: number
  emissionApy: number
  totalApy: number
  totalDeposited: number | null
  totalQ4w: number | null
  q4wPercent: number | null
}

export interface PoolTokenItem {
  assetAddress: string
  tokenSymbol: string
  iconUrl: string | null
  totalSupplied: number
  totalBorrowed: number
}

export interface Pool24hChange {
  poolId: string
  supplyChange: number
  borrowChange: number
}

export interface PoolExploreItem {
  poolId: string
  poolName: string
  iconUrl: string | null
  totalTvl: number
  totalBorrowed: number
  tokens: PoolTokenItem[]
  supplyChange24h: number
  borrowChange24h: number
}

export type SortBy = 'apy' | 'blnd' | 'total'

export interface ExploreFilters {
  period: ApyPeriod
  tokenFilter: 'all' | 'usdc'
  sortBy: SortBy
}

export interface LpPriceDataPoint {
  date: string
  price: number
}

export interface ExploreData {
  period: ApyPeriod
  supplyItems: SupplyExploreItem[]
  backstopItems: BackstopExploreItem[]
  pool24hChanges: Pool24hChange[]
  lpTokenPrice: number | null // SDK LP token price for sparkline chart
  lpPriceHistory: LpPriceDataPoint[] // Historical LP prices for sparkline
}
