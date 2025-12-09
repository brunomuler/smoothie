import { useQuery } from "@tanstack/react-query";
import { getHorizonServer } from "@/lib/stellar/horizon";
import type { Horizon } from "@stellar/stellar-sdk";

export function useAccount(publicKey: string | undefined) {
  return useQuery({
    queryKey: ["account", publicKey],
    queryFn: async (): Promise<Horizon.AccountResponse | null> => {
      if (!publicKey) return null;

      try {
        const server = getHorizonServer();
        const account = await server.loadAccount(publicKey);
        return account;
      } catch (error: any) {
        // Account doesn't exist yet (not funded)
        if (error?.response?.status === 404) {
          return null;
        }
        // Re-throw other errors to trigger retry
        throw error;
      }
    },
    enabled: !!publicKey,
    staleTime: 60 * 1000, // 60 seconds for user data
    // Retry once for network errors, but not for 404s (handled in queryFn)
    retry: (failureCount, error: any) => {
      // Don't retry if we've already tried once
      if (failureCount >= 1) return false;
      // Don't retry for 404 errors (account doesn't exist)
      if (error?.response?.status === 404) return false;
      // Retry for other errors (network issues, timeouts, etc.)
      return true;
    },
  });
}
