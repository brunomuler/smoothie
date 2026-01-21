"use client"

import { Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export interface YieldBreakdown {
  costBasisHistorical: number
  protocolYieldUsd: number
  priceChangeUsd: number
  totalEarnedUsd: number
  totalEarnedPercent: number
}

interface YieldDisplayProps {
  earnedYield: number
  yieldPercentage: number
  yieldBreakdown?: YieldBreakdown
  showPriceChanges?: boolean
  formatUsdAmount: (value: number) => string
  formatYieldValue: (value: number) => string
}

export function YieldDisplay({
  earnedYield,
  yieldPercentage,
  yieldBreakdown,
  showPriceChanges = true,
  formatUsdAmount,
  formatYieldValue,
}: YieldDisplayProps) {
  const hasSignificantYield = Math.abs(earnedYield) >= 0.01

  if (!hasSignificantYield) {
    return null
  }

  if (yieldBreakdown) {
    const displayValue = showPriceChanges
      ? yieldBreakdown.totalEarnedUsd
      : yieldBreakdown.protocolYieldUsd
    const pct = showPriceChanges
      ? yieldBreakdown.totalEarnedPercent
      : (yieldBreakdown.costBasisHistorical > 0
          ? (yieldBreakdown.protocolYieldUsd / yieldBreakdown.costBasisHistorical) * 100
          : 0)
    const formattedPct = pct !== 0 ? ` (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)` : ''

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <p className={`text-xs cursor-pointer flex items-center gap-1 ${displayValue >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {formatYieldValue(displayValue)}{formattedPct}
            <Info className="h-3 w-3" />
          </p>
        </TooltipTrigger>
        <TooltipContent className="p-2.5">
          <p className="font-semibold text-xs text-zinc-200 mb-2">Breakdown</p>
          <div className="space-y-1">
            <div className="flex justify-between gap-6">
              <span className="text-zinc-400">Cost Basis</span>
              <span className="text-zinc-300">
                {formatUsdAmount(yieldBreakdown.costBasisHistorical)}
              </span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-zinc-400">Yield</span>
              <span className={yieldBreakdown.protocolYieldUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {formatYieldValue(yieldBreakdown.protocolYieldUsd)}
              </span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-zinc-400">Price Change</span>
              <span className={yieldBreakdown.priceChangeUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {formatYieldValue(yieldBreakdown.priceChangeUsd)}
              </span>
            </div>
            <div className="flex justify-between gap-6 border-t border-zinc-700 pt-1 mt-1">
              <span className="text-zinc-300 font-medium">Total</span>
              <span className={yieldBreakdown.totalEarnedUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {formatYieldValue(yieldBreakdown.totalEarnedUsd)}
              </span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    )
  }

  // Fallback when no breakdown is available
  const formattedYieldPercentage = yieldPercentage !== 0
    ? ` (${yieldPercentage >= 0 ? '+' : ''}${yieldPercentage.toFixed(2)}%)`
    : ''

  return (
    <p className={`text-xs ${earnedYield >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
      {formatYieldValue(earnedYield)}{formattedYieldPercentage}
    </p>
  )
}
