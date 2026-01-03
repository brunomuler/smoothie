/**
 * Demo Wallet Configuration
 *
 * Helper functions for managing demo wallet addresses from environment variables.
 */

/**
 * Get demo wallet addresses from environment
 * @returns Array of valid Stellar public keys, or empty array if none configured
 */
export function getDemoWalletAddresses(): string[] {
  const addresses = process.env.NEXT_PUBLIC_DEMO_WALLET_ADDRESSES
  if (!addresses) return []

  return addresses
    .split(',')
    .map(addr => addr.trim())
    .filter(addr => addr.length > 0 && addr.startsWith('G'))
}

/**
 * Check if demo wallet feature is enabled
 */
export function isDemoWalletEnabled(): boolean {
  return getDemoWalletAddresses().length > 0
}

/**
 * Get a random demo wallet address
 */
export function getRandomDemoWallet(): string | null {
  const addresses = getDemoWalletAddresses()
  if (addresses.length === 0) return null

  const randomIndex = Math.floor(Math.random() * addresses.length)
  return addresses[randomIndex]
}
