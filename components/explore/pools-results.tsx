"use client"

import { useState } from "react"
import { ArrowUpRight, ArrowDownLeft, ChevronDown, ChevronUp } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { TokenLogo } from "@/components/token-logo"
import type { PoolExploreItem, PoolTokenItem } from "@/types/explore"

interface PoolsResultsProps {
  items: PoolExploreItem[]
  isLoading: boolean
}

const ASSET_LOGO_MAP: Record<string, string> = {
  USDC: "/tokens/usdc.png",
  USDT: "/tokens/usdc.png",
  XLM: "/tokens/xlm.png",
  AQUA: "/tokens/aqua.png",
  EURC: "/tokens/eurc.png",
  CETES: "/tokens/cetes.png",
  USDGLO: "/tokens/usdglo.png",
  USTRY: "/tokens/ustry.png",
  BLND: "/tokens/blnd.png",
}

function resolveAssetLogo(symbol: string): string {
  const normalized = symbol.toUpperCase()
  return ASSET_LOGO_MAP[normalized] ?? `/tokens/${symbol.toLowerCase()}.png`
}

function formatUsdCompact(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—"
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}K`
  }
  return `$${value.toFixed(2)}`
}

function formatUsdFull(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—"
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatChange(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 0.01) return ""
  const absValue = Math.abs(value)
  const sign = value >= 0 ? "+" : "-"
  if (absValue >= 1_000_000) {
    return `${sign}$${(absValue / 1_000_000).toFixed(2)}M`
  }
  if (absValue >= 1_000) {
    return `${sign}$${(absValue / 1_000).toFixed(2)}K`
  }
  return `${sign}$${absValue.toFixed(2)}`
}

function TokenRow({ token }: { token: PoolTokenItem }) {
  const logoUrl = resolveAssetLogo(token.tokenSymbol)

  return (
    <div className="flex items-center justify-between py-2 px-3 sm:px-4 bg-muted/30">
      <div className="flex items-center gap-2">
        <TokenLogo src={logoUrl} symbol={token.tokenSymbol} size={20} />
        <span className="text-xs font-medium">{token.tokenSymbol}</span>
      </div>
      <div className="flex items-center gap-2 sm:gap-4 mr-5">
        <div className="min-w-[80px] sm:min-w-[90px]">
          <div className="flex items-center gap-1">
            <ArrowUpRight className="h-2.5 w-2.5 text-green-500" />
            <span className="text-xs font-medium">{formatUsdCompact(token.totalSupplied)}</span>
          </div>
        </div>
        <div className="min-w-[80px] sm:min-w-[90px]">
          <div className="flex items-center gap-1">
            <ArrowDownLeft className="h-2.5 w-2.5 text-orange-500" />
            <span className="text-xs font-medium">{formatUsdCompact(token.totalBorrowed)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function PoolRow({ item }: { item: PoolExploreItem }) {
  const [isExpanded, setIsExpanded] = useState(false)

  const supplyChange = formatChange(item.supplyChange24h)
  const borrowChange = formatChange(item.borrowChange24h)

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between py-3 px-3 sm:px-4 hover:bg-muted/50 transition-colors"
      >
        {/* Left side: Pool info */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="min-w-0 flex-1 text-left">
            <p className="font-medium truncate text-sm sm:text-base">{item.poolName}</p>
          </div>
        </div>

        {/* Right side: TVL and Borrow */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          {/* TVL */}
          <div className="text-right min-w-[80px] sm:min-w-[90px]">
            <div className="flex items-center justify-end gap-1">
              <ArrowUpRight className="h-3 w-3 text-green-500" />
              <span className="font-medium text-sm">{formatUsdCompact(item.totalTvl)}</span>
            </div>
            {supplyChange && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="text-xs text-muted-foreground cursor-default">
                    {supplyChange}
                  </p>
                </TooltipTrigger>
                <TooltipContent>24h change</TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Borrowed */}
          <div className="text-right min-w-[80px] sm:min-w-[90px]">
            <div className="flex items-center justify-end gap-1">
              <ArrowDownLeft className="h-3 w-3 text-orange-500" />
              <span className="font-medium text-sm">{formatUsdCompact(item.totalBorrowed)}</span>
            </div>
            {borrowChange && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="text-xs text-muted-foreground cursor-default">
                    {borrowChange}
                  </p>
                </TooltipTrigger>
                <TooltipContent>24h change</TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Chevron */}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground ml-1" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground ml-1" />
          )}
        </div>
      </button>

      {/* Expanded tokens list */}
      {isExpanded && (
        <div className="border-t border-border/30">
          {item.tokens.map((token) => (
            <TokenRow key={token.assetAddress} token={token} />
          ))}
        </div>
      )}
    </div>
  )
}

function PoolRowSkeleton() {
  return (
    <div className="flex items-center justify-between py-3 px-3 sm:px-4 border-b border-border/50 last:border-b-0">
      <Skeleton className="h-4 w-24" />
      <div className="flex items-center gap-2 sm:gap-4">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-4 w-4" />
      </div>
    </div>
  )
}

function TotalsSummary({ items, isLoading }: { items: PoolExploreItem[]; isLoading: boolean }) {
  const totalTvl = items.reduce((sum, item) => sum + item.totalTvl, 0)
  const totalBorrowed = items.reduce((sum, item) => sum + item.totalBorrowed, 0)
  const totalSupplyChange = items.reduce((sum, item) => sum + item.supplyChange24h, 0)
  const totalBorrowChange = items.reduce((sum, item) => sum + item.borrowChange24h, 0)

  const supplyChangeStr = formatChange(totalSupplyChange)
  const borrowChangeStr = formatChange(totalBorrowChange)

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <Skeleton className="h-4 w-16 mb-2" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-4 w-16 mt-1" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <Skeleton className="h-4 w-20 mb-2" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-4 w-16 mt-1" />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground mb-1">
            <ArrowUpRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500" />
            Total TVL
          </div>
          <p className="text-lg sm:text-2xl font-bold">{formatUsdFull(totalTvl)}</p>
          {supplyChangeStr && (
            <p className="text-xs sm:text-sm text-muted-foreground">
              {supplyChangeStr} (24h)
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground mb-1">
            <ArrowDownLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-orange-500" />
            Total Borrowed
          </div>
          <p className="text-lg sm:text-2xl font-bold">{formatUsdFull(totalBorrowed)}</p>
          {borrowChangeStr && (
            <p className="text-xs sm:text-sm text-muted-foreground">
              {borrowChangeStr} (24h)
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function PoolsResults({ items, isLoading }: PoolsResultsProps) {
  return (
    <div>
      <TotalsSummary items={items} isLoading={isLoading} />

      <h2 className="text-lg font-semibold mb-3">Pools by TVL</h2>

      {isLoading ? (
        <Card className="py-0">
          <CardContent className="p-0">
            {Array.from({ length: 4 }).map((_, i) => (
              <PoolRowSkeleton key={i} />
            ))}
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No pools found
        </div>
      ) : (
        <Card className="py-0">
          <CardContent className="p-0">
            {items.map((item) => (
              <PoolRow key={item.poolId} item={item} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
