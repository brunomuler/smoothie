/**
 * Pool Configuration
 * Pool metadata, names, colors, and display settings
 */

export interface PoolConfig {
  name: string
  color: string
  icon?: string
}

export const POOLS: Record<string, PoolConfig> = {
  'CCCCIQSDILITHMM7PBSLVDT5MISSY7R26MNZXCX4H7J5JQ5FPIYOGYFS': {
    name: 'YieldBlox',
    color: '#9333ea', // Purple
    icon: 'yieldblox',
  },
  'CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD': {
    name: 'Fixed',
    color: '#0ea5e9', // Cyan
    icon: 'fixed',
  },
  'CAE7QVOMBLZ53CDRGK3UNRRHG5EZ5NQA7HHTFASEMYBWHG6MDFZTYHXC': {
    name: 'Orbit',
    color: '#f97316', // Orange
    icon: 'orbit',
  },
  'CDMAVJPFXPADND3YRL4BSM3AKZWCTFMX27GLLXCML3PD62HEQS5FPVAI': {
    name: 'Etherfuse',
    color: '#22c55e', // Green
    icon: 'etherfuse',
  },
  'CBYOBT7ZCCLQCBUYYIABZLSEGDPEUWXCUXQTZYOG3YBDR7U357D5ZIRF': {
    name: 'Forex',
    color: '#eab308', // Yellow
    icon: 'forex',
  },
} as const

// Helper functions
export function getPoolName(poolId: string): string {
  return POOLS[poolId]?.name ?? poolId.slice(0, 8)
}

export function getPoolColor(poolId: string): string {
  return POOLS[poolId]?.color ?? '#6b7280' // Default gray
}

// Backwards compatibility exports (maps)
export const POOL_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(POOLS).map(([id, config]) => [id, config.name])
)

export const POOL_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(POOLS).map(([id, config]) => [id, config.color])
)
