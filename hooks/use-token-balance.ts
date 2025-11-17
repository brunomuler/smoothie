import { useQuery } from "@tanstack/react-query";
import { Contract, Address, scValToNative } from "@stellar/stellar-sdk";
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

        // Simulate the balance query
        const result = await rpc.simulateTransaction(
          contract.call(
            "balance",
            Address.fromString(userAddress).toScVal()
          )
        );

        if (!result || !result.result) {
          return "0";
        }

        const balance = scValToNative(result.result.retval);
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
