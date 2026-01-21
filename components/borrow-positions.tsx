"use client"

import { memo, useMemo, useCallback } from "react"
import Link from "next/link"
import { TokenLogo } from "@/components/token-logo"
import { formatAmount } from "@/lib/format-utils"
import { useCurrencyPreference } from "@/hooks/use-currency-preference"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { TrendingDown, ChevronRight, Flame, Info } from "lucide-react"
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
  blendSnapshot: { positions: BlendPosition[] } | null | undefined
  enrichedAssetCards: AssetCardData[]
  poolAssetBorrowCostBasisMap: Map<string, number>
  onPoolClick?: (poolId: string, poolName: string) => void
}

// Memoized borrow position item to prevent unnecessary re-renders
interface BorrowPositionItemProps {
  position: BlendPosition
  logoUrl: string
  borrowCostBasisTokens: number
  formatUsdAmount: (value: number) => string
  formatInterestValue: (value: number) => string
}

const BorrowPositionItem = memo(function BorrowPositionItem({
  position,
  logoUrl,
  borrowCostBasisTokens,
  formatUsdAmount,
  formatInterestValue,
}: BorrowPositionItemProps) {
  const usdPrice = position.price?.usdPrice || 1
  const borrowCostBasisUsd = borrowCostBasisTokens * usdPrice
  const currentDebtUsd = position.borrowUsdValue

  // Only calculate interest if we have valid cost basis data
  // Without cost basis, we can't determine how much is original principal vs interest
  const hasCostBasisData = borrowCostBasisTokens > 0
  const interestAccrued = hasCostBasisData ? currentDebtUsd - borrowCostBasisUsd : 0
  const interestPercentage = hasCostBasisData && borrowCostBasisUsd > 0
    ? (interestAccrued / borrowCostBasisUsd) * 100
    : 0

  const currentDebtTokens = position.borrowAmount
  const interestTokens = hasCostBasisData ? currentDebtTokens - borrowCostBasisTokens : 0

  const formattedInterest = formatInterestValue(interestAccrued)
  const hasSignificantInterest = hasCostBasisData && Math.abs(interestAccrued) >= 0.01
  const formattedInterestPercentage = interestPercentage !== 0 ? ` (${interestPercentage >= 0 ? '+' : ''}${interestPercentage.toFixed(2)}%)` : ''

  return (
    <div className="flex items-center justify-between py-2 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <TokenLogo
          src={logoUrl}
          symbol={position.symbol}
          size={36}
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{position.symbol}</p>
          <p className="text-sm text-muted-foreground truncate">
            {formatUsdAmount(position.borrowUsdValue)}
            <span className="text-xs ml-1">
              ({formatAmount(position.borrowAmount)} {position.symbol})
            </span>
          </p>
          {hasSignificantInterest && (
            hasCostBasisData ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="text-xs text-orange-600 dark:text-orange-400 cursor-pointer flex items-center gap-1">
                    {formattedInterest} interest{formattedInterestPercentage}
                    <Info className="h-3 w-3" />
                  </p>
                </TooltipTrigger>
                <TooltipContent className="p-2.5">
                  <p className="font-semibold text-xs text-zinc-200 mb-2">Debt Breakdown</p>
                  <div className="space-y-1">
                    <div className="flex justify-between gap-6">
                      <span className="text-zinc-400">Original Borrowed</span>
                      <span className="text-zinc-300">
                        {formatAmount(borrowCostBasisTokens)} {position.symbol}
                      </span>
                    </div>
                    <div className="flex justify-between gap-6">
                      <span className="text-zinc-400">Interest Accrued</span>
                      <span className="text-orange-400">
                        +{formatAmount(interestTokens)} {position.symbol}
                      </span>
                    </div>
                    <div className="flex justify-between gap-6 border-t border-zinc-700 pt-1 mt-1">
                      <span className="text-zinc-300 font-medium">Total Owed</span>
                      <span className="text-zinc-300">
                        {formatAmount(currentDebtTokens)} {position.symbol}
                      </span>
                    </div>
                    <div className="flex justify-between gap-6 pt-1">
                      <span className="text-zinc-500 text-xs">At current price</span>
                      <span className="text-zinc-400 text-xs">
                        {formatUsdAmount(currentDebtUsd)}
                      </span>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            ) : (
              <p className="text-xs text-orange-600 dark:text-orange-400">
                {formattedInterest} interest{formattedInterestPercentage}
              </p>
            )
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
})

export function BorrowPositions({
  blendSnapshot,
  enrichedAssetCards,
  poolAssetBorrowCostBasisMap,
  onPoolClick,
}: BorrowPositionsProps) {
  const { format: formatInCurrency } = useCurrencyPreference()

  // Memoize format functions to prevent re-renders of child components
  const formatUsdAmount = useCallback((value: number) => {
    return formatInCurrency(value, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }, [formatInCurrency])

  const formatInterestValue = useCallback((value: number) => {
    return formatInCurrency(value, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay: "always",
    })
  }, [formatInCurrency])

  // Memoize pool grouping to avoid recomputation on every render
  const poolMap = useMemo(() => {
    if (!blendSnapshot) return null

    const positions = blendSnapshot.positions.filter(pos => pos.borrowUsdValue > 0)
    if (positions.length === 0) return null

    return positions.reduce((acc, position) => {
      const poolId = position.poolId
      const poolName = position.poolName

      if (!acc[poolId]) {
        acc[poolId] = { poolName, positions: [] }
      }
      acc[poolId].positions.push(position)
      return acc
    }, {} as Record<string, { poolName: string; positions: BlendPosition[] }>)
  }, [blendSnapshot])

  // Create a map for quick asset logo lookups
  const assetLogoMap = useMemo(() => {
    const map = new Map<string, string>()
    enrichedAssetCards.forEach(asset => {
      map.set(asset.id, asset.logoUrl)
    })
    return map
  }, [enrichedAssetCards])

  if (poolMap) {
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
                    const logoUrl = assetLogoMap.get(position.id) || `/tokens/${position.symbol.toLowerCase()}.png`
                    const borrowCostBasisTokens = poolAssetBorrowCostBasisMap.get(position.id) || 0

                    return (
                      <BorrowPositionItem
                        key={position.id}
                        position={position}
                        logoUrl={logoUrl}
                        borrowCostBasisTokens={borrowCostBasisTokens}
                        formatUsdAmount={formatUsdAmount}
                        formatInterestValue={formatInterestValue}
                      />
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
