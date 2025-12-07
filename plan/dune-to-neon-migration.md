# Migration Plan: Dune to Neon PostgreSQL

**Status: IMPLEMENTED** (2025-12-02)

## Overview

Replace Dune Analytics (Query 6245238) with direct queries to Neon PostgreSQL database using the new `parsed_events` table. This will give us full control over historical data, real-time updates, and new features like user action history.

---

## Current State

### Dune Provides:
- Historical balance snapshots (daily)
- Pre-computed b_rate and d_rate per day
- `total_cost_basis` (cumulative deposits in USD)
- `total_yield` (cumulative interest earned)
- Filtered by pool prefix (CAJJ, CCCC)

### What We Have in Neon:
**Table: `parsed_events`**
```
id, pool_id, transaction_hash, ledger_sequence, ledger_closed_at,
action_type, asset_address, user_address, amount_underlying,
amount_tokens, implied_rate
```

**Action types observed:**
- `supply`, `withdraw_collateral`, `repay` (with user_address, amounts, implied_rate)
- `claim` (different structure - no asset_address, no amounts except claim amount)

---

## Migration Tasks

### Phase 1: Database Schema Additions

#### 1.1 Create Daily B-Rate Materialized View/Table
Derive daily closing b_rate from `parsed_events`:

```sql
-- Option A: Materialized View (auto-refreshable)
CREATE MATERIALIZED VIEW daily_b_rates AS
SELECT DISTINCT ON (pool_id, asset_address, DATE(ledger_closed_at))
  pool_id,
  asset_address,
  DATE(ledger_closed_at) AS rate_date,
  implied_rate AS b_rate,
  ledger_closed_at AS rate_timestamp,
  ledger_sequence
FROM parsed_events
WHERE implied_rate IS NOT NULL
  AND action_type IN ('supply', 'withdraw_collateral', 'repay', 'borrow')
ORDER BY pool_id, asset_address, DATE(ledger_closed_at), ledger_closed_at DESC;

CREATE INDEX idx_daily_b_rates_lookup
ON daily_b_rates(pool_id, asset_address, rate_date);

-- Option B: Regular table populated by scheduled job
-- (better for gap-filling logic)
```

**Gap-filling strategy:**
When no events occur on a day, carry forward the previous day's rate:
```sql
-- Query with gap-fill using window functions
WITH date_series AS (
  SELECT generate_series(
    (SELECT MIN(DATE(ledger_closed_at)) FROM parsed_events),
    CURRENT_DATE,
    '1 day'::interval
  )::date AS rate_date
),
rates_with_gaps AS (
  SELECT DISTINCT ON (pool_id, asset_address, DATE(ledger_closed_at))
    pool_id, asset_address, DATE(ledger_closed_at) AS rate_date,
    implied_rate AS b_rate
  FROM parsed_events
  WHERE implied_rate IS NOT NULL
  ORDER BY pool_id, asset_address, DATE(ledger_closed_at), ledger_closed_at DESC
)
SELECT
  d.rate_date,
  r.pool_id,
  r.asset_address,
  COALESCE(r.b_rate, LAG(r.b_rate) OVER (
    PARTITION BY r.pool_id, r.asset_address
    ORDER BY d.rate_date
  )) AS b_rate
FROM date_series d
LEFT JOIN rates_with_gaps r ON r.rate_date = d.rate_date;
```

#### 1.2 Create Pool Dictionary Table
```sql
CREATE TABLE pools (
  pool_id VARCHAR(56) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  short_name VARCHAR(20),
  description TEXT,
  icon_url VARCHAR(500),
  website_url VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed data
INSERT INTO pools (pool_id, name, short_name) VALUES
('CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD', 'Blend Pool', 'Blend'),
('CCCCIQSDILITHMM7PBSLVDT5MISSY7R26MNZXCX4H7J5JQ5FPIYOGYFS', 'YieldBlox', 'YBX');
```

