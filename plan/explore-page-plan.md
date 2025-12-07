# Explore Page - Implementation Plan

## Overview

Create a new `/explore` page that provides aggregate analytics and filtering capabilities across all users in the database. This page will allow querying accounts based on deposit amounts, event counts, token balances, and time-based aggregations.

---

## Current Database Context

### Existing Tables/Views
- `parsed_events` - Raw event data (supply, withdraw, borrow, repay, etc.)
- `pools` - Pool metadata (YieldBlox, Blend Pool)
- `tokens` - Token metadata with `coingecko_id` for pricing
- `daily_rates` - Materialized view with b_rate/d_rate per day
- `user_action_history` - Materialized view joining events with metadata

### Key Event Types
- `supply`, `supply_collateral` (deposits)
- `withdraw`, `withdraw_collateral` (withdrawals)
- `borrow`, `repay`, `claim`, `liquidate`

### USD Conversion
- Currently uses `MockPriceService` with hardcoded prices (USDC: 1.0, XLM: 0.12, etc.)
- Real pricing integration ready via `coingecko_id` on tokens

---

## Feature Requirements

### 1. Filter Queries

| Query Type | Description | Parameters |
|------------|-------------|------------|
| Accounts by deposit amount | Accounts with more than X deposited in a token | `token`, `minAmount`, `inUsd: boolean` |
| Accounts by event count | Accounts with more than N deposit events | `token`, `minEventCount`, `eventTypes[]` |
| Accounts by balance | Accounts holding Y amount of a token | `token`, `minBalance`, `inUsd: boolean` |
| Top depositors by pool | Accounts ordered by highest deposit in a pool | `poolId`, `limit`, `orderBy` |

### 2. Aggregate Metrics

| Metric | Description |
|--------|-------------|
| Total deposits | Sum of all deposits in a time period |
| Total withdrawals | Sum of all withdrawals in a time period |
| Net flow | Deposits - Withdrawals per period |
| Active accounts | Unique accounts with activity in period |
| Top tokens by volume | Tokens ranked by deposit/withdrawal volume |

### 3. Display Requirements

- Show both **absolute balance** (native token amount) and **USD value**
- Allow filtering/sorting by either absolute or USD values
- Support time range selection (last 7 days, 30 days, 90 days, 1 year, all time)
- Paginated results for account lists

---

## Implementation Plan

### Phase 1: Database Layer

#### 1.1 Create Aggregate Query Functions

Create new repository file: `lib/db/explore-repository.ts`

```typescript
interface ExploreRepository {
  // Account queries
  getAccountsByMinDeposit(params: {
    assetAddress: string;
    minAmount: number;
    inUsd: boolean;
    limit: number;
    offset: number;
  }): Promise<AccountDepositResult[]>;

  getAccountsByEventCount(params: {
    assetAddress?: string;
    eventTypes: ActionType[];
    minCount: number;
    limit: number;
    offset: number;
  }): Promise<AccountEventCountResult[]>;

  getAccountsByBalance(params: {
    assetAddress: string;
    minBalance: number;
    inUsd: boolean;
    limit: number;
    offset: number;
  }): Promise<AccountBalanceResult[]>;

  getTopDepositorsByPool(params: {
    poolId: string;
    assetAddress?: string;
    limit: number;
  }): Promise<TopDepositorResult[]>;

  // Aggregate queries
  getAggregateMetrics(params: {
    startDate: Date;
    endDate: Date;
    poolId?: string;
    assetAddress?: string;
  }): Promise<AggregateMetrics>;

  getVolumeByToken(params: {
    startDate: Date;
    endDate: Date;
    limit: number;
  }): Promise<TokenVolumeResult[]>;
}
```

#### 1.2 Add Types

Add to `lib/db/types.ts` or create `types/explore.ts`:

