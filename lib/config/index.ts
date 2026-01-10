/**
 * Application Configuration
 *
 * Centralized configuration for the application.
 * Import from '@/lib/config' to access all configuration.
 */

// Blockchain configuration
export {
  TOKENS,
  LP_TOKEN_ADDRESS,
  BLND_TOKEN_ADDRESS,
  STROOPS_PER_UNIT,
  STORAGE_KEYS,
  WALLETS_STORAGE_KEY,
  ACTIVE_WALLET_STORAGE_KEY,
  WALLET_CUSTOM_NAMES_KEY,
  WALLET_AVATAR_CUSTOMIZATIONS_KEY,
} from './blockchain'

// Pool configuration
export {
  POOLS,
  POOL_NAMES,
  POOL_COLORS,
  getPoolName,
  getPoolColor,
  type PoolConfig,
} from './pools'

// Timing configuration
export {
  CACHE_DURATIONS,
  STALE_TIMES,
  REFRESH_INTERVALS,
  TIMEOUTS,
} from './timing'
