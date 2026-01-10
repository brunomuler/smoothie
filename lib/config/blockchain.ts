/**
 * Blockchain Configuration
 * Token addresses and blockchain-related constants
 */

// Stellar token addresses
export const TOKENS = {
  LP: {
    address: 'CAS3FL6TLZKDGGSISDBWGGPXT3NRR4DYTZD7YOD3HMYO6LTJUVGRVEAM',
    symbol: 'BLND-USDC LP',
    decimals: 7,
  },
  BLND: {
    address: 'CD25MNVTZDL4Y3XBCPCJXGXATV5WUHHOWMYFF4YBEGU5FCPGMYTVG5JY',
    symbol: 'BLND',
    decimals: 7,
  },
} as const

// Convenience exports for backwards compatibility
export const LP_TOKEN_ADDRESS = TOKENS.LP.address
export const BLND_TOKEN_ADDRESS = TOKENS.BLND.address

// Conversion constants
export const STROOPS_PER_UNIT = 1e7

// Storage keys
export const STORAGE_KEYS = {
  TRACKED_WALLETS: 'stellar-wallet-tracked-addresses',
  ACTIVE_WALLET: 'stellar-wallet-active-id',
  WALLET_CUSTOM_NAMES: 'stellar-wallet-custom-names',
  WALLET_AVATAR_CUSTOMIZATIONS: 'stellar-wallet-avatar-customizations',
} as const

// Backwards compatibility exports
export const WALLETS_STORAGE_KEY = STORAGE_KEYS.TRACKED_WALLETS
export const ACTIVE_WALLET_STORAGE_KEY = STORAGE_KEYS.ACTIVE_WALLET
export const WALLET_CUSTOM_NAMES_KEY = STORAGE_KEYS.WALLET_CUSTOM_NAMES
export const WALLET_AVATAR_CUSTOMIZATIONS_KEY = STORAGE_KEYS.WALLET_AVATAR_CUSTOMIZATIONS
