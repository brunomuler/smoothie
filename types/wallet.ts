/**
 * Wallet Types
 * Types for wallet management and selection
 */

export interface Wallet {
  id: string;
  publicKey: string;
  name?: string;
  isActive: boolean;
}
