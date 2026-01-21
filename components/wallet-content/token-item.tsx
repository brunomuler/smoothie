"use client"

import { memo } from "react"
import { Droplets } from "lucide-react"
import { TokenLogo } from "@/components/token-logo"
import { TokenSparkline, Token30dChange } from "@/components/token-sparkline-bg"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import type { TokenBalance } from "@/hooks/use-horizon-balances"
import type { SparklinePeriod } from "./constants"
import { formatBalance, getTokenIconUrl, getStellarExpertUrl } from "./helpers"

export interface TokenItemProps {
  token: TokenBalance
  formatCurrency: (amountUsd: number) => string
  currentPrice?: number // Current oracle price for live data
  period: SparklinePeriod
  showPrice: boolean // Show current price instead of percentage change
  onPriceToggle: () => void // Callback to toggle price/percentage display
}

export const TokenItem = memo(function TokenItem({ token, formatCurrency, currentPrice, period, showPrice, onPriceToggle }: TokenItemProps) {
  const logoUrl = getTokenIconUrl(token.assetCode, token.assetIssuer, token.assetType)
  const balance = parseFloat(token.balance)
  const isLpShare = token.assetType === "liquidity_pool_shares"
  const explorerUrl = getStellarExpertUrl(token)

  return (
    <div className="flex items-center py-2 gap-3">
      {/* Left: Logo, name, balance */}
      <div className="flex items-center gap-3 min-w-0 w-32 shrink-0">
        {isLpShare ? (
          <div className="h-9 w-9 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
            <Droplets className="h-5 w-5 text-blue-500" />
          </div>
        ) : (
          <TokenLogo
            src={logoUrl}
            symbol={token.assetCode}
            size={36}
          />
        )}
        <div className="min-w-0 flex-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm sm:text-base font-medium truncate block hover:underline"
              >
                {isLpShare ? "LP" : token.assetCode}
              </a>
            </TooltipTrigger>
            {isLpShare && token.liquidityPoolId && (
              <TooltipContent>Pool: {token.liquidityPoolId.slice(0, 8)}...</TooltipContent>
            )}
          </Tooltip>
          <p className="text-xs text-muted-foreground truncate">
            {formatBalance(balance)}
          </p>
        </div>
      </div>

      {/* Middle: Sparkline - centered */}
      <div className="flex-1 flex justify-center">
        {token.tokenAddress && (
          <TokenSparkline tokenAddress={token.tokenAddress} currentPrice={currentPrice} period={period} />
        )}
      </div>

      {/* Right: Value, 30d change */}
      <div className="flex flex-col items-end shrink-0 w-24">
        {token.usdValue !== undefined ? (
          <p className="text-sm sm:text-base font-medium">
            {formatCurrency(token.usdValue)}
          </p>
        ) : (
          <p className="text-sm sm:text-base font-medium text-muted-foreground">—</p>
        )}
        {token.tokenAddress ? (
          <Token30dChange tokenAddress={token.tokenAddress} currentPrice={currentPrice} period={period} showPrice={showPrice} onToggle={onPriceToggle} />
        ) : (
          <p className="text-xs text-muted-foreground">—</p>
        )}
      </div>
    </div>
  )
})
