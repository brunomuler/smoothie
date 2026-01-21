"use client"

import { memo } from "react"
import { Droplets } from "lucide-react"
import { TokenSparkline, Token30dChange } from "@/components/token-sparkline-bg"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { LP_TOKEN_CONTRACT_ID, type SparklinePeriod } from "./constants"
import { formatBalance } from "./helpers"

export interface LpTokenItemProps {
  balance: string
  usdValue?: number
  isLoading: boolean
  formatCurrency: (amountUsd: number) => string
  currentPrice?: number // Current LP token price
  period: SparklinePeriod
  showPrice: boolean // Show current price instead of percentage change
  onPriceToggle: () => void // Callback to toggle price/percentage display
}

export const LpTokenItem = memo(function LpTokenItem({ balance, usdValue, isLoading, formatCurrency, currentPrice, period, showPrice, onPriceToggle }: LpTokenItemProps) {
  const balanceNum = parseFloat(balance) / 1e7 // Soroban tokens have 7 decimals

  if (isLoading) {
    return (
      <div className="flex items-center py-2 gap-3 animate-pulse">
        <div className="flex items-center gap-3 w-32 shrink-0">
          <div className="h-9 w-9 rounded-full bg-muted shrink-0" />
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="h-4 w-full bg-muted rounded" />
            <div className="h-3 w-16 bg-muted rounded" />
          </div>
        </div>
        <div className="flex-1 flex justify-center">
          <div className="h-8 w-full max-w-48 bg-muted rounded" />
        </div>
        <div className="flex flex-col items-end shrink-0 w-24 space-y-1.5">
          <div className="h-4 w-16 bg-muted rounded" />
          <div className="h-3 w-12 bg-muted rounded" />
        </div>
      </div>
    )
  }

  // Link to the LP token contract on stellar.expert
  const explorerUrl = `https://stellar.expert/explorer/public/contract/${LP_TOKEN_CONTRACT_ID}`

  return (
    <div className="flex items-center py-2 gap-3">
      {/* Left: Logo, name, balance */}
      <div className="flex items-center gap-3 min-w-0 w-32 shrink-0">
        <div className="h-9 w-9 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0">
          <Droplets className="h-5 w-5 text-purple-500" />
        </div>
        <div className="min-w-0 flex-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm sm:text-base font-medium truncate block hover:underline"
              >
                LP
              </a>
            </TooltipTrigger>
            <TooltipContent>BLND-USDC LP</TooltipContent>
          </Tooltip>
          <p className="text-xs text-muted-foreground truncate">
            {formatBalance(balanceNum)}
          </p>
        </div>
      </div>

      {/* Middle: Sparkline - centered */}
      <div className="flex-1 flex justify-center">
        <TokenSparkline tokenAddress={LP_TOKEN_CONTRACT_ID} currentPrice={currentPrice} period={period} />
      </div>

      {/* Right: Value, 30d change */}
      <div className="flex flex-col items-end shrink-0 w-24">
        {usdValue !== undefined ? (
          <p className="text-sm sm:text-base font-medium">{formatCurrency(usdValue)}</p>
        ) : (
          <p className="text-sm sm:text-base font-medium text-muted-foreground">—</p>
        )}
        <Token30dChange tokenAddress={LP_TOKEN_CONTRACT_ID} currentPrice={currentPrice} period={period} showPrice={showPrice} onToggle={onPriceToggle} />
      </div>
    </div>
  )
})
