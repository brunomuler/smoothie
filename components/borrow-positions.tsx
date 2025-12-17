"use client"

import Link from "next/link"
import { TokenLogo } from "@/components/token-logo"
import { formatAmount } from "@/lib/format-utils"
import { DEMO_BORROW_POSITIONS } from "@/lib/demo-data"
import { useCurrencyPreference } from "@/hooks/use-currency-preference"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingDown, ChevronRight, Flame } from "lucide-react"
import type { AssetCardData } from "@/types/asset-card"

interface BlendPosition {
  id: string
  poolId: string
  poolName: string
  symbol: string
  borrowAmount: number
  borrowUsdValue: number
  borrowApy: number
  borrowBlndApy: number
  price?: { usdPrice?: number } | null
}

interface BorrowPositionsProps {
  isDemoMode: boolean
  blendSnapshot: { positions: BlendPosition[] } | null | undefined
  enrichedAssetCards: AssetCardData[]
  poolAssetBorrowCostBasisMap: Map<string, number>
  onPoolClick?: (poolId: string, poolName: string) => void
}

export function BorrowPositions({
  isDemoMode,
  blendSnapshot,
  enrichedAssetCards,
  poolAssetBorrowCostBasisMap,
  onPoolClick,
}: BorrowPositionsProps) {
  const { format: formatInCurrency } = useCurrencyPreference()

  const formatUsdAmount = (value: number) => {
    return formatInCurrency(value, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  const formatInterestValue = (value: number) => {
    return formatInCurrency(value, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay: "always",
    })
  }

  if (isDemoMode) {
    return (
      <div className="grid gap-4 grid-cols-1">
        {DEMO_BORROW_POSITIONS.map((pool) => (
          <Card key={pool.poolId} className="py-2 gap-0">
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
                {pool.positions.map((position) => {
                  const isUSDC = position.symbol === 'USDC'
                  const formattedInterest = formatInterestValue(position.interestAccrued)
                  const hasSignificantInterest = Math.abs(position.interestAccrued) >= 0.01
                  const formattedInterestPercentage = position.interestPercentage !== 0 ? ` (${position.interestPercentage >= 0 ? '+' : ''}${position.interestPercentage.toFixed(2)}%)` : ''

                  return (
                    <div key={position.id} className="flex items-center justify-between py-2 gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <TokenLogo
                          src={position.logoUrl}
                          symbol={position.symbol}
                          size={40}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{position.symbol}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {isUSDC ? (
                              formatUsdAmount(position.borrowUsdValue)
                            ) : (
                              <>
                                {formatUsdAmount(position.borrowUsdValue)}
                                <span className="text-xs ml-1">
                                  ({formatAmount(position.borrowAmount)} {position.symbol})
                                </span>
                              </>
                            )}
                          </p>
                          {hasSignificantInterest && (
                            <p className="text-xs text-orange-600 dark:text-orange-400">
                              {formattedInterest} interest{formattedInterestPercentage}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 items-start shrink-0 w-[110px]">
                        <Badge variant="secondary" className="text-xs">
                          <TrendingDown className="mr-1 h-3 w-3" />
                          {position.borrowApy.toFixed(2)}% APY
                        </Badge>
                        {position.borrowBlndApy > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            <Flame className="mr-1 h-3 w-3" />
                            {position.borrowBlndApy.toFixed(2)}% BLND
                          </Badge>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (blendSnapshot && blendSnapshot.positions.some(pos => pos.borrowUsdValue > 0)) {
    // Group borrow positions by pool
    const poolMap = blendSnapshot.positions
      .filter(pos => pos.borrowUsdValue > 0)
      .reduce((acc, position) => {
        const poolId = position.poolId
        const poolName = position.poolName

        if (!acc[poolId]) {
          acc[poolId] = {
            poolName,
            positions: []
          }
        }
        acc[poolId].positions.push(position)
        return acc
      }, {} as Record<string, { poolName: string; positions: BlendPosition[] }>)

    return (
      <div className="grid gap-4 grid-cols-1">
        {Object.entries(poolMap).map(([poolId, { poolName, positions }]) => {
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
                  {positions.map((position) => {
                    // Find the matching asset card to get the correct logoUrl
                    const matchingAsset = enrichedAssetCards.find(asset => asset.id === position.id)
                    const logoUrl = matchingAsset?.logoUrl || `/tokens/${position.symbol.toLowerCase()}.png`
                    const isUSDC = position.symbol === 'USDC'

                    // Calculate interest accrued similar to position yield calculation
                    const compositeKey = position.id // poolId-assetAddress
                    const borrowCostBasisTokens = poolAssetBorrowCostBasisMap.get(compositeKey) || 0
                    const usdPrice = position.price?.usdPrice || 1
                    const borrowCostBasisUsd = borrowCostBasisTokens * usdPrice
                    const currentDebtUsd = position.borrowUsdValue
                    const interestAccrued = currentDebtUsd - borrowCostBasisUsd
                    const interestPercentage = borrowCostBasisUsd > 0
                      ? (interestAccrued / borrowCostBasisUsd) * 100
                      : 0

                    // Format interest using currency preference
                    const formattedInterest = formatInterestValue(interestAccrued)
                    const hasSignificantInterest = Math.abs(interestAccrued) >= 0.01
                    const formattedInterestPercentage = interestPercentage !== 0 ? ` (${interestPercentage >= 0 ? '+' : ''}${interestPercentage.toFixed(2)}%)` : ''

                    return (
                      <div key={position.id} className="flex items-center justify-between py-2 gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <TokenLogo
                            src={logoUrl}
                            symbol={position.symbol}
                            size={40}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{position.symbol}</p>
                            <p className="text-sm text-muted-foreground truncate">
                              {isUSDC ? (
                                formatUsdAmount(position.borrowUsdValue)
                              ) : (
                                <>
                                  {formatUsdAmount(position.borrowUsdValue)}
                                  <span className="text-xs ml-1">
                                    ({formatAmount(position.borrowAmount)} {position.symbol})
                                  </span>
                                </>
                              )}
                            </p>
                            {hasSignificantInterest && (
                              <p className="text-xs text-orange-600 dark:text-orange-400">
                                {formattedInterest} interest{formattedInterestPercentage}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 items-start shrink-0 w-[110px]">
                          <Badge variant="secondary" className="text-xs">
                            <TrendingDown className="mr-1 h-3 w-3" />
                            {position.borrowApy.toFixed(2)}% APY
                          </Badge>
                          {position.borrowBlndApy > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              <Flame className="mr-1 h-3 w-3" />
                              {position.borrowBlndApy.toFixed(2)}% BLND
                            </Badge>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    )
  }

  // Empty state
  return (
    <div className="text-center py-8 text-muted-foreground">
      <p>No borrows found for this wallet.</p>
    </div>
  )
}