```typescript
interface AccountDepositResult {
  userAddress: string;
  totalDeposited: number;      // In native token
  totalDepositedUsd: number;   // In USD
  depositCount: number;
  lastDepositDate: string;
}

interface AccountEventCountResult {
  userAddress: string;
  eventCount: number;
  eventTypes: Record<ActionType, number>;
  firstEventDate: string;
  lastEventDate: string;
}

interface AccountBalanceResult {
  userAddress: string;
  balance: number;             // Current balance in native token
  balanceUsd: number;          // Current balance in USD
  supplyBalance: number;
  collateralBalance: number;
  debtBalance: number;
  netBalance: number;
}

interface TopDepositorResult {
  userAddress: string;
  poolId: string;
  poolName: string;
  totalDeposited: number;
  totalDepositedUsd: number;
  rank: number;
}

interface AggregateMetrics {
  totalDeposits: number;
  totalDepositsUsd: number;
  totalWithdrawals: number;
  totalWithdrawalsUsd: number;
  netFlow: number;
  netFlowUsd: number;
  activeAccounts: number;
  totalEvents: number;
}

interface TokenVolumeResult {
  assetAddress: string;
  symbol: string;
  name: string;
  depositVolume: number;
  depositVolumeUsd: number;
  withdrawVolume: number;
  withdrawVolumeUsd: number;
  netVolume: number;
  netVolumeUsd: number;
}

interface ExploreFilters {
  query: 'deposits' | 'events' | 'balance' | 'top-depositors' | 'aggregates';
  assetAddress?: string;
  poolId?: string;
  minAmount?: number;
  minCount?: number;
  inUsd: boolean;
  eventTypes?: ActionType[];
  startDate?: string;
  endDate?: string;
  orderBy?: 'amount' | 'count' | 'date';
  orderDir?: 'asc' | 'desc';
  limit: number;
  offset: number;
}
```

#### 1.3 SQL Queries

Key queries to implement:

**Accounts by Total Deposit Amount:**
```sql
SELECT
  user_address,
  SUM(amount_underlying) / 1e7 as total_deposited,
  SUM(amount_underlying) / 1e7 * :price as total_deposited_usd,
  COUNT(*) as deposit_count,
  MAX(ledger_closed_at) as last_deposit_date
FROM user_action_history
WHERE asset_address = :assetAddress
  AND action_type IN ('supply', 'supply_collateral')
GROUP BY user_address
HAVING SUM(amount_underlying) / 1e7 >= :minAmount
ORDER BY total_deposited DESC
LIMIT :limit OFFSET :offset
```

**Accounts by Event Count:**
```sql
SELECT
  user_address,
  COUNT(*) as event_count,
  jsonb_object_agg(action_type, type_count) as event_types,
  MIN(ledger_closed_at) as first_event_date,
  MAX(ledger_closed_at) as last_event_date
FROM (
  SELECT user_address, action_type, COUNT(*) as type_count
  FROM user_action_history
  WHERE (:assetAddress IS NULL OR asset_address = :assetAddress)
    AND action_type = ANY(:eventTypes)
  GROUP BY user_address, action_type
) sub
GROUP BY user_address
HAVING COUNT(*) >= :minCount
ORDER BY event_count DESC
```

**Current Balances (requires computing from events):**
```sql
WITH current_positions AS (
  SELECT
    user_address,
    pool_id,
    asset_address,
    SUM(CASE WHEN action_type = 'supply' THEN amount_tokens ELSE 0 END) -
    SUM(CASE WHEN action_type = 'withdraw' THEN amount_tokens ELSE 0 END) as supply_btokens,
    SUM(CASE WHEN action_type = 'supply_collateral' THEN amount_tokens ELSE 0 END) -
    SUM(CASE WHEN action_type = 'withdraw_collateral' THEN amount_tokens ELSE 0 END) as collateral_btokens,
    SUM(CASE WHEN action_type = 'borrow' THEN amount_tokens ELSE 0 END) -
    SUM(CASE WHEN action_type = 'repay' THEN amount_tokens ELSE 0 END) as debt_dtokens
  FROM user_action_history
  WHERE asset_address = :assetAddress
  GROUP BY user_address, pool_id, asset_address
),
latest_rates AS (
  SELECT DISTINCT ON (pool_id, asset_address)
    pool_id, asset_address, b_rate, d_rate
  FROM daily_rates
  WHERE asset_address = :assetAddress
  ORDER BY pool_id, asset_address, rate_date DESC
)
SELECT
  p.user_address,
  SUM(p.supply_btokens * r.b_rate / 1e7) as supply_balance,
  SUM(p.collateral_btokens * r.b_rate / 1e7) as collateral_balance,
  SUM(p.debt_dtokens * r.d_rate / 1e7) as debt_balance,
  SUM((p.supply_btokens + p.collateral_btokens) * r.b_rate / 1e7 - p.debt_dtokens * r.d_rate / 1e7) as net_balance
FROM current_positions p
JOIN latest_rates r ON p.pool_id = r.pool_id AND p.asset_address = r.asset_address
GROUP BY p.user_address
HAVING SUM((p.supply_btokens + p.collateral_btokens) * r.b_rate / 1e7) >= :minBalance
ORDER BY net_balance DESC
```

