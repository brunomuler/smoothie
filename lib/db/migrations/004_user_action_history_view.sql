-- Migration: Create user action history view
-- Description: Joins parsed_events with pools and tokens for rich action history

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
    WHEN e.action_type = 'claim' THEN NULL
    ELSE NULL
  END AS rate_type,
  -- For claims, amount_tokens contains the claim amount (always BLND)
  CASE
    WHEN e.action_type = 'claim' THEN e.amount_tokens
    ELSE NULL
  END AS claim_amount
FROM parsed_events e
LEFT JOIN pools p ON e.pool_id = p.pool_id
LEFT JOIN tokens t ON e.asset_address = t.asset_address;

-- Comment for documentation
COMMENT ON VIEW user_action_history IS
  'User action history with pool and token metadata. Filter by user_address for specific user history.';
