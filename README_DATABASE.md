# Database Setup

Smoothie uses PostgreSQL to store balance history data. The database is optional - the app works without it, but balance history charts won't be available.

## Configuration

Set the `DATABASE_URL` environment variable:

```bash
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
```

## Schema

Smoothie reads from these tables:

### `user_positions`

Daily snapshots of user positions per pool/asset.

```sql
CREATE TABLE user_positions (
  id SERIAL PRIMARY KEY,
  user_address VARCHAR(56) NOT NULL,
  pool_id VARCHAR(56) NOT NULL,
  asset_id VARCHAR(56) NOT NULL,
  b_tokens NUMERIC,
  d_tokens NUMERIC,
  collateral NUMERIC,
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_positions_lookup
  ON user_positions(user_address, asset_id, snapshot_date);
```

### `pool_snapshots`

Daily pool rates for converting tokens to values.

```sql
CREATE TABLE pool_snapshots (
  id SERIAL PRIMARY KEY,
  pool_id VARCHAR(56) NOT NULL,
  asset_id VARCHAR(56) NOT NULL,
  b_rate NUMERIC,
  d_rate NUMERIC,
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_pool_snapshots_lookup
  ON pool_snapshots(pool_id, asset_id, snapshot_date);
```

## Data Population

These tables need to be populated by a separate backfill process that fetches historical position data from Stellar/Blend and stores daily snapshots. Smoothie only reads from these tables.

## API

`GET /api/balance-history?user={address}&asset={address}&days={number}`

Returns balance history for charts.
