/**
 * Asset Card Types
 * Types for individual asset/position cards
 */

export interface AssetCardData {
  id: string;
  protocolName: string;
  assetName: string;
  logoUrl: string;
  balance: string;
  rawBalance: number;
  apyPercentage: number;
  growthPercentage: number;
  earnedYield?: number; // Total yield earned: SDK Balance - Cost Basis
  yieldPercentage?: number; // Yield percentage: (Yield / Cost Basis) * 100
}

export type AssetAction = 'deposit' | 'withdraw' | 'view-details' | 'remove';
