import { Networks } from "@stellar/stellar-sdk";
import type { Network } from "@blend-capital/blend-sdk";

export function getBlendNetwork(): Network {
  const networkType = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet") as
    | "testnet"
    | "public";

  const rpcUrl =
    process.env.NEXT_PUBLIC_RPC_URL ||
    (networkType === "public"
      ? "https://mainnet.sorobanrpc.com"
      : "https://soroban-testnet.stellar.org");

  return {
    rpc: rpcUrl,
    passphrase: networkType === "public" ? Networks.PUBLIC : Networks.TESTNET,
  };
}
