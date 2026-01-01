"use client"

import { ExternalLink, TrendingUp, Flame } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { TokenLogo } from "@/components/token-logo"
import type { SupplyExploreItem, SortBy } from "@/types/explore"

interface SupplyResultsProps {
  items: SupplyExploreItem[]
  isLoading: boolean
  sortBy: SortBy
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

function formatApy(value: number | null): string {
  if (value === null) return "—"
  return `${value.toFixed(2)}%`
}

function getTotalApy(item: SupplyExploreItem): number {
  return (item.supplyApy ?? 0) + (item.blndApy ?? 0)
}

function sortItems(items: SupplyExploreItem[], sortBy: SortBy): SupplyExploreItem[] {
  return [...items].sort((a, b) => {
    switch (sortBy) {
      case "apy":
        return (b.supplyApy ?? 0) - (a.supplyApy ?? 0)
      case "blnd":
        return (b.blndApy ?? 0) - (a.blndApy ?? 0)
      case "total":
      default:
        return getTotalApy(b) - getTotalApy(a)
    }
  })
}

function SupplyRow({ item }: { item: SupplyExploreItem }) {
  const blendUrl = `https://mainnet.blend.capital/supply/?poolId=${item.poolId}&assetId=${item.assetAddress}`
  const logoUrl = resolveAssetLogo(item.tokenSymbol)

  return (
    <a
      href={blendUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between py-3 px-4 hover:bg-muted/50 transition-colors group border-b border-border/50 last:border-b-0"
    >
      {/* Left side: Token info */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <TokenLogo
          src={logoUrl}
          symbol={item.tokenSymbol}
          size={36}
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{item.tokenSymbol}</p>
          <p className="text-sm text-muted-foreground truncate">
            {item.poolName}
          </p>
        </div>
      </div>

      {/* Right side: APY badges */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex flex-col gap-1 items-end">
          <Badge variant="default" className="text-xs font-semibold">
            {formatApy(getTotalApy(item))} Total
          </Badge>
          <div className="flex gap-1">
            {item.supplyApy !== null && (
              <Badge variant="secondary" className="text-xs">
                <TrendingUp className="mr-1 h-3 w-3" />
                {formatApy(item.supplyApy)}
              </Badge>
            )}
            {item.blndApy !== null && item.blndApy > 0.005 && (
              <Badge variant="secondary" className="text-xs">
                <Flame className="mr-1 h-3 w-3" />
                {formatApy(item.blndApy)}
              </Badge>
            )}
          </div>
        </div>
        <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-2" />
      </div>
    </a>
  )
}

function SupplyRowSkeleton() {
  return (
    <div className="flex items-center justify-between py-3 px-4 border-b border-border/50 last:border-b-0">
      <div className="flex items-center gap-3">
        <Skeleton className="w-9 h-9 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="flex flex-col gap-1 items-end">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-20" />
      </div>
    </div>
  )
}

export function SupplyResults({ items, isLoading, sortBy }: SupplyResultsProps) {
  if (isLoading) {
    return (
      <Card className="py-0">
        <CardContent className="p-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <SupplyRowSkeleton key={i} />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No supply positions found
      </div>
    )
  }

  const sortedItems = sortItems(items, sortBy)

  return (
    <Card className="py-0">
      <CardContent className="p-0">
        {sortedItems.map((item) => (
          <SupplyRow
            key={`${item.poolId}-${item.assetAddress}`}
            item={item}
          />
        ))}
      </CardContent>
    </Card>
  )
}
