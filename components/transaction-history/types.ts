/**
 * Transaction History Types
 *
 * Local types for the transaction history component.
 */

import type { ActionType, UserAction } from "@/lib/db/types"
import type { HistoricalPricesResponse } from "@/app/api/historical-prices/route"

export interface TransactionHistoryProps {
  publicKey: string
  assetAddress?: string
  poolId?: string
  limit?: number
  defaultOpen?: boolean
  hideToggle?: boolean
  isDemoWallet?: boolean
}

export interface ActionTypeOption {
  value: ActionType
  label: string
}

export interface ActionConfig {
  label: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  bgColor: string
}

export interface TransactionRowProps {
  actions: UserAction[]
  currentUserAddress?: string
  historicalPrices?: HistoricalPricesResponse['prices']
  currency: string
  formatCurrency: (amountUsd: number) => string
  tokensMap: Map<string, { pegged_currency: string | null }>
  blndTokenAddress?: string
  isDemoWallet?: boolean
}

export interface AmountWithCurrencyProps {
  action: UserAction
  currentUserAddress?: string
  historicalPrices?: HistoricalPricesResponse['prices']
  currency: string
  formatCurrency: (amountUsd: number) => string
  tokensMap: Map<string, { pegged_currency: string | null }>
  blndTokenAddress?: string
}

export interface GroupedAction {
  key: string
  actions: UserAction[]
}
