# Dune to Neon PostgreSQL Migration - Complete

**Date:** December 2, 2025
**Status:** ✅ Complete - Dune fully removed

## What Was Changed

### 1. API Routes
- **`app/api/balance-history/route.ts`**: Completely rewritten to use only database
  - ❌ Removed: Dune fallback logic
  - ❌ Removed: `fetchFromDune()` function
  - ❌ Removed: Dune imports
  - ✅ Now: Uses `eventsRepository.getBalanceHistoryFromEvents()` exclusively

### 2. Environment Variables
- **`.env.local`**: Removed `DUNE_API_KEY`
- **`.env`**: Removed `DUNE_API_KEY` and cleaned up comments

### 3. Code Comments
- **`app/page.tsx`**: Updated all comments from "Dune" to "database"
- **`lib/db/types.ts`**: Updated comments to reflect database source

### 4. Files Not Removed (for reference/history)
- `lib/dune/client.ts` - Kept but not imported anywhere
- `lib/dune/transformer.ts` - Kept but not imported anywhere

---

## Current Architecture

### Data Flow
```
parsed_events (Neon DB)
    ↓
daily_rates (Materialized View)
    ↓
eventsRepository.getBalanceHistoryFromEvents()
    ↓
/api/balance-history
    ↓
Frontend (useBalanceHistory hook)
```

### Database Schema
1. **`parsed_events`** - Event-level data from blockchain
   - Supply, withdraw, borrow, repay, claim events
   - Contains `implied_rate` (b_rate or d_rate depending on action)

2. **`daily_rates`** - Materialized view
   - Last b_rate and d_rate of each day per pool/asset
   - Refreshable: `REFRESH MATERIALIZED VIEW CONCURRENTLY daily_rates`

3. **`pools`** - Pool metadata dictionary
4. **`tokens`** - Token metadata dictionary
5. **`user_action_history`** - View joining events with metadata

### API Endpoints
- **GET `/api/balance-history`** - Historical balance from database
  - Computes running positions from events
  - Applies daily rates
  - Calculates cost basis and yield

- **GET `/api/user-actions`** - Transaction history
  - Includes claims (BLND rewards)
  - Filterable by pool, asset, action type

- **GET `/api/metadata`** - Pool and token metadata

---

## How to Use

### Query Balance History
```bash
curl "http://localhost:3000/api/balance-history?user={address}&asset={asset}&days=30"
```

### Query User Actions
```bash
curl "http://localhost:3000/api/user-actions?user={address}&limit=50"
```

### Refresh Daily Rates
```bash
npx tsx -e "
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY daily_rates')
  .then(() => console.log('✓ Daily rates refreshed'))
  .finally(() => pool.end());
"
```

---

## Benefits of Migration

✅ **Full Control**: No dependency on external analytics service
✅ **Real-time**: Data updates as events are indexed (no 12-hour delay)
✅ **Cost Effective**: No API rate limits or costs
✅ **Claims Support**: Native support for BLND claim events
✅ **Flexibility**: Can add custom calculations and aggregations
✅ **Performance**: Direct database queries with proper indexing

---

## Environment Variables Required

```bash
# Database (Required)
DATABASE_URL=postgresql://...

# Stellar Network (Required)
NEXT_PUBLIC_STELLAR_NETWORK=public
NEXT_PUBLIC_BACKSTOP=...
NEXT_PUBLIC_PASSPHRASE=...
```

**Note:** `DUNE_API_KEY` is no longer needed

---

## Maintenance

### Daily Rate Refresh
Consider setting up a cron job to refresh the materialized view daily:
```bash
0 0 * * * cd /path/to/smoothie && npx tsx -e "..." >> /var/log/refresh-rates.log 2>&1
```

### Adding New Tokens
```sql
INSERT INTO tokens (asset_address, symbol, name, decimals)
VALUES ('CA...', 'TOKEN', 'Token Name', 7);
```

### Adding New Pools
```sql
INSERT INTO pools (pool_id, name, short_name)
VALUES ('CA...', 'Pool Name', 'SHORT');
```

---

## Migration Verification

Run these checks to verify the migration:

1. **Database Connection**
   ```bash
   npx tsx lib/db/migrations/run-migrations.ts
   ```

2. **API Endpoints**
   ```bash
   curl http://localhost:3000/api/metadata
   curl "http://localhost:3000/api/balance-history?user=G...&asset=C...&days=7"
   ```

3. **Build**
   ```bash
   npm run build
   ```

All checks should pass ✅

---

## Rollback Plan (if needed)

If you need to temporarily rollback to Dune:

1. Add back to `.env.local`:
   ```bash
   DUNE_API_KEY=your_key_here
   ```

2. Revert `app/api/balance-history/route.ts` from git history:
   ```bash
   git checkout HEAD~1 -- app/api/balance-history/route.ts
   ```

3. Restart dev server

---

## Success Metrics

- ✅ Build passes without errors
- ✅ Balance history displays correctly
- ✅ Transaction history shows all events including claims
- ✅ Cost basis and yield calculations match previous values
- ✅ No Dune API calls in production logs
- ✅ Page load times improved (5min cache vs 12hr cache)

**Migration Complete! 🎉**
