/**
 * Balance History Types
 * Types for displaying historical balance data from the backfill backend
 */

import type { ActionType } from '@/lib/db/types'

/**
 * Time period options for the bar chart
 */
export type TimePeriod = '1W' | '1M' | '1Y' | 'All' | 'Projection'

/**
 * Data point for the bar chart
 */
export interface BarChartDataPoint {
  // Period identification
  period: string              // Display label: "Dec 5" or "Dec 2025" or "2025"
  periodStart: string         // Start date ISO string
  periodEnd: string           // End date ISO string

  // Values
  balance: number             // Balance at end of period (supply only, not deducting borrows)
  yieldEarned: number         // Yield earned during this period
  deposit: number             // Principal/cost basis
  borrow: number              // Borrowed amount at end of period

  // BLND rewards (for projections)
  blndYield?: number          // Cumulative BLND yield in USD (with compounding)

  // Events for this period
  events: BarChartEvent[]

  // Metadata
  isProjected?: boolean       // True for projection tab data
  isToday?: boolean           // True if period contains today
  baseBalance?: number        // Initial balance for projection overlay (constant)
}

/**
 * Event attached to a bar chart period
 */
export interface BarChartEvent {
  type: ActionType
  date: string
  amount: number | null
  assetSymbol: string | null
  assetDecimals: number | null
}

/**
 * Raw balance history record from the database
 * Matches the UserBalance interface from backfill_backend
 */
export interface BalanceHistoryRecord {
  pool_id: string
  user_address: string
  asset_address: string
  snapshot_date: string
  snapshot_timestamp: string
  ledger_sequence: number
  supply_btokens: number
  collateral_btokens: number
  liabilities_dtokens: number
  entry_hash: string | null
  ledger_entry_change: number | null
  b_rate: number
  d_rate: number
  supply_balance: number
  collateral_balance: number
  debt_balance: number
  net_balance: number
  total_cost_basis: number | null
  total_yield: number | null
}

/**
 * API response from balance history endpoint
 */
export interface BalanceHistoryResponse {
  user_address: string
  asset_address: string
  days: number
  count: number
  history: BalanceHistoryRecord[]
  firstEventDate: string | null // The absolute first event date for this user/asset
}

/**
 * Chart data point for visualization
 * Includes aggregated data and markers for deposits/withdrawals
 */
export interface ChartDataPoint {
  date: string // YYYY-MM-DD
  formattedDate: string // "Jan 15"
  timestamp: number // Unix timestamp

  // Per-pool balances (for stacked areas)
  pool_yieldblox?: number
  pool_blend?: number

  // Aggregated total
  total: number

  // Deposit and yield breakdown
  deposit: number // Principal deposited (bTokens * b_rate)
  yield: number // Interest earned (total - deposit)
  borrow: number // Total borrowed amount (debt_balance)

  // Position change markers
  isDeposit?: boolean
  depositChange?: number

  // Enhanced chart markers
  isToday?: boolean // Marks the current day
  isProjected?: boolean // Marks projected future data

  // For tooltip display
  pools: {
    poolId: string
    poolName: string
    balance: number
    deposit: number // Cost basis / principal for this pool
    yield: number // Yield from Dune (total_yield field)
    borrow: number // Borrowed amount for this pool
  }[]
}

/**
 * Position change detection result
 */
export interface PositionChange {
  index: number // Index in the data array
  date: string
  supplyChange: number
  collateralChange: number
  debtChange: number
  netChange: number
  isSignificant: boolean // Change > threshold
}

/**
 * Earnings and performance statistics
 */
export interface EarningsStats {
  totalInterest: number // Total interest earned (excluding deposits)
  currentAPY: number // Calculated APY percentage
  avgDailyInterest: number // Average interest per day
  projectedAnnual: number // Projected annual earnings
  dayCount: number // Number of days in the period
  avgPosition: number // Average position size
  perPool: Record<
    string,
    {
      totalInterest: number
      currentAPY: number
      avgDailyInterest: number
      projectedAnnual: number
      avgPosition: number
    }
  > // Per-pool statistics
}

/**
 * Pool name mapping
 */
export const POOL_NAMES: Record<string, string> = {
  'CCCCIQSDILITHMM7PBSLVDT5MISSY7R26MNZXCX4H7J5JQ5FPIYOGYFS': 'YieldBlox',
  'CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD': 'Blend Pool',
}

/**
 * Pool color mapping for charts
 */
export const POOL_COLORS: Record<string, string> = {
  'CCCCIQSDILITHMM7PBSLVDT5MISSY7R26MNZXCX4H7J5JQ5FPIYOGYFS': '#9333ea', // YieldBlox - Purple
  'CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD': '#0ea5e9', // Blend Pool - Cyan
}
