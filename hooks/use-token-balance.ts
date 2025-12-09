import { useQuery } from "@tanstack/react-query";
import { Contract, Address, scValToNative, TransactionBuilder, BASE_FEE, Networks } from "@stellar/stellar-sdk";
import { getSorobanRpc } from "@/lib/stellar/rpc";

export function useTokenBalance(
  contractId: string | undefined,
  userAddress: string | undefined
) {
  return useQuery({
    queryKey: ["tokenBalance", contractId, userAddress],
    queryFn: async (): Promise<string> => {
      if (!contractId || !userAddress) return "0";

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
        const simResult = simulation as any;
        if (!simResult.result || !simResult.result.retval) {
          return "0";
        }

        const balance = scValToNative(simResult.result.retval);
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