#### 1.3 Create Token Dictionary Table
```sql
CREATE TABLE tokens (
  asset_address VARCHAR(56) PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  name VARCHAR(100),
  decimals INTEGER DEFAULT 7,
  icon_url VARCHAR(500),
  coingecko_id VARCHAR(100),  -- for price feeds if needed
  is_native BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed data (examples)
INSERT INTO tokens (asset_address, symbol, name, decimals) VALUES
('CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75', 'USDC', 'USD Coin', 7),
('CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV', 'XLM', 'Stellar Lumens', 7),
('GBG4UDLPYDUBFNF5CQJPKPY3ZMYXA7QRMI53QIR5ZHYHTNYHS6GLKUKM', 'BLND', 'Blend Token', 7);
-- Add more tokens as discovered
```

#### 1.4 Create User Action History View
```sql
CREATE VIEW user_action_history AS
SELECT
  e.id,
  e.pool_id,
  p.name AS pool_name,
  e.transaction_hash,
  e.ledger_sequence,
  e.ledger_closed_at,
  e.action_type,
  e.asset_address,
  t.symbol AS asset_symbol,
  t.name AS asset_name,
  e.user_address,
  e.amount_underlying,
  e.amount_tokens,
  e.implied_rate
FROM parsed_events e
LEFT JOIN pools p ON e.pool_id = p.pool_id
LEFT JOIN tokens t ON e.asset_address = t.asset_address
ORDER BY e.ledger_closed_at DESC;
```

---

### Phase 2: Backend API Changes

#### 2.1 New Database Query Module
**File: `lib/db/client.ts`**
- Create database connection pool using `pg` or `@neondatabase/serverless`
- Add query helper functions

#### 2.2 Replace Dune Fetcher
**File: `lib/db/balance-history.ts`**
```typescript
interface BalanceHistoryParams {
  userAddress: string;
  assetAddress?: string;
  poolId?: string;
  days: number;
}

// Query flow:
// 1. Get user's events from parsed_events
// 2. Join with daily_b_rates to get rate for each day
// 3. Calculate running position (btokens) from events
// 4. Calculate balance = btokens × b_rate for each day
// 5. Calculate cost_basis from cumulative supplies/withdrawals
// 6. Calculate yield = balance - cost_basis
```

**Key Query:**
```sql
WITH user_events AS (
  SELECT
    DATE(ledger_closed_at) AS event_date,
    pool_id,
    asset_address,
    action_type,
    amount_underlying,
    amount_tokens,
    ledger_closed_at
  FROM parsed_events
  WHERE user_address = $1
    AND ($2::text IS NULL OR asset_address = $2)
    AND ledger_closed_at >= NOW() - INTERVAL '$3 days'
  ORDER BY ledger_closed_at
),
daily_positions AS (
  -- Calculate cumulative btoken position per day
  SELECT
    event_date,
    pool_id,
    asset_address,
    SUM(CASE
      WHEN action_type IN ('supply', 'deposit_collateral') THEN amount_tokens
      WHEN action_type IN ('withdraw', 'withdraw_collateral') THEN -amount_tokens
      ELSE 0
    END) OVER (
      PARTITION BY pool_id, asset_address
      ORDER BY event_date
    ) AS btokens,
    SUM(CASE
      WHEN action_type IN ('supply', 'deposit_collateral') THEN amount_underlying
      WHEN action_type IN ('withdraw', 'withdraw_collateral') THEN -amount_underlying
      ELSE 0
    END) OVER (
      PARTITION BY pool_id, asset_address
      ORDER BY event_date
    ) AS cost_basis_raw
  FROM user_events
)
SELECT
  dp.event_date AS snapshot_date,
  dp.pool_id,
  dp.asset_address,
  dp.btokens,
  r.b_rate,
  dp.btokens * r.b_rate AS balance,
  dp.cost_basis_raw AS cost_basis,
  (dp.btokens * r.b_rate) - dp.cost_basis_raw AS yield
FROM daily_positions dp
JOIN daily_b_rates r
  ON r.pool_id = dp.pool_id
  AND r.asset_address = dp.asset_address
  AND r.rate_date = dp.event_date;
```

#### 2.3 Update API Route
**File: `app/api/balance-history/route.ts`**
- Replace `fetchDuneQueryResults()` with new DB query
- Keep same response format for frontend compatibility
- Add fallback to Dune during transition (feature flag)

