import { Horizon } from "@stellar/stellar-sdk";

const HORIZON_URLS = {
  testnet: "https://horizon-testnet.stellar.org",
  public: "https://horizon.stellar.org",
  mainnet: "https://horizon.stellar.org",
};

export function getHorizonUrl(): string {
  const network = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet") as "testnet" | "public" | "mainnet";
  return HORIZON_URLS[network] || HORIZON_URLS.testnet;
}

export function getHorizonServer(): Horizon.Server {
  return new Horizon.Server(getHorizonUrl());
}
