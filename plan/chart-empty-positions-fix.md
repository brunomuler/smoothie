# Plan: Show Chart Data for Closed Positions

## Problem

When a tracked address has no current positions but has historical events (deposits, withdrawals, claims, etc.), the chart shows nothing. The chart should display historical data even when the current position is zero.

**Root Cause**: In [events-repository.ts:253-254](lib/db/events-repository.ts#L253-L254), the SQL query filters out zero positions:
```sql
-- Only include dates where we have a position
WHERE pos.pool_id IS NOT NULL
```

This excludes all dates after a full withdrawal, even though historical events exist.

## Analysis

### Why Current Code Fails

1. `daily_positions` CTE computes cumulative position from events (supply - withdraw)
2. When user withdraws fully, their final position = 0
3. For dates **after** the last event, the LEFT JOIN returns NULL (no events on those dates)
4. `WHERE pos.pool_id IS NOT NULL` filters out these NULL rows
5. Result: No data for dates after the last transaction

### Frontend Already Handles Zero Values

Verified that UI components handle zero positions correctly:
- [balance-history-chart.tsx:95-108](components/balance-history-chart.tsx#L95-L108): Shows "No balance history available" only if `chartData.length === 0`
- [balance-history-utils.ts:23-25](lib/balance-history-utils.ts#L23-L25): Returns empty array only if no records at all

So the issue is purely in the SQL query - once we return data, the UI will render it.

## Solution

### Single Change Required

**File**: [lib/db/events-repository.ts](lib/db/events-repository.ts)
**Lines**: 253-254

Remove these 2 lines:
```sql
-- Only include dates where we have a position
WHERE pos.pool_id IS NOT NULL
```

The LEFT JOIN already COALESCEs NULL values to 0 (lines 223-230):
```sql
COALESCE(pos.supply_btokens, 0) AS supply_btokens,
COALESCE(pos.collateral_btokens, 0) AS collateral_btokens,
...
```

This means zero positions are already handled - the filter just needs to be removed.

## Implementation Steps

1. Remove lines 253-254 from `events-repository.ts`
2. Test with the wallet from the screenshot (has history, no current position)
3. Verify chart shows historical data that ends at $0

## Testing Scenarios

| Scenario | Expected Result |
|----------|-----------------|
| Closed position (issue) | Chart shows history ending at 0 |
| Active position | Chart works as before (regression test) |
| No events ever | Empty state (user_pools CTE returns empty, so no rows generated) |

## Files to Modify

1. **lib/db/events-repository.ts** - Remove WHERE filter (lines 253-254)

No frontend changes needed.