**Aggregate Metrics by Time Range:**
```sql
SELECT
  SUM(CASE WHEN action_type IN ('supply', 'supply_collateral')
      THEN amount_underlying / 1e7 ELSE 0 END) as total_deposits,
  SUM(CASE WHEN action_type IN ('withdraw', 'withdraw_collateral')
      THEN amount_underlying / 1e7 ELSE 0 END) as total_withdrawals,
  COUNT(DISTINCT user_address) as active_accounts,
  COUNT(*) as total_events
FROM user_action_history
WHERE ledger_closed_at >= :startDate
  AND ledger_closed_at < :endDate
  AND (:poolId IS NULL OR pool_id = :poolId)
  AND (:assetAddress IS NULL OR asset_address = :assetAddress)
```

---

### Phase 2: API Layer

#### 2.1 Create Explore API Endpoint

Create `app/api/explore/route.ts`:

```typescript
// GET /api/explore?query=deposits&asset=...&minAmount=...&inUsd=true&limit=50&offset=0
// GET /api/explore?query=events&asset=...&eventTypes=supply,borrow&minCount=3
// GET /api/explore?query=balance&asset=...&minBalance=100
// GET /api/explore?query=top-depositors&pool=...&limit=20
// GET /api/explore?query=aggregates&startDate=...&endDate=...
```

Response structure:
```typescript
{
  query: string;
  filters: ExploreFilters;
  count: number;
  results: AccountDepositResult[] | AccountEventCountResult[] | ... ;
  aggregates?: AggregateMetrics;  // Always included for context
}
```

#### 2.2 Create Token Prices Endpoint (if not exists)

Create `app/api/prices/route.ts`:

```typescript
// GET /api/prices?assets=asset1,asset2
// Returns current USD prices for requested assets
{
  prices: {
    [assetAddress: string]: {
      usd: number;
      source: 'coingecko' | 'mock';
      timestamp: string;
    }
  }
}
```

---

### Phase 3: Frontend Components

#### 3.1 Page Structure

Create `app/explore/page.tsx`:

```
/explore
├── Header with title and description
├── Quick Stats Cards (total deposits, active accounts, etc.)
├── Filter Panel
│   ├── Query Type Selector (tabs)
│   ├── Token/Pool Selector (dropdown)
│   ├── Amount/Count Input
│   ├── USD Toggle
│   ├── Date Range Picker
│   └── Apply Filters Button
├── Results Section
│   ├── Results Count & Export Button
│   ├── Sort Controls
│   └── Results Table/Cards
└── Pagination
```

#### 3.2 Components to Create

| Component | File | Description |
|-----------|------|-------------|
| ExplorePage | `app/explore/page.tsx` | Main page component |
| ExploreFilters | `components/explore/explore-filters.tsx` | Filter panel with all controls |
| ExploreResults | `components/explore/explore-results.tsx` | Results display (table/cards) |
| AccountRow | `components/explore/account-row.tsx` | Single account result row |
| AggregateCards | `components/explore/aggregate-cards.tsx` | Quick stats cards |
| AmountDisplay | `components/explore/amount-display.tsx` | Shows both native + USD |
| DateRangePicker | `components/explore/date-range-picker.tsx` | Time period selector |

#### 3.3 Hooks

Create `hooks/use-explore.ts`:

```typescript
function useExplore(filters: ExploreFilters) {
  // Fetches explore data based on filters
  // Handles loading, error, pagination
  // Returns { data, loading, error, refetch }
}
```

Create `hooks/use-prices.ts`:

```typescript
function usePrices(assetAddresses: string[]) {
  // Fetches current prices for given assets
  // Caches prices for session
  // Returns { prices, loading }
}
```

#### 3.4 UI Requirements

**Filter Panel:**
- Query type tabs: "By Deposits" | "By Events" | "By Balance" | "Top Depositors" | "Aggregates"
- Token dropdown with search (populated from `/api/metadata?type=tokens`)
- Pool dropdown (populated from `/api/metadata?type=pools`)
- Numeric input for amount/count threshold
- Toggle: "Filter by USD value" / "Filter by token amount"
- Event type multi-select (for event count query)
- Date range: preset buttons (7d, 30d, 90d, 1y, all) + custom picker
- "Apply" and "Reset" buttons

