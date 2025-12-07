import { ActionType } from '@/lib/db/types'

// Query types for the explore page
export type ExploreQueryType = 'deposits' | 'events' | 'balance' | 'top-depositors' | 'aggregates'

// Time range presets
export type TimeRangePreset = '7d' | '30d' | '90d' | '1y' | 'all'

// Result types for different queries
export interface AccountDepositResult {
  userAddress: string
  totalDeposited: number // In native token (underlying / 1e7)
  totalDepositedUsd: number // In USD
  depositCount: number
  lastDepositDate: string
  assetSymbol?: string
}

export interface AccountEventCountResult {
  userAddress: string
  eventCount: number
  eventsByType: Record<string, number>
  firstEventDate: string
  lastEventDate: string
}

export interface AccountBalanceResult {
  userAddress: string
  balance: number // Net balance in native token
  balanceUsd: number // Net balance in USD
  supplyBalance: number
  collateralBalance: number
  debtBalance: number
  netBalance: number
  assetSymbol?: string
}

export interface TopDepositorResult {
  userAddress: string
  poolId: string
  poolName: string
  totalDeposited: number
  totalDepositedUsd: number
  rank: number
  assetSymbol?: string
}

export interface AggregateMetrics {
  totalDeposits: number
  totalDepositsUsd: number
  totalWithdrawals: number
  totalWithdrawalsUsd: number
  netFlow: number
  netFlowUsd: number
  activeAccounts: number
  totalEvents: number
}

export interface TokenVolumeResult {
  assetAddress: string
  symbol: string
  name: string | null
  depositVolume: number
  depositVolumeUsd: number
  withdrawVolume: number
  withdrawVolumeUsd: number
  netVolume: number
  netVolumeUsd: number
}

// Filter parameters for explore queries
export interface ExploreFilters {
  query: ExploreQueryType
  assetAddress?: string
  poolId?: string
  minAmount?: number
  minCount?: number
  inUsd: boolean
  eventTypes?: ActionType[]
  startDate?: string
  endDate?: string
  orderBy?: 'amount' | 'count' | 'date'
  orderDir?: 'asc' | 'desc'
  limit: number
  offset: number
}

// API response types
export interface ExploreDepositsResponse {
  query: 'deposits'
  filters: ExploreFilters
  count: number
  totalCount: number
  results: AccountDepositResult[]
  aggregates: AggregateMetrics
}

export interface ExploreEventsResponse {
  query: 'events'
  filters: ExploreFilters
  count: number
  totalCount: number
  results: AccountEventCountResult[]
  aggregates: AggregateMetrics
}

export interface ExploreBalanceResponse {
  query: 'balance'
  filters: ExploreFilters
  count: number
  totalCount: number
  results: AccountBalanceResult[]
  aggregates: AggregateMetrics
}

export interface ExploreTopDepositorsResponse {
  query: 'top-depositors'
  filters: ExploreFilters
  count: number
  results: TopDepositorResult[]
  aggregates: AggregateMetrics
}

export interface ExploreAggregatesResponse {
  query: 'aggregates'
  filters: ExploreFilters
  aggregates: AggregateMetrics
  volumeByToken: TokenVolumeResult[]
}

export type ExploreResponse =
  | ExploreDepositsResponse
  | ExploreEventsResponse
  | ExploreBalanceResponse
  | ExploreTopDepositorsResponse
  | ExploreAggregatesResponse

// Price data
export interface TokenPrice {
  assetAddress: string
  symbol: string
  usd: number
  source: 'coingecko' | 'mock'
  timestamp: number
}

export interface PricesResponse {
  prices: Record<string, TokenPrice>
}
