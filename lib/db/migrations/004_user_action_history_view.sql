-- Migration: Create user action history view
-- Description: Joins parsed_events with pools and tokens for rich action history
-- Updated: 2025-12-08 - Added auction event support (new_auction, fill_auction, delete_auction)

-- Drop existing view if it exists
DROP VIEW IF EXISTS user_action_history CASCADE;

-- Create view for user action history
CREATE VIEW user_action_history AS
SELECT
  e.id,
  e.pool_id,
  p.name AS pool_name,
  p.short_name AS pool_short_name,
  e.transaction_hash,
  e.ledger_sequence,
  e.ledger_closed_at,
  e.action_type,
  e.asset_address,
  t.symbol AS asset_symbol,
  t.name AS asset_name,
  t.decimals AS asset_decimals,
  e.user_address,
  e.amount_underlying,
  e.amount_tokens,
  e.implied_rate,
  -- Determine rate type based on action
  CASE
    WHEN e.action_type IN ('supply', 'withdraw', 'supply_collateral', 'withdraw_collateral') THEN 'b_rate'
    WHEN e.action_type IN ('borrow', 'repay') THEN 'd_rate'
    WHEN e.action_type IN ('new_auction', 'fill_auction', 'delete_auction') THEN 'auction'
    WHEN e.action_type = 'claim' THEN NULL
    ELSE NULL
  END AS rate_type,
  -- For claims, use amount_underlying (claims are always BLND, asset_address is not set)
  CASE
    WHEN e.action_type = 'claim' THEN e.amount_underlying
    ELSE NULL
  END AS claim_amount,
  -- Auction-specific fields
  e.auction_type,
  e.filler_address,
  e.liquidation_percent,
  e.lot_asset,
  e.lot_amount,
  e.bid_asset,
  e.bid_amount,
  -- Resolve lot and bid asset symbols
  lot_token.symbol AS lot_asset_symbol,
  bid_token.symbol AS bid_asset_symbol
FROM parsed_events e
LEFT JOIN pools p ON e.pool_id = p.pool_id
LEFT JOIN tokens t ON e.asset_address = t.asset_address
LEFT JOIN tokens lot_token ON e.lot_asset = lot_token.asset_address
LEFT JOIN tokens bid_token ON e.bid_asset = bid_token.asset_address;

-- Comment for documentation
COMMENT ON VIEW user_action_history IS
  'User action history with pool and token metadata. Includes auction events with lot/bid asset resolution. Filter by user_address for specific user history.';
