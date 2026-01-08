/**
 * Demo Wallet Configuration (Client-Side)
 *
 * Functions for fetching demo wallet info from the API.
 * Real addresses are never exposed to the client - only aliases.
 */

export interface DemoWalletInfo {
  id: string
  name: string
}

interface DemoWalletsApiResponse {
  wallets: DemoWalletInfo[]
  randomAlias: string | null
  enabled: boolean
}

// Cache for demo wallet data
let cachedDemoWallets: DemoWalletsApiResponse | null = null
let fetchPromise: Promise<DemoWalletsApiResponse> | null = null

/**
 * Fetch demo wallets from the API
 * Results are cached to avoid repeated API calls
 */
export async function fetchDemoWallets(): Promise<DemoWalletsApiResponse> {
  // Return cached data if available
  if (cachedDemoWallets) {
    return cachedDemoWallets
  }

  // If a fetch is already in progress, wait for it
  if (fetchPromise) {
    return fetchPromise
  }

  // Start a new fetch
  fetchPromise = fetch('/api/demo-wallets')
    .then(async (res) => {
      if (!res.ok) {
        throw new Error('Failed to fetch demo wallets')
      }
      const data = await res.json() as DemoWalletsApiResponse
      cachedDemoWallets = data
      return data
    })
    .catch((error) => {
      console.error('Error fetching demo wallets:', error)
      // Return empty response on error
      return { wallets: [], randomAlias: null, enabled: false }
    })
    .finally(() => {
      fetchPromise = null
    })

  return fetchPromise
}

/**
 * Get a random demo wallet alias
 * Must be called after fetchDemoWallets() has resolved
 */
export async function getRandomDemoWalletAlias(): Promise<string | null> {
  const data = await fetchDemoWallets()
  return data.randomAlias
}

/**
 * Check if demo wallet feature is enabled
 * Must be called after fetchDemoWallets() has resolved
 */
export async function isDemoWalletEnabled(): Promise<boolean> {
  const data = await fetchDemoWallets()
  return data.enabled
}

/**
 * Get list of available demo wallets (aliases and names only)
 */
export async function getDemoWalletList(): Promise<DemoWalletInfo[]> {
  const data = await fetchDemoWallets()
  return data.wallets
}

/**
 * Check if cached demo wallet data indicates feature is enabled
 * This is synchronous and only works if data has been fetched
 * Returns false if data hasn't been fetched yet
 */
export function isDemoWalletEnabledSync(): boolean {
  return cachedDemoWallets?.enabled ?? false
}

/**
 * Get cached random demo wallet alias (synchronous)
 * Only works if fetchDemoWallets has been called
 */
export function getRandomDemoWalletAliasSync(): string | null {
  return cachedDemoWallets?.randomAlias ?? null
}

/**
 * Clear the demo wallet cache (useful for testing)
 */
export function clearDemoWalletCache(): void {
  cachedDemoWallets = null
  fetchPromise = null
}
