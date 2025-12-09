-- Migration: Create pools dictionary table
-- Description: Stores pool metadata (name, icon, etc.)

CREATE TABLE IF NOT EXISTS pools (
  pool_id VARCHAR(56) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  short_name VARCHAR(20),
  description TEXT,
  icon_url VARCHAR(500),
  website_url VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for active pools lookup
CREATE INDEX IF NOT EXISTS idx_pools_active ON pools(is_active) WHERE is_active = true;

-- Seed initial pool data
INSERT INTO pools (pool_id, name, short_name, description, is_active) VALUES
  ('CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD', 'Blend Pool', 'Blend', 'Main Blend lending pool', true),
  ('CCCCIQSDILITHMM7PBSLVDT5MISSY7R26MNZXCX4H7J5JQ5FPIYOGYFS', 'YieldBlox', 'YBX', 'YieldBlox lending pool', true)
ON CONFLICT (pool_id) DO UPDATE SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  description = EXCLUDED.description,
  updated_at = NOW();
