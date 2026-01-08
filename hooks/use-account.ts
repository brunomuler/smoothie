import { useQuery } from "@tanstack/react-query";
import { getHorizonServer } from "@/lib/stellar/horizon";
import type { Horizon } from "@stellar/stellar-sdk";
import { fetchWithTimeout } from "@/lib/fetch-utils";

// Helper to check if a wallet is a demo wallet (by alias format)
function isDemoWallet(publicKey: string | undefined): boolean {
  return !!publicKey && publicKey.startsWith('demo-')
}

// Account response from our API (simplified version)
interface AccountApiResponse {
  exists: boolean
  id?: string
  sequence?: string
  balances?: Array<{
    asset_type: string
    asset_code?: string
    asset_issuer?: string
    balance: string
  }>
  subentry_count?: number
  num_sponsoring?: number
  num_sponsored?: number
}

// Fetch account from backend API (for demo wallets - keeps addresses server-side)
async function fetchAccountFromApi(walletAlias: string): Promise<AccountApiResponse | null> {
  const response = await fetchWithTimeout(`/api/account?user=${encodeURIComponent(walletAlias)}`)
  if (!response.ok) {
    throw new Error('Failed to fetch account')
  }
  const data = await response.json()
  return data.exists ? data : null
}

export function useAccount(publicKey: string | undefined) {
  const isDemo = isDemoWallet(publicKey)

  return useQuery({
    queryKey: ["account", publicKey],
    queryFn: async (): Promise<Horizon.AccountResponse | AccountApiResponse | null> => {
      if (!publicKey) return null;

      // Demo wallet: fetch from backend API (address resolution happens server-side)
      if (isDemo) {
        return fetchAccountFromApi(publicKey)
      }

      // Regular wallet: call Horizon SDK directly
      try {
        const server = getHorizonServer();
        const account = await server.loadAccount(publicKey);
        return account;
      } catch (error: unknown) {
        // Account doesn't exist yet (not funded)
        const err = error as { response?: { status?: number } }
        if (err?.response?.status === 404) {
          return null;
        }
        // Re-throw other errors to trigger retry
        throw error;
      }
    },
    enabled: !!publicKey,
    staleTime: 60 * 1000, // 60 seconds for user data
    // Retry once for network errors, but not for 404s (handled in queryFn)
    retry: (failureCount, error: unknown) => {
      // Don't retry if we've already tried once
      if (failureCount >= 1) return false;
      // Don't retry for 404 errors (account doesn't exist)
      const err = error as { response?: { status?: number } }
      if (err?.response?.status === 404) return false;
      // Retry for other errors (network issues, timeouts, etc.)
      return true;
    },
  });
}
