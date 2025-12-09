import { rpc } from "@stellar/stellar-sdk";

export function getRpcUrl(): string {
  const network = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet") as "testnet" | "mainnet";
  return (
    process.env.NEXT_PUBLIC_RPC_URL ||
    (network === "mainnet"
      ? "https://mainnet.sorobanrpc.com"
      : "https://soroban-testnet.stellar.org")
  );
}

export function getSorobanRpc(): rpc.Server {
  return new rpc.Server(getRpcUrl(), {
    allowHttp: process.env.NEXT_PUBLIC_STELLAR_NETWORK === "testnet",
  });
}
