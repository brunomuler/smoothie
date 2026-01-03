/**
 * Wallet Balance Types
 *
 * Type definitions for the wallet balance component.
 */

import type { BalanceData, ChartDataPoint as WalletChartDataPoint } from "@/types/wallet-balance"
import type { ChartDataPoint, EarningsStats, PositionChange } from "@/types/balance-history"
import type { PoolProjectionInput } from "@/lib/chart-utils"
import type { ChartHistoricalPrices } from "@/hooks/use-chart-historical-prices"

export interface YieldBreakdownTotals {
  totalProtocolYieldUsd: number
  totalPriceChangeUsd: number
  totalCostBasisHistorical: number
  totalEarnedUsd: number
}

// Type for balance history data map entry (rawData is unknown[] from the hook)
export interface BalanceHistoryDataEntry {
  rawData: unknown[]
  chartData: Array<{ date: string }>
}

// Type for blend positions
export interface BlendPosition {
  id: string
  supplyAmount: number
  price?: { usdPrice?: number } | null
  assetId?: string
}

// Type for backstop positions
export interface BackstopPosition {
  poolId: string
  poolName: string
  lpTokens: number
  lpTokensUsd: number
  interestApr: number
  emissionApy: number
  yieldPercent?: number
}

export interface WalletBalanceProps {
  data: BalanceData
  chartData: WalletChartDataPoint[]
  publicKey?: string
  balanceHistoryData?: {
    earningsStats: EarningsStats
    chartData: ChartDataPoint[]
    positionChanges: PositionChange[]
  }
  loading?: boolean
  usdcPrice?: number // USDC price from SDK oracle for normalizing historical data
  poolInputs?: PoolProjectionInput[] // Per-pool data for projection breakdown
  yieldBreakdown?: YieldBreakdownTotals // Historical yield breakdown (protocol yield vs price change)
  // New props for period-specific breakdown
  balanceHistoryDataMap?: Map<string, BalanceHistoryDataEntry>
  historicalPrices?: ChartHistoricalPrices
  blendPositions?: BlendPosition[]
  backstopPositions?: BackstopPosition[]
  lpTokenPrice?: number | null
}
