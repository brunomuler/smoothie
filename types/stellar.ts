/**
 * Stellar Wallet Types
 * Common types used throughout the application for Stellar operations
 */

export interface WalletAccount {
  publicKey: string;
  secretKey?: string; // Only stored in memory when unlocked
  balance: string;
  name?: string;
}

export interface Transaction {
  id: string;
  type: 'payment' | 'create_account' | 'path_payment' | 'manage_offer' | 'other';
  amount: string;
  asset: string;
  from: string;
  to: string;
  timestamp: string;
  memo?: string;
  successful: boolean;
}

export interface Asset {
  code: string;
  issuer?: string;
  balance: string;
  limit?: string;
}

export type NetworkType = 'testnet' | 'public';

export interface NetworkConfig {
  networkPassphrase: string;
  horizonUrl: string;
  friendbotUrl?: string;
}
