"use client"

import Link from "next/link"
import { TokenLogo } from "@/components/token-logo"
import { formatAmount, formatUsdAmount } from "@/lib/format-utils"
import { DEMO_SUPPLY_POSITIONS } from "@/lib/demo-data"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { TrendingUp, ChevronRight, Flame, Shield, Clock } from "lucide-react"
import type { AssetCardData } from "@/types/asset-card"

interface BackstopPositionData {
  poolId: string
  poolName: string
  lpTokens: number
  lpTokensUsd: number
  yieldLp: number
  yieldPercent: number
  interestApr: number
  emissionApy: number
  q4wShares: bigint
  q4wLpTokens: number
  q4wExpiration: number | null
}

interface BlendPosition {
  id: string
  poolId: string
  poolName: string
  supplyAmount: number
  symbol: string
}

interface SupplyPositionsProps {
  isLoading: boolean
  isDemoMode: boolean
  enrichedAssetCards: AssetCardData[]
  backstopPositions: BackstopPositionData[]
  blendSnapshot: { positions: BlendPosition[] } | null | undefined
  onPoolClick?: (poolId: string, poolName: string) => void
}

export function SupplyPositions({
  isLoading,
  isDemoMode,
  enrichedAssetCards,
  backstopPositions,
  blendSnapshot,
  onPoolClick,
}: SupplyPositionsProps) {
  if (isLoading && !isDemoMode) {
    return (
      <div className="grid gap-4 grid-cols-1">
        {[...Array(2)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[...Array(3)].map((_, j) => (
                  <div key={j} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    </div>
                    <Skeleton className="h-6 w-20" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (isDemoMode) {
    return (
      <div className="grid gap-4 grid-cols-1">
        {DEMO_SUPPLY_POSITIONS.map((pool) => (
          <Card key={pool.id} className="py-2 gap-0">
            <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
              <CardTitle>{pool.poolName} Pool</CardTitle>
              <Link
                href="#"
                className="text-muted-foreground hover:text-foreground transition-colors"
                onClick={(e) => e.preventDefault()}
              >
                <ChevronRight className="h-5 w-5" />
              </Link>
            </CardHeader>
            <CardContent className="px-4 pt-0 pb-1">
              <div className="space-y-1">
                {pool.assets.map((asset) => {
                  const yieldFormatter = new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                    signDisplay: "always",
                  })
                  const formattedYield = yieldFormatter.format(asset.earnedYield)
                  const hasSignificantYield = Math.abs(asset.earnedYield) >= 0.01
                  const formattedYieldPercentage = asset.yieldPercentage !== 0 ? ` (${asset.yieldPercentage >= 0 ? '+' : ''}${asset.yieldPercentage.toFixed(2)}%)` : ''
                  const isUSDC = asset.symbol === 'USDC'

                  return (
                    <div key={asset.id} className="flex items-center justify-between py-2 gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <TokenLogo
                          src={asset.logoUrl}
                          symbol={asset.assetName}
                          size={40}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{asset.assetName}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {isUSDC ? (
                              formatUsdAmount(asset.rawBalance)
                            ) : (
                              <>
                                {formatUsdAmount(asset.rawBalance)}
                                <span className="text-xs ml-1">
                                  ({formatAmount(asset.tokenAmount)} {asset.symbol})
                                </span>
                              </>
                            )}
                          </p>
                          {hasSignificantYield && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400">
                              {formattedYield} yield{formattedYieldPercentage}
                            </p>
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

                {/* Demo Backstop Position */}
                {pool.backstop && (
                  <div className="flex items-center justify-between py-2 gap-3 border-t border-border/50 mt-2 pt-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                        <Shield className="h-5 w-5 text-purple-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">Backstop</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {formatUsdAmount(pool.backstop.lpTokensUsd)}
                          <span className="text-xs ml-1">
                            ({formatAmount(pool.backstop.lpTokens, 2)} LP)
                          </span>
                        </p>
                        {(() => {
                          const lpTokenPrice = pool.backstop.lpTokens > 0
                            ? pool.backstop.lpTokensUsd / pool.backstop.lpTokens
                            : 0
                          const yieldUsd = pool.backstop.yieldLp * lpTokenPrice
                          const yieldFormatter = new Intl.NumberFormat("en-US", {
                            style: "currency",
                            currency: "USD",
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                            signDisplay: "always",
                          })
                          const formattedYieldPercentage = pool.backstop.yieldPercent !== 0
                            ? ` (${pool.backstop.yieldPercent >= 0 ? '+' : ''}${pool.backstop.yieldPercent.toFixed(2)}%)`
                            : ''
                          return (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400">
                              {yieldFormatter.format(yieldUsd)} yield{formattedYieldPercentage}
                            </p>
                          )
                        })()}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 items-start shrink-0 w-[110px]">
                      {pool.backstop.interestApr > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          <TrendingUp className="mr-1 h-3 w-3" />
                          {pool.backstop.interestApr.toFixed(2)}% APR
                        </Badge>
                      )}
                      {pool.backstop.emissionApy > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          <Flame className="mr-1 h-3 w-3" />
                          {pool.backstop.emissionApy.toFixed(2)}% BLND
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
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
                    const yieldFormatter = new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                      signDisplay: "always",
                    })
                    const yieldToShow = asset.earnedYield ?? 0
                    const formattedYield = yieldFormatter.format(yieldToShow)
                    const hasSignificantYield = Math.abs(yieldToShow) >= 0.01
                    const yieldPercentage = asset.yieldPercentage ?? 0
                    const formattedYieldPercentage = yieldPercentage !== 0 ? ` (${yieldPercentage >= 0 ? '+' : ''}${yieldPercentage.toFixed(2)}%)` : ''

                    // Find the corresponding position to get token amount
                    const position = blendSnapshot?.positions.find(p => p.id === asset.id)
                    const tokenAmount = position?.supplyAmount || 0
                    const symbol = position?.symbol || asset.assetName
                    const isUSDC = symbol === 'USDC'

                    return (
                      <div key={asset.id} className="flex items-center justify-between py-2 gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <TokenLogo
                            src={asset.logoUrl}
                            symbol={asset.assetName}
                            size={40}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{asset.assetName}</p>
                            <p className="text-sm text-muted-foreground truncate">
                              {isUSDC ? (
                                formatUsdAmount(asset.rawBalance)
                              ) : (
                                <>
                                  {formatUsdAmount(asset.rawBalance)}
                                  <span className="text-xs ml-1">
                                    ({formatAmount(tokenAmount)} {symbol})
                                  </span>
                                </>
                              )}
                            </p>
                            {hasSignificantYield && (
                              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                {formattedYield} yield{formattedYieldPercentage}
                              </p>
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
                    const q4wExpDate = backstopPosition.q4wExpiration && backstopPosition.q4wExpiration > 0
                      ? new Date(backstopPosition.q4wExpiration * 1000)
                      : null
                    const isQ4wExpired = q4wExpDate && q4wExpDate <= new Date()
                    // Format as "Xd Yh" (no minutes on home page)
                    const timeRemaining = (() => {
                      if (!q4wExpDate) return null
                      const diff = q4wExpDate.getTime() - Date.now()
                      if (diff <= 0) return "0d 0h"
                      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
                      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
                      if (days > 0) return `${days}d ${hours}h`
                      return `${hours}h`
                    })()

                    return (
                      <div key={`backstop-${poolId}`} className="flex items-center justify-between py-2 gap-3 border-t border-border/50 mt-2 pt-3">
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
                              const yieldFormatter = new Intl.NumberFormat("en-US", {
                                style: "currency",
                                currency: "USD",
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                                signDisplay: "always",
                              })
                              const formattedYieldPercentage = backstopPosition.yieldPercent !== 0
                                ? ` (${backstopPosition.yieldPercent >= 0 ? '+' : ''}${backstopPosition.yieldPercent.toFixed(2)}%)`
                                : ''
                              return (
                                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                  {yieldFormatter.format(yieldUsd)} yield{formattedYieldPercentage}
                                </p>
                              )
                            })()}
                            {hasQ4w && (
                              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {isQ4wExpired
                                  ? `${formatAmount(backstopPosition.q4wLpTokens, 2)} LP ready to withdraw`
                                  : timeRemaining
                                    ? `${formatAmount(backstopPosition.q4wLpTokens, 2)} LP unlocks in ${timeRemaining}`
                                    : `${formatAmount(backstopPosition.q4wLpTokens, 2)} LP queued for withdrawal`
                                }
                              </p>
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
  if (!isLoading && !isDemoMode) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No positions found for this wallet.</p>
        <p className="text-sm mt-2">
          Start by depositing assets to Blend pools.
        </p>
      </div>
    )
  }

  return null
}
