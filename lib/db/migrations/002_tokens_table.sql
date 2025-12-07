-- Migration: Create tokens dictionary table
-- Description: Stores token metadata (symbol, decimals, icon, etc.)

CREATE TABLE IF NOT EXISTS tokens (
  asset_address VARCHAR(56) PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  name VARCHAR(100),
  decimals INTEGER DEFAULT 7,
  icon_url VARCHAR(500),
  coingecko_id VARCHAR(100),
  is_native BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for symbol lookup
CREATE INDEX IF NOT EXISTS idx_tokens_symbol ON tokens(symbol);

-- Seed initial token data (common Stellar assets)
INSERT INTO tokens (asset_address, symbol, name, decimals, is_native) VALUES
  ('CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75', 'USDC', 'USD Coin', 7, false),
  ('CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV', 'XLM', 'Stellar Lumens', 7, true),
  ('CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA', 'BLND', 'Blend Token', 7, false),
  ('CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC', 'XRP', 'Ripple', 7, false)
ON CONFLICT (asset_address) DO UPDATE SET
  symbol = EXCLUDED.symbol,
  name = EXCLUDED.name,
  decimals = EXCLUDED.decimals,
  updated_at = NOW();
