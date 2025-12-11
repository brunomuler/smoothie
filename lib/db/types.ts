// Balance Calculation Types
export interface UserBalance {
  pool_id: string
  user_address: string
  asset_address: string
  snapshot_date: string
  snapshot_timestamp: string
  ledger_sequence: number
  supply_balance: number
  collateral_balance: number
  debt_balance: number
  net_balance: number
  supply_btokens: number
  collateral_btokens: number
  liabilities_dtokens: number
  entry_hash: string | null
  ledger_entry_change: number | null
  b_rate: number
  d_rate: number
  // Debug fields for rate comparison
  position_b_rate?: number | null
  position_d_rate?: number | null
  snapshot_b_rate?: number | null
  snapshot_d_rate?: number | null
  position_date?: string | null
  // Cost basis and yield fields (computed from events)
  total_cost_basis?: number | null
  total_yield?: number | null
  // Borrow cost basis and interest fields
  borrow_cost_basis?: number | null
  total_interest_accrued?: number | null
}

// User Action Types
export type ActionType =
  | 'supply'
  | 'withdraw'
  | 'supply_collateral'
  | 'withdraw_collateral'
  | 'borrow'
  | 'repay'
  | 'claim'
  | 'liquidate'
  | 'new_auction'
  | 'fill_auction'
  | 'delete_auction'
  // Backstop actions
  | 'backstop_deposit'
  | 'backstop_withdraw'
  | 'backstop_queue_withdrawal'
  | 'backstop_dequeue_withdrawal'
  | 'backstop_claim'

// Auction types from Blend protocol
// 0=interest, 2=liquidation, 7=bad_debt
export type AuctionType = number

export interface UserAction {
  id: string
  pool_id: string
  pool_name: string | null
  pool_short_name: string | null
  transaction_hash: string
  ledger_sequence: number
  ledger_closed_at: string
  action_type: ActionType
  asset_address: string | null
  asset_symbol: string | null
  asset_name: string | null
  asset_decimals: number | null
  asset_icon_url: string | null
  user_address: string
  amount_underlying: number | null
  amount_tokens: number | null
  implied_rate: number | null
  rate_type: 'b_rate' | 'd_rate' | 'auction' | null
  claim_amount: number | null
  // Auction-specific fields
  auction_type: AuctionType | null
  filler_address: string | null
  liquidation_percent: number | null
  lot_asset: string | null
  lot_amount: number | null
  bid_asset: string | null
  bid_amount: number | null
  // Resolved token symbols for auction assets
  lot_asset_symbol: string | null
  bid_asset_symbol: string | null
  // Backstop-specific fields
  lp_tokens: number | null
  shares: number | null
  q4w_expiration: number | null
}

// Pool Metadata
export interface Pool {
  pool_id: string
  name: string
  short_name: string | null
  description: string | null
  icon_url: string | null
  website_url: string | null
  is_active: boolean
  version: number // 1 = V1, 2 = V2 (matches Blend SDK Version enum)
}

// Token Metadata
export interface Token {
  asset_address: string
  symbol: string
  name: string | null
  decimals: number
  icon_url: string | null
  coingecko_id: string | null
  is_native: boolean
}

// Daily Rate
export interface DailyRate {
  pool_id: string
  asset_address: string
  rate_date: string
  b_rate: number | null
  d_rate: number | null
  rate_timestamp: string | null
  ledger_sequence: number | null
}

// Backstop Pool State (aggregated from events)
export interface BackstopPoolState {
  pool_address: string
  total_lp_tokens: number  // Total LP tokens in the backstop pool
  total_shares: number     // Total shares issued
  share_rate: number       // LP tokens per share (total_lp_tokens / total_shares)
  as_of_date: string       // Date this state represents
}

// Backstop User Balance History
export interface BackstopUserBalance {
  date: string
  cumulative_shares: number    // User's total shares as of this date
  lp_tokens_value: number      // Shares converted to LP tokens using pool rate
  pool_address: string
}

// Backstop Cost Basis
export interface BackstopCostBasis {
  pool_address: string
  user_address: string
  total_deposited_lp: number   // Sum of all deposited LP tokens
  total_withdrawn_lp: number   // Sum of all withdrawn LP tokens
  cost_basis_lp: number        // Net LP tokens deposited (deposited - withdrawn)
  first_deposit_date: string | null
  last_activity_date: string | null
}

// Backstop Yield
export interface BackstopYield {
  pool_address: string
  user_address: string
  cost_basis_lp: number        // Original LP tokens deposited (net)
  current_lp_tokens: number    // Current LP token value of shares
  yield_lp: number             // LP tokens earned (current - cost basis)
  yield_percent: number        // Percentage yield
}
