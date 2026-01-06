"use client"

import { Shield } from "lucide-react"
import { TokenLogo } from "@/components/token-logo"
import type { UserAction } from "@/lib/db/types"
import type { AmountWithCurrencyProps } from "./types"
import { LP_TOKEN_ADDRESS } from "./constants"
import { resolveAssetLogo, formatAmount } from "./helpers"

export function getAmountDisplay(action: UserAction, currentUserAddress?: string): React.ReactNode {
  const isAuctionEvent = action.action_type === "fill_auction" || action.action_type === "new_auction"
  const isBackstopEvent = action.action_type.startsWith("backstop_")
  const isLiquidator = action.filler_address === currentUserAddress

  if (isAuctionEvent && action.lot_amount && action.bid_amount) {
    const lotValue = action.lot_amount / 10000000
    const bidValue = action.bid_amount / 10000000
    const lotSymbol = action.lot_asset_symbol || "LOT"
    const bidSymbol = action.bid_asset_symbol || "BID"
    const fmt = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

    if (isLiquidator) {
      return (
        <div className="flex flex-col text-xs text-right">
          <span className="text-green-600 dark:text-green-400">+{fmt(lotValue)} {lotSymbol}</span>
          <span className="text-orange-600 dark:text-orange-400">+{fmt(bidValue)} {bidSymbol} debt</span>
        </div>
      )
    } else {
      return (
        <div className="flex flex-col text-xs text-right">
          <span className="text-red-600 dark:text-red-400">-{fmt(lotValue)} {lotSymbol}</span>
          <span className="text-blue-600 dark:text-blue-400">-{fmt(bidValue)} {bidSymbol} debt</span>
        </div>
      )
    }
  } else if (isBackstopEvent && action.lp_tokens !== null) {
    const lpValue = action.lp_tokens / 10000000
    // Format LP amount with 2 decimals max, hide if 0
    const formattedLp = lpValue.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
    // Positive: deposit, claim, dequeue (cancel queue returns LP to available)
    // Negative: withdraw, queue_withdrawal (LP moving out or being locked)
    const isPositive = action.action_type === "backstop_deposit" ||
                       action.action_type === "backstop_claim" ||
                       action.action_type === "backstop_dequeue_withdrawal"
    const sign = isPositive ? "" : "-"
    const textColor = isPositive ? "text-white" : "text-red-400"
    return (
      <div className={`flex items-center gap-2 font-mono text-xs font-medium ${textColor}`}>
        <div
          className="flex items-center justify-center rounded-full bg-purple-500/20 shrink-0"
          style={{ width: 20, height: 20 }}
        >
          <Shield className="h-3.5 w-3.5 text-purple-500" />
        </div>
        <span>{sign}{formattedLp} LP</span>
      </div>
    )
  } else {
    const amount = action.action_type === "claim" ? action.claim_amount : action.amount_underlying
    const symbol = action.action_type === "claim" ? "BLND" : action.asset_symbol
    const iconUrl = resolveAssetLogo(symbol ?? undefined)
    // Negative: withdraw, withdraw_collateral, borrow (money going out)
    // Positive: supply, supply_collateral, repay, claim
    const isNegative = action.action_type === "withdraw" ||
                       action.action_type === "withdraw_collateral" ||
                       action.action_type === "borrow"
    const sign = isNegative ? "-" : ""
    const textColor = isNegative ? "text-red-400" : "text-white"
    const isBlnd = symbol === "BLND"
    return (
      <div className={`flex items-center gap-2 font-mono text-xs font-medium ${textColor}`}>
        {symbol && (
          isBlnd ? (
            <TokenLogo src={iconUrl} symbol={symbol} size={20} className="bg-zinc-800" />
          ) : (
            <TokenLogo src={iconUrl} symbol={symbol} size={20} />
          )
        )}
        <span>{sign}{formatAmount(amount, action.asset_decimals || 7)} {symbol || ""}</span>
      </div>
    )
  }
}

