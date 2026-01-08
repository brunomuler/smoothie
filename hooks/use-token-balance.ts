import { useQuery } from "@tanstack/react-query";
import { Contract, Address, scValToNative, TransactionBuilder, BASE_FEE, Networks } from "@stellar/stellar-sdk";
import { getSorobanRpc } from "@/lib/stellar/rpc";
import { fetchWithTimeout } from "@/lib/fetch-utils";

// Helper to check if a wallet is a demo wallet (by alias format)
function isDemoWallet(userAddress: string | undefined): boolean {
  return !!userAddress && userAddress.startsWith('demo-')
}

// Fetch token balance from backend API (for demo wallets - keeps addresses server-side)
async function fetchBalanceFromApi(contractId: string, walletAlias: string): Promise<string> {
  const response = await fetchWithTimeout(
    `/api/token-balance?contractId=${encodeURIComponent(contractId)}&user=${encodeURIComponent(walletAlias)}`
  )
  if (!response.ok) {
    throw new Error('Failed to fetch token balance')
  }
  const data = await response.json()
  return data.balance || "0"
}

export function useTokenBalance(
  contractId: string | undefined,
  userAddress: string | undefined
) {
  const isDemo = isDemoWallet(userAddress)

  return useQuery({
    queryKey: ["tokenBalance", contractId, userAddress],
    queryFn: async (): Promise<string> => {
      if (!contractId || !userAddress) return "0";

      // Demo wallet: fetch from backend API (address resolution happens server-side)
      if (isDemo) {
        return fetchBalanceFromApi(contractId, userAddress)
      }

      // Regular wallet: call Soroban RPC directly
      try {
        const rpc = getSorobanRpc();
        const contract = new Contract(contractId);

        // Get source account (we just need a valid account for simulation)
        const sourceAccount = await rpc.getAccount(userAddress);

        // Determine network
        const network = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet") as "testnet" | "mainnet";
        const networkPassphrase = network === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;

        // Build transaction from operation
        const transaction = new TransactionBuilder(sourceAccount, {
          fee: BASE_FEE,
          networkPassphrase,
        })
          .addOperation(
            contract.call(
              "balance",
              Address.fromString(userAddress).toScVal()
            )
          )
          .setTimeout(30)
          .build();

        // Simulate the balance query
        const simulation = await rpc.simulateTransaction(transaction);

        // Check if simulation was successful
        if (!simulation || 'error' in simulation) {
          return "0";
        }

        // Access the result value - SDK v14 uses 'result' with retval
        const simResult = simulation as { result?: { retval?: unknown } };
        if (!simResult.result || !simResult.result.retval) {
          return "0";
        }

        const balance = scValToNative(simResult.result.retval as Parameters<typeof scValToNative>[0]);
        return balance.toString();
      } catch (error) {
        console.error("Error fetching token balance:", error);
        return "0";
      }
    },
    enabled: !!contractId && !!userAddress,
    staleTime: 30 * 1000, // 30 seconds
  });
}
