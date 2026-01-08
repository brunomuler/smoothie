/**
 * Server-Only Demo Wallet Configuration
 *
 * This file contains the mapping between demo wallet aliases and real addresses.
 * It should ONLY be imported in server-side code (API routes, server components).
 *
 * The real wallet addresses are never exposed to the client.
 */

export interface DemoWallet {
  address: string
  name: string
}

type DemoWalletMap = Record<string, DemoWallet>

/**
 * Parse demo wallet configuration from environment variable
 * Format: demo-1:ADDRESS:Name,demo-2:ADDRESS:Name,...
 */
function parseDemoWalletConfig(): DemoWalletMap {
  const config = process.env.DEMO_WALLET_CONFIG
  if (!config) return {}

  const wallets: DemoWalletMap = {}

  config.split(',').forEach((entry, index) => {
    const trimmed = entry.trim()
    if (!trimmed) return

    const parts = trimmed.split(':')
    if (parts.length >= 2) {
      const alias = parts[0].trim()
      const address = parts[1].trim()
      const name = parts[2]?.trim() || `Demo Wallet ${index + 1}`

      if (alias && address.startsWith('G')) {
        wallets[alias] = { address, name }
      }
    }
  })

  return wallets
}

// Cache the parsed config
let cachedConfig: DemoWalletMap | null = null

function getDemoWalletConfig(): DemoWalletMap {
  if (cachedConfig === null) {
    cachedConfig = parseDemoWalletConfig()
  }
  return cachedConfig
}

/**
 * Get the real wallet address for a demo alias
 * @param alias - The demo wallet alias (e.g., "demo-1")
 * @returns The real Stellar address, or null if not found
 */
export function getDemoWalletByAlias(alias: string): string | null {
  const config = getDemoWalletConfig()
  return config[alias]?.address || null
}

/**
 * Get the list of available demo wallets (without exposing addresses)
 * @returns Array of {id, name} for each demo wallet
 */
export function getDemoWalletList(): Array<{ id: string; name: string }> {
  const config = getDemoWalletConfig()
  return Object.entries(config).map(([id, wallet]) => ({
    id,
    name: wallet.name,
  }))
}

/**
 * Check if a string is a valid demo wallet alias
 */
export function isValidDemoAlias(alias: string): boolean {
  const config = getDemoWalletConfig()
  return alias in config
}

/**
 * Check if demo wallets are configured
 */
export function isDemoWalletConfigured(): boolean {
  const config = getDemoWalletConfig()
  return Object.keys(config).length > 0
}

/**
 * Get a random demo wallet alias
 * @returns A random demo wallet alias, or null if none configured
 */
export function getRandomDemoWalletAlias(): string | null {
  const config = getDemoWalletConfig()
  const aliases = Object.keys(config)
  if (aliases.length === 0) return null

  const randomIndex = Math.floor(Math.random() * aliases.length)
  return aliases[randomIndex]
}