export function AmountWithCurrency({
  action,
  currentUserAddress,
  historicalPrices,
  currency,
  formatCurrency,
  tokensMap,
  blndTokenAddress,
}: AmountWithCurrencyProps) {
  const amountDisplay = getAmountDisplay(action, currentUserAddress)

  // Skip auction events (complex multi-token buy/sell)
  const isAuctionEvent = action.action_type === "fill_auction" || action.action_type === "new_auction"
  if (isAuctionEvent) {
    return <>{amountDisplay}</>
  }

  const isBackstopEvent = action.action_type.startsWith("backstop_")
  const isClaimEvent = action.action_type === "claim"

  // Determine the token address and amount based on event type
  let tokenAddress: string | null = null
  let amount: number | null = null
  let decimals = 7

  if (isBackstopEvent) {
    // For backstop events, use the LP token address (BLND-USDC Comet LP)
    tokenAddress = LP_TOKEN_ADDRESS
    amount = action.lp_tokens
  } else if (isClaimEvent) {
    // For BLND claims, use the BLND token address
    tokenAddress = blndTokenAddress || null
    amount = action.claim_amount
  } else {
    // Regular supply/withdraw/borrow events
    tokenAddress = action.asset_address
    amount = action.amount_underlying
    decimals = action.asset_decimals || 7
  }

  if (!tokenAddress || !amount) {
    return <>{amountDisplay}</>
  }

  // Check if token is pegged to user's currency (only for regular tokens, not LP)
  if (!isBackstopEvent) {
    const token = tokensMap.get(tokenAddress)
    const isPegged = token?.pegged_currency?.toUpperCase() === currency.toUpperCase()
    if (isPegged) {
      return <>{amountDisplay}</>
    }
  }

  // Get historical price for this token/date
  const actionDate = action.ledger_closed_at.split('T')[0]
  const priceData = historicalPrices?.[tokenAddress]?.[actionDate]
  const price = priceData?.price

  if (!price) {
    return <>{amountDisplay}</>
  }

  const tokenAmount = amount / Math.pow(10, decimals)
  const usdValue = tokenAmount * price

  // For regular token events (not backstop), render icon on left with stacked text on right
  if (!isBackstopEvent) {
    const symbol = isClaimEvent ? "BLND" : action.asset_symbol
    const iconUrl = resolveAssetLogo(symbol ?? undefined)
    const isNegative = action.action_type === "withdraw" ||
                       action.action_type === "withdraw_collateral" ||
                       action.action_type === "borrow"
    const sign = isNegative ? "-" : ""
    const textColor = isNegative ? "text-red-400" : "text-white"
    const isBlnd = symbol === "BLND"

    return (
      <div className="flex items-center gap-2">
        {symbol && (
          isBlnd ? (
            <TokenLogo src={iconUrl} symbol={symbol} size={20} className="bg-zinc-800" />
          ) : (
            <TokenLogo src={iconUrl} symbol={symbol} size={20} />
          )
        )}
        <div className="flex flex-col items-start">
          <span className={`font-mono text-xs font-medium ${textColor}`}>
            {sign}{formatAmount(amount, decimals)} {symbol || ""}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {formatCurrency(usdValue)}
          </span>
        </div>
      </div>
    )
  }

  // For backstop events, render icon on left with stacked text on right (same as tokens)
  const lpValue = amount / Math.pow(10, decimals)
  const formattedLp = lpValue.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  const isPositive = action.action_type === "backstop_deposit" ||
                     action.action_type === "backstop_claim" ||
                     action.action_type === "backstop_dequeue_withdrawal"
  const sign = isPositive ? "" : "-"
  const textColor = isPositive ? "text-white" : "text-red-400"

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center justify-center rounded-full bg-purple-500/20 shrink-0"
        style={{ width: 20, height: 20 }}
      >
        <Shield className="h-3.5 w-3.5 text-purple-500" />
      </div>
      <div className="flex flex-col items-start">
        <span className={`font-mono text-xs font-medium ${textColor}`}>
          {sign}{formattedLp} LP
        </span>
        <span className="text-[10px] text-muted-foreground">
          {formatCurrency(usdValue)}
        </span>
      </div>
    </div>
  )
}
