-- Migration: Create daily rates view from parsed_events
-- Description: Derives daily b_rate and d_rate from the last event of each day
-- Note: implied_rate represents b_rate or d_rate depending on action_type
-- Note: Dust transactions (amount_tokens < 1,000,000 stroops = 0.1 tokens) are filtered out
--       to avoid incorrect rates from tiny amounts where integer division causes errors
-- Note: Both b_rate and d_rate are forward-filled to carry forward the last known value

-- Drop existing view if it exists
DROP MATERIALIZED VIEW IF EXISTS daily_rates CASCADE;

-- Minimum amount threshold to filter out dust transactions (in stroops)
-- 1,000,000 stroops = 0.1 tokens (with 7 decimal places)
-- This prevents bad implied_rate calculations from tiny dust amounts

-- Create materialized view for daily rates
-- This gets the last b_rate and d_rate event of each day per pool/asset
-- and forward-fills missing values
CREATE MATERIALIZED VIEW daily_rates AS
WITH b_rate_events AS (
  -- Get last b_rate event of each day (supply/withdraw actions)
  -- Filter out dust transactions to avoid bad rate calculations
  SELECT DISTINCT ON (pool_id, asset_address, DATE(ledger_closed_at))
    pool_id,
    asset_address,
    DATE(ledger_closed_at) AS rate_date,
    implied_rate AS b_rate,
    ledger_closed_at AS rate_timestamp,
    ledger_sequence
  FROM parsed_events
  WHERE implied_rate IS NOT NULL
    AND action_type IN ('supply', 'withdraw', 'supply_collateral', 'withdraw_collateral')
    AND amount_tokens >= 1000000  -- Filter dust: minimum 0.1 tokens (1M stroops)
  ORDER BY pool_id, asset_address, DATE(ledger_closed_at), ledger_closed_at DESC
),
d_rate_events AS (
  -- Get last d_rate event of each day (borrow/repay actions)
  -- Filter out dust transactions to avoid bad rate calculations
  SELECT DISTINCT ON (pool_id, asset_address, DATE(ledger_closed_at))
    pool_id,
    asset_address,
    DATE(ledger_closed_at) AS rate_date,
    implied_rate AS d_rate,
    ledger_closed_at AS rate_timestamp,
    ledger_sequence
  FROM parsed_events
  WHERE implied_rate IS NOT NULL
    AND action_type IN ('borrow', 'repay')
    AND amount_tokens >= 1000000  -- Filter dust: minimum 0.1 tokens (1M stroops)
  ORDER BY pool_id, asset_address, DATE(ledger_closed_at), ledger_closed_at DESC
),
-- Get all unique pool/asset combinations
pool_assets AS (
  SELECT DISTINCT pool_id, asset_address FROM b_rate_events
  UNION
  SELECT DISTINCT pool_id, asset_address FROM d_rate_events
),
-- Get date range for each pool/asset (from first event to today)
date_ranges AS (
  SELECT
    pa.pool_id,
    pa.asset_address,
    LEAST(
      (SELECT MIN(rate_date) FROM b_rate_events WHERE pool_id = pa.pool_id AND asset_address = pa.asset_address),
      (SELECT MIN(rate_date) FROM d_rate_events WHERE pool_id = pa.pool_id AND asset_address = pa.asset_address)
    ) AS min_date
  FROM pool_assets pa
),
-- Generate all dates for each pool/asset
all_dates AS (
  SELECT
    dr.pool_id,
    dr.asset_address,
    d::date AS rate_date
  FROM date_ranges dr
  CROSS JOIN LATERAL generate_series(dr.min_date, CURRENT_DATE, '1 day'::interval) AS d
),
-- Join with actual rate events
joined_rates AS (
  SELECT
    ad.pool_id,
    ad.asset_address,
    ad.rate_date,
    b.b_rate,
    d.d_rate,
    b.rate_timestamp AS b_rate_timestamp,
    d.rate_timestamp AS d_rate_timestamp,
    b.ledger_sequence AS b_ledger_sequence,
    d.ledger_sequence AS d_ledger_sequence
  FROM all_dates ad
  LEFT JOIN b_rate_events b
    ON ad.pool_id = b.pool_id
    AND ad.asset_address = b.asset_address
    AND ad.rate_date = b.rate_date
  LEFT JOIN d_rate_events d
    ON ad.pool_id = d.pool_id
    AND ad.asset_address = d.asset_address
    AND ad.rate_date = d.rate_date
),
-- Forward-fill: create groups for each contiguous null sequence
forward_fill_groups AS (
  SELECT
    pool_id,
    asset_address,
    rate_date,
    b_rate,
    d_rate,
    b_rate_timestamp,
    d_rate_timestamp,
    b_ledger_sequence,
    d_ledger_sequence,
    -- Create group IDs for forward-fill
    COUNT(b_rate) OVER (PARTITION BY pool_id, asset_address ORDER BY rate_date) AS b_rate_group,
    COUNT(d_rate) OVER (PARTITION BY pool_id, asset_address ORDER BY rate_date) AS d_rate_group
  FROM joined_rates
)
-- Final select with forward-filled values
SELECT
  pool_id,
  asset_address,
  rate_date,
  -- Forward-fill b_rate: get the first non-null value in each group
  FIRST_VALUE(b_rate) OVER (
    PARTITION BY pool_id, asset_address, b_rate_group
    ORDER BY rate_date
  ) AS b_rate,
  -- Forward-fill d_rate: get the first non-null value in each group
  FIRST_VALUE(d_rate) OVER (
    PARTITION BY pool_id, asset_address, d_rate_group
    ORDER BY rate_date
  ) AS d_rate,
  COALESCE(b_rate_timestamp, d_rate_timestamp) AS rate_timestamp,
  COALESCE(b_ledger_sequence, d_ledger_sequence) AS ledger_sequence
FROM forward_fill_groups;

-- Create indexes for efficient lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_rates_lookup
  ON daily_rates(pool_id, asset_address, rate_date);

CREATE INDEX IF NOT EXISTS idx_daily_rates_date
  ON daily_rates(rate_date);

-- Comment for documentation
COMMENT ON MATERIALIZED VIEW daily_rates IS
  'Daily closing b_rate and d_rate derived from parsed_events with forward-fill. Refresh with: REFRESH MATERIALIZED VIEW CONCURRENTLY daily_rates;';