**Results Table:**
- Columns vary by query type
- Always show: Address (truncated with copy), Absolute Amount, USD Value
- Sortable columns
- Row click expands to show more details
- Export to CSV button

**Amount Display:**
- Primary: formatted number with token symbol (e.g., "1,234.56 USDC")
- Secondary: USD value in muted text (e.g., "$1,234.56")
- When filtering by USD, flip the display order

---

### Phase 4: Navigation & Polish

#### 4.1 Add Navigation

Update navigation to include Explore page link.

#### 4.2 Loading States

- Skeleton loaders for all data areas
- Disable filters while loading
- Show "No results" state when empty

#### 4.3 Error Handling

- Display error messages for API failures
- Retry button for failed requests
- Validate filter inputs before API call

---

## File Structure

```
smoothie/
├── app/
│   ├── explore/
│   │   └── page.tsx              # Explore page
│   └── api/
│       ├── explore/
│       │   └── route.ts          # Explore API endpoint
│       └── prices/
│           └── route.ts          # Prices API endpoint
├── components/
│   └── explore/
│       ├── explore-filters.tsx   # Filter panel
│       ├── explore-results.tsx   # Results table
│       ├── account-row.tsx       # Account result row
│       ├── aggregate-cards.tsx   # Stats cards
│       ├── amount-display.tsx    # Dual amount display
│       └── date-range-picker.tsx # Date selection
├── hooks/
│   ├── use-explore.ts            # Explore data hook
│   └── use-prices.ts             # Prices hook
├── lib/
│   └── db/
│       └── explore-repository.ts # Database queries
└── types/
    └── explore.ts                # Explore-specific types
```

---

## Implementation Order

1. **Types** - Define all interfaces in `types/explore.ts`
2. **Repository** - Implement `explore-repository.ts` with SQL queries
3. **API Endpoint** - Create `/api/explore` route
4. **Prices API** - Create `/api/prices` route (if needed)
5. **Hooks** - Implement `use-explore.ts` and `use-prices.ts`
6. **Components** - Build UI components bottom-up:
   - `amount-display.tsx`
   - `account-row.tsx`
   - `aggregate-cards.tsx`
   - `date-range-picker.tsx`
   - `explore-filters.tsx`
   - `explore-results.tsx`
7. **Page** - Assemble `app/explore/page.tsx`
8. **Navigation** - Add link to explore page
9. **Testing & Polish** - Test all filter combinations, add loading/error states

---

## Open Questions

1. **Real-time prices**: Should we integrate CoinGecko for live prices, or continue with mock prices for now?
2. **Export functionality**: CSV export for results - include in initial scope?
3. **Address linking**: Should clicking an address navigate to a user-specific page?
4. **Caching**: How aggressively should we cache explore results? (They can be expensive queries)
5. **Rate limiting**: Should we add rate limiting to the explore API to prevent abuse?

---

## Dependencies

### New shadcn Components Needed
- `DatePicker` or `Calendar` for date range selection
- `MultiSelect` for event type selection (may need custom implementation)

### Existing Components to Reuse
- `Card`, `Table`, `Tabs`, `Select`, `Input`, `Button`
- `Badge` for event types
- `Skeleton` for loading states
- `Tooltip` for help text

---

## Estimated Complexity

| Phase | Complexity | Notes |
|-------|------------|-------|
| Phase 1 (Database) | Medium-High | Complex SQL queries, need to handle USD conversion |
| Phase 2 (API) | Medium | Standard Next.js API routes with validation |
| Phase 3 (Frontend) | High | Multiple filter combinations, responsive design |
| Phase 4 (Polish) | Low-Medium | Loading states, error handling, navigation |

---

## Success Criteria

- [ ] Can filter accounts by minimum deposit amount (both token and USD)
- [ ] Can filter accounts by event count with specific event types
- [ ] Can filter accounts by current balance (both token and USD)
- [ ] Can view top depositors per pool
- [ ] Can view aggregate metrics for any time period
- [ ] Results show both absolute values and USD conversions
- [ ] Filters can be combined and applied efficiently
- [ ] Page is responsive and handles loading/error states gracefully