#### 2.4 New User Actions API
**File: `app/api/user-actions/route.ts`**
```typescript
// GET /api/user-actions?user={address}&limit={number}&offset={number}
// Returns: user's action history including claims
```

---

### Phase 3: Frontend Changes

#### 3.1 Update Types
**File: `types/user-actions.ts`**
```typescript
export interface UserAction {
  id: string;
  pool_id: string;
  pool_name: string;
  transaction_hash: string;
  ledger_closed_at: string;
  action_type: 'supply' | 'withdraw' | 'withdraw_collateral' |
               'borrow' | 'repay' | 'claim' | 'liquidate';
  asset_address: string | null;
  asset_symbol: string | null;
  amount_underlying: number | null;
  amount_tokens: number | null;
  implied_rate: number | null;
}
```

#### 3.2 New Hook for User Actions
**File: `hooks/use-user-actions.ts`**
```typescript
export function useUserActions(userAddress: string, limit = 50) {
  return useQuery({
    queryKey: ['user-actions', userAddress, limit],
    queryFn: () => fetchUserActions(userAddress, limit),
    enabled: !!userAddress,
    staleTime: 30 * 1000,
  });
}
```

#### 3.3 Token/Pool Metadata Hook
**File: `hooks/use-metadata.ts`**
```typescript
export function usePoolMetadata() { ... }
export function useTokenMetadata() { ... }
```

#### 3.4 New Transaction History Component
**File: `components/transaction-history.tsx`**
- Display user's action history
- Show: date, action type, asset, amount, pool
- Link to Stellar Explorer for transaction details
- Include claim events

---

### Phase 4: Data Integrity & Edge Cases

#### 4.1 Cost Basis Calculation
**Challenge:** Dune provides pre-computed `total_cost_basis`. We need to derive it.

**Solution:**
```sql
-- Cost basis = sum of all deposits - sum of all withdrawals (in underlying)
SELECT
  SUM(CASE
    WHEN action_type IN ('supply', 'deposit_collateral') THEN amount_underlying
    WHEN action_type IN ('withdraw', 'withdraw_collateral') THEN -amount_underlying
    ELSE 0
  END) AS cost_basis
FROM parsed_events
WHERE user_address = $1 AND asset_address = $2;
```

**Edge case:** User might have had positions before our data starts.
- Option A: Accept that old positions won't have full cost basis
- Option B: Query from earliest available data (might be incomplete)
- Option C: Flag accounts with incomplete history

#### 4.2 D-Rate (Debt Rate)
**Current state:** `parsed_events` has `implied_rate` which is b_rate.
**Issue:** For debt positions, we need d_rate.

**Options:**
1. Add d_rate to parsed_events if available from indexer
2. Calculate d_rate from borrow/repay events similarly
3. Use approximation: d_rate ≈ b_rate × (1 + spread) - needs spread data
4. Fetch current d_rate from Blend SDK for live, use b_rate for historical (current behavior)

**Recommendation:** Option 1 if possible, else Option 4 as fallback.

#### 4.3 Missing Days
**Problem:** If no events on a day, we need to interpolate.

**Solution:**
```typescript
// In backend, use generate_series to fill date gaps
// Carry forward last known position and apply that day's b_rate
```

#### 4.4 Claims Handling
**Observation:** Claim events have different structure:
```
action_type: 'claim'
asset_address: NULL (or BLND token address?)
user_address: GAIL...
amount_underlying: NULL
amount_tokens: NULL
(some numeric field): 40520423  -- this is the claim amount
```

**Questions to clarify:**
- Is claim amount in the `amount_underlying` or another field?
- What asset is being claimed? (Presumably BLND)
- Should claims be shown in balance history or just action history?

**Implementation:**
- Store claims in action history with special handling
- Don't include in balance calculations unless they're BLND positions

---

### Phase 5: Migration Steps

#### Step 1: Database Setup (Day 1)
1. Create `daily_b_rates` materialized view
2. Create `pools` table and seed data
3. Create `tokens` table and seed data
4. Create `user_action_history` view
5. Add required indexes

#### Step 2: Backend Implementation (Day 2-3)
1. Create `lib/db/client.ts`
2. Create `lib/db/balance-history.ts`
3. Create `lib/db/user-actions.ts`
4. Create `lib/db/metadata.ts`
5. Update `app/api/balance-history/route.ts` with feature flag
6. Create `app/api/user-actions/route.ts`
7. Create `app/api/metadata/route.ts`

