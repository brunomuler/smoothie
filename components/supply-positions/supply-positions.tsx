"use client"

import Link from "next/link"
import { TokenLogo } from "@/components/token-logo"
import { formatAmount } from "@/lib/format-utils"
import { useCurrencyPreference } from "@/hooks/use-currency-preference"
import { useDisplayPreferences } from "@/contexts/display-preferences-context"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { TrendingUp, ChevronRight, Flame, Shield, Clock, Info, CheckCircle } from "lucide-react"
import type { AssetCardData } from "@/types/asset-card"
import type { SupplyPositionsProps } from "./types"
import { SupplyPositionsSkeleton } from "./skeleton"
import { SupplyPositionsEmptyState } from "./empty-state"

export function SupplyPositions({
  isLoading,
  enrichedAssetCards,
  backstopPositions,
  blendSnapshot,
  onPoolClick,
}: SupplyPositionsProps) {
  // Currency preference for multi-currency display
  const { format: formatInCurrency } = useCurrencyPreference()

  // Display preferences (show price changes toggle)
  const { preferences: displayPreferences } = useDisplayPreferences()

  const formatUsdAmount = (value: number) => {
    if (!Number.isFinite(value)) return formatInCurrency(0)
    if (value > 0 && value < 0.01) {
      return formatInCurrency(value, { minimumFractionDigits: 6, maximumFractionDigits: 6 })
    }
    return formatInCurrency(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const formatYieldValue = (value: number) => formatInCurrency(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    showSign: true,
  })

  if (isLoading) {
    return <SupplyPositionsSkeleton />
  }

  if (enrichedAssetCards.length > 0 || backstopPositions.length > 0) {
    // Group supply positions by pool
    const poolMap = enrichedAssetCards.reduce((acc, asset) => {
      // Extract pool ID from composite ID (format: poolId-assetAddress)
      const poolId = asset.id.includes('-') ? asset.id.split('-')[0] : asset.id
      const poolName = asset.protocolName

      if (!acc[poolId]) {
        acc[poolId] = {
          poolName,
          assets: []
        }
      }
      acc[poolId].assets.push(asset)
      return acc
    }, {} as Record<string, { poolName: string; assets: AssetCardData[] }>)

    // Add backstop-only pools (pools where user has backstop but no supply)
    backstopPositions.forEach(bp => {
      if (!poolMap[bp.poolId] && bp.lpTokensUsd > 0) {
        poolMap[bp.poolId] = {
          poolName: bp.poolName,
          assets: []
        }
      }
    })

    return (
      <div className="grid gap-4 grid-cols-1">
        {Object.entries(poolMap).map(([poolId, { poolName, assets }]) => {
          return (
            <Card key={poolId} className="py-2 gap-0">
              <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                <CardTitle>{poolName} Pool</CardTitle>
                <Link
                  href={`/pool/${encodeURIComponent(poolId)}`}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => onPoolClick?.(poolId, poolName)}
                >
                  <ChevronRight className="h-5 w-5" />
                </Link>
              </CardHeader>
              <CardContent className="px-4 pt-0 pb-1">
                <div className="space-y-1">
                  {assets.map((asset) => {
                    const yieldToShow = asset.earnedYield ?? 0
                    const formattedYield = formatYieldValue(yieldToShow)
                    const hasSignificantYield = Math.abs(yieldToShow) >= 0.01
                    const yieldPercentage = asset.yieldPercentage ?? 0
                    const formattedYieldPercentage = yieldPercentage !== 0 ? ` (${yieldPercentage >= 0 ? '+' : ''}${yieldPercentage.toFixed(2)}%)` : ''

                    // Find the corresponding position to get token amount
                    const position = blendSnapshot?.positions.find(p => p.id === asset.id)
                    const tokenAmount = position?.supplyAmount || 0
                    const symbol = position?.symbol || asset.assetName

                    return (
                      <div key={asset.id} className="flex items-center justify-between py-2 gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <TokenLogo
                            src={asset.logoUrl}
                            symbol={asset.assetName}
                            size={36}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{asset.assetName}</p>
                            <p className="text-sm text-muted-foreground truncate">
                              {formatUsdAmount(asset.rawBalance)}
                              <span className="text-xs ml-1">
                                ({formatAmount(tokenAmount)} {symbol})
                              </span>
                            </p>
                            {hasSignificantYield && (
                              asset.yieldBreakdown ? (() => {
                                // Show total (yield + price change) when showPriceChanges is ON, otherwise just yield
                                const displayValue = displayPreferences.showPriceChanges
                                  ? asset.yieldBreakdown.totalEarnedUsd
                                  : asset.yieldBreakdown.protocolYieldUsd
                                const pct = displayPreferences.showPriceChanges
                                  ? asset.yieldBreakdown.totalEarnedPercent
                                  : (asset.yieldBreakdown.costBasisHistorical > 0
                                      ? (asset.yieldBreakdown.protocolYieldUsd / asset.yieldBreakdown.costBasisHistorical) * 100
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
                                          {formatUsdAmount(asset.yieldBreakdown.costBasisHistorical)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between gap-6">
                                        <span className="text-zinc-400">Yield</span>
                                        <span className={asset.yieldBreakdown.protocolYieldUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                          {formatYieldValue(asset.yieldBreakdown.protocolYieldUsd)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between gap-6">
                                        <span className="text-zinc-400">Price Change</span>
                                        <span className={asset.yieldBreakdown.priceChangeUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                          {formatYieldValue(asset.yieldBreakdown.priceChangeUsd)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between gap-6 border-t border-zinc-700 pt-1 mt-1">
                                        <span className="text-zinc-300 font-medium">Total</span>
                                        <span className={asset.yieldBreakdown.totalEarnedUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                          {formatYieldValue(asset.yieldBreakdown.totalEarnedUsd)}
                                        </span>
                                      </div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                                )
                              })() : (
                                <p className={`text-xs ${yieldToShow >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                  {formattedYield}{formattedYieldPercentage}
                                </p>
                              )
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 items-start shrink-0 w-[110px]">
                          <Badge variant="secondary" className="text-xs">
                            <TrendingUp className="mr-1 h-3 w-3" />
                            {asset.apyPercentage.toFixed(2)}% APY
                          </Badge>
                          {asset.growthPercentage > 0.005 && (
                            <Badge variant="secondary" className="text-xs">
                              <Flame className="mr-1 h-3 w-3" />
                              {asset.growthPercentage.toFixed(2)}% BLND
                            </Badge>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {/* Backstop Position for this pool */}
                  {(() => {
                    const backstopPosition = backstopPositions.find(bp => bp.poolId === poolId)
                    if (!backstopPosition || backstopPosition.lpTokensUsd <= 0) return null

                    const hasQ4w = backstopPosition.q4wShares > BigInt(0)
                    // Format time remaining for single locked chunk as "Xd Yh"
                    const timeRemaining = (() => {
                      if (backstopPosition.q4wChunks.length !== 1) return null
                      const q4wExpDate = new Date(backstopPosition.q4wChunks[0].expiration * 1000)
                      const diff = q4wExpDate.getTime() - Date.now()
                      if (diff <= 0) return null
                      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
                      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
                      if (days > 0) return `${days}d ${hours}h`
                      return `${hours}h`
                    })()

                    return (
                      <div key={`backstop-${poolId}`} className={`flex items-center justify-between py-2 gap-3 ${assets.length > 0 ? 'border-t border-border/50 mt-2 pt-3' : ''}`}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                            <Shield className="h-5 w-5 text-purple-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">Backstop</p>
                            <p className="text-sm text-muted-foreground truncate">
                              {formatUsdAmount(backstopPosition.lpTokensUsd)}
                              <span className="text-xs ml-1">
                                ({formatAmount(backstopPosition.lpTokens, 2)} LP)
                              </span>
                            </p>
                            {(() => {
                              // Calculate yield in USD
                              const lpTokenPrice = backstopPosition.lpTokens > 0
                                ? backstopPosition.lpTokensUsd / backstopPosition.lpTokens
                                : 0
                              const yieldUsd = backstopPosition.yieldLp * lpTokenPrice
                              const formattedYieldPercentage = backstopPosition.yieldPercent !== 0
                                ? ` (${backstopPosition.yieldPercent >= 0 ? '+' : ''}${backstopPosition.yieldPercent.toFixed(2)}%)`
                                : ''
                              const hasSignificantYield = Math.abs(yieldUsd) >= 0.01

                              if (!hasSignificantYield) return null

                              // Show tooltip if breakdown is available
                              if (backstopPosition.yieldBreakdown) {
                                // Show total (yield + price change) when showPriceChanges is ON, otherwise just yield
                                const displayValue = displayPreferences.showPriceChanges
                                  ? backstopPosition.yieldBreakdown.totalEarnedUsd
                                  : backstopPosition.yieldBreakdown.protocolYieldUsd
                                const pct = displayPreferences.showPriceChanges
                                  ? backstopPosition.yieldBreakdown.totalEarnedPercent
                                  : (backstopPosition.yieldBreakdown.costBasisHistorical > 0
                                      ? (backstopPosition.yieldBreakdown.protocolYieldUsd / backstopPosition.yieldBreakdown.costBasisHistorical) * 100
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
                                            {formatUsdAmount(backstopPosition.yieldBreakdown.costBasisHistorical)}
                                          </span>
                                        </div>
                                        <div className="flex justify-between gap-6">
                                          <span className="text-zinc-400">Yield</span>
                                          <span className={backstopPosition.yieldBreakdown.protocolYieldUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                            {formatYieldValue(backstopPosition.yieldBreakdown.protocolYieldUsd)}
                                          </span>
                                        </div>
                                        {backstopPosition.yieldBreakdown.priceChangeUsd !== 0 && (
                                          <div className="flex justify-between gap-6">
                                            <span className="text-zinc-400">Price Change</span>
                                            <span className={backstopPosition.yieldBreakdown.priceChangeUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                              {formatYieldValue(backstopPosition.yieldBreakdown.priceChangeUsd)}
                                            </span>
                                          </div>
                                        )}
                                        <div className="flex justify-between gap-6 border-t border-zinc-700 pt-1 mt-1">
                                          <span className="text-zinc-300 font-medium">Total</span>
                                          <span className={backstopPosition.yieldBreakdown.totalEarnedUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                            {formatYieldValue(backstopPosition.yieldBreakdown.totalEarnedUsd)}
                                          </span>
                                        </div>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                )
                              }

                              return (
                                <p className={`text-xs ${yieldUsd >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                  {formatYieldValue(yieldUsd)}{formattedYieldPercentage}
                                </p>
                              )
                            })()}
                            {hasQ4w && (
                              <div className="text-xs text-amber-600 dark:text-amber-400 flex flex-col gap-0.5 mt-1">
                                {/* Show queued LP with unlock schedule */}
                                {backstopPosition.q4wChunks.length > 0 && (
                                  <p className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {backstopPosition.q4wChunks.length > 1 ? (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="underline decoration-dotted cursor-pointer">
                                            {formatAmount(backstopPosition.q4wChunks.reduce((sum, c) => sum + c.lpTokens, 0), 2)} LP in {backstopPosition.q4wChunks.length} queued
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent className="p-2.5">
                                          <p className="font-medium text-zinc-400 mb-1.5">Queued Withdrawals</p>
                                          <div className="space-y-1">
                                            {backstopPosition.q4wChunks.map((chunk, i) => {
                                              const chunkExpDate = new Date(chunk.expiration * 1000)
                                              const diff = chunkExpDate.getTime() - Date.now()
                                              const days = Math.floor(diff / (1000 * 60 * 60 * 24))
                                              const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
                                              const chunkTime = diff > 0
                                                ? (days > 0 ? `${days}d ${hours}h` : `${hours}h`)
                                                : "Ready"
                                              return (
                                                <div key={i} className="flex justify-between gap-6">
                                                  <span className="font-mono">{formatAmount(chunk.lpTokens, 2)} LP</span>
                                                  <span className="text-zinc-400">{chunkTime}</span>
                                                </div>
                                              )
                                            })}
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    ) : timeRemaining ? (
                                      `${formatAmount(backstopPosition.q4wChunks[0].lpTokens, 2)} LP queued, ${timeRemaining}`
                                    ) : (
                                      `${formatAmount(backstopPosition.q4wChunks[0].lpTokens, 2)} LP queued`
                                    )}
                                  </p>
                                )}
                                {/* Show ready to withdraw LP */}
                                {backstopPosition.unlockedQ4wLpTokens > 0.001 && (
                                  <p className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                    <CheckCircle className="h-3 w-3" />
                                    {formatAmount(backstopPosition.unlockedQ4wLpTokens, 2)} LP ready to withdraw
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 items-start shrink-0 w-[110px]">
                          {backstopPosition.interestApr > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              <TrendingUp className="mr-1 h-3 w-3" />
                              {backstopPosition.interestApr.toFixed(2)}% APR
                            </Badge>
                          )}
                          {backstopPosition.emissionApy > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              <Flame className="mr-1 h-3 w-3" />
                              {backstopPosition.emissionApy.toFixed(2)}% BLND
                            </Badge>
                          )}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    )
  }

  // Empty state
  return <SupplyPositionsEmptyState />
}
