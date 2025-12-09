/**
 * Wallet Balance Types
 * Types for wallet balance display and chart data
 */

export interface BalanceData {
  balance: string;
  rawBalance: number;
  apyPercentage: number;
  interestEarned: string;
  rawInterestEarned: number; // Numeric yield value for calculations
  annualYield: string;
  growthPercentage: number; // Yield percentage (profit / cost basis)
  blndApy: number; // BLND emissions APY
}

export interface ChartDataPoint {
  date: string;
  balance: number;
  deposit: number;
  yield: number;
  type: 'historical' | 'current' | 'projected';
}