#### Step 3: Frontend Implementation (Day 3-4)
1. Update types
2. Create new hooks
3. Create transaction history component
4. Update existing components to use metadata
5. Add pool/token icons where available

#### Step 4: Testing & Validation (Day 4-5)
1. Compare DB results with Dune results for same user/date range
2. Verify cost basis calculations match
3. Test edge cases (new users, inactive users, users with gaps)
4. Performance testing with larger datasets

#### Step 5: Cutover (Day 5)
1. Remove Dune feature flag
2. Remove Dune-related code
3. Update environment variables
4. Monitor for issues

---

## Dependencies & Considerations

### External Dependencies to Keep
1. **Blend SDK** - Still needed for:
   - Live position data
   - Current b_rate/d_rate
   - Oracle prices
   - APY calculations
   - BLND emissions

2. **Stellar SDK** - Still needed for:
   - Wallet operations
   - Network interactions

### Dependencies to Remove
1. **Dune API** - Fully replaced by database
   - Remove `DUNE_API_KEY` from env
   - Remove `lib/dune/client.ts`
   - Remove `lib/dune/transformer.ts`

### New Dependencies
1. **Database client** - `@neondatabase/serverless` or `pg`
2. **Connection pooling** - Built into Neon serverless

### Performance Considerations
1. **Materialized view refresh** - Run daily via cron/scheduled job
2. **Query complexity** - Position calculation queries can be heavy
   - Consider caching computed positions
   - Use pagination for large histories
3. **Connection limits** - Neon has connection limits, use pooling

### Data Freshness
| Data Type | Source | Freshness |
|-----------|--------|-----------|
| Live positions | Blend SDK | Real-time |
| Historical positions | Neon DB | Event-driven (near real-time) |
| B-rates | Neon DB | Event-driven or daily materialized |
| Prices | Blend Oracle | Real-time |
| Metadata | Neon DB | Manual updates |

---

## Open Questions

1. **D-rate availability:** Can the indexer add d_rate to parsed_events?

2. **Claim structure:** Confirm the exact structure of claim events:
   - Which field contains claim amount?
   - Is asset_address populated for claims?

3. **Historical data completeness:**
   - How far back does parsed_events go?
   - Are there any gaps in the data?

4. **Price history:**
   - Do we need historical prices for USD calculations?
   - Currently using live prices - is this acceptable?

5. **Backfill existing users:**
   - Do we need to compute cost_basis for existing users from the beginning?
   - Or accept some users may have incomplete history?

---

## Success Criteria

- [ ] Balance history matches Dune data within acceptable tolerance (< 0.1% difference)
- [ ] Page load time remains under 2 seconds
- [ ] Daily b_rate available for all pool/asset combinations
- [ ] User action history displays all event types including claims
- [ ] Pool and token names/icons display correctly
- [ ] No Dune API calls in production
- [ ] Feature parity with current implementation

---

## Risk Mitigation

1. **Data discrepancy** - Keep Dune as fallback during transition with feature flag
2. **Performance regression** - Add database indexes, use connection pooling
3. **Missing data** - Implement gap-filling logic, alert on anomalies
4. **Schema changes** - Use migrations, version the API

---

## File Changes Summary

### New Files
- `lib/db/client.ts`
- `lib/db/balance-history.ts`
- `lib/db/user-actions.ts`
- `lib/db/metadata.ts`
- `app/api/user-actions/route.ts`
- `app/api/metadata/route.ts`
- `hooks/use-user-actions.ts`
- `hooks/use-metadata.ts`
- `components/transaction-history.tsx`
- `types/user-actions.ts`

### Modified Files
- `app/api/balance-history/route.ts` - Switch from Dune to DB
- `lib/balance-history-utils.ts` - May need adjustments for new data shape
- `types/wallet-balance.ts` - Add any new fields

### Deleted Files (after cutover)
- `lib/dune/client.ts`
- `lib/dune/transformer.ts`

### Environment Changes
- Remove: `DUNE_API_KEY`
- Keep: `DATABASE_URL`
