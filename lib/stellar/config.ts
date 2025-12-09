import { Networks } from '@stellar/stellar-sdk';
import type { NetworkConfig, NetworkType } from '@/types/stellar';

/**
 * Stellar Network Configuration
 * Manages network settings for testnet and mainnet
 */

export const NETWORK_CONFIGS: Record<NetworkType, NetworkConfig> = {
  testnet: {
    networkPassphrase: Networks.TESTNET,
    horizonUrl: process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org',
    friendbotUrl: process.env.NEXT_PUBLIC_STELLAR_FRIENDBOT_URL || 'https://friendbot.stellar.org',
  },
  public: {
    networkPassphrase: Networks.PUBLIC,
    horizonUrl: process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL || 'https://horizon.stellar.org',
  },
};

export const getCurrentNetwork = (): NetworkType => {
  const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK as NetworkType;
  return network === 'public' ? 'public' : 'testnet';
};

export const getNetworkConfig = (network?: NetworkType): NetworkConfig => {
  const currentNetwork = network || getCurrentNetwork();
  return NETWORK_CONFIGS[currentNetwork];
};
