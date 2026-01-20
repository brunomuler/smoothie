"use client"

import { useState } from "react"
import { TrendingUp, Flame, ArrowUpRight, ArrowDownLeft, ChevronDown, ChevronUp, Calculator } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { TokenLogo } from "@/components/token-logo"
import { ApySparkline } from "@/components/apy-sparkline"
import { BlndApySparkline } from "@/components/blnd-apy-sparkline"
import { TokenPriceSparkline } from "@/components/token-price-sparkline"
import { ApySimulatorContainer } from "@/components/apy-simulator"
import { DollarSign } from "lucide-react"
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

function formatTokens(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—"
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function getTotalApy(item: SupplyExploreItem): number {
  return (item.supplyApy ?? 0) + (item.blndApy ?? 0)
}

function sortItems(items: SupplyExploreItem[], sortBy: SortBy): SupplyExploreItem[] {
  return [...items].sort((a, b) => {
    // Apply 10k threshold: items with >=10k supplied ranked before items with <10k
    const aAboveThreshold = (a.totalSupplied ?? 0) >= 10000
    const bAboveThreshold = (b.totalSupplied ?? 0) >= 10000

    if (aAboveThreshold && !bAboveThreshold) return -1
    if (!aAboveThreshold && bAboveThreshold) return 1

    // Within the same threshold group, sort by the selected metric
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

function SupplyRowCharts({ item }: { item: SupplyExploreItem }) {
  const [simulatorOpen, setSimulatorOpen] = useState(false)

  return (
    <div className="border-t border-border/30 bg-muted/10 px-4 py-4">
      <div className="space-y-3">
        {/* 6 month Supply APY */}
        <div className="bg-background/50 rounded-lg p-3 border border-border/30">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="h-3 w-3 text-emerald-500" />
            <span className="text-xs font-medium text-muted-foreground">Supply APY</span>
          </div>
          <ApySparkline
            poolId={item.poolId}
            assetAddress={item.assetAddress}
            currentApy={item.supplyApy ?? undefined}
            className="h-12 w-full"
          />
        </div>

        {/* 30 days BLND APY - only show if has BLND emissions */}
        {item.blndApy !== null && item.blndApy > 0.005 && (
          <div className="bg-background/50 rounded-lg p-3 border border-border/30">
            <div className="flex items-center gap-1.5 mb-2">
              <Flame className="h-3 w-3 text-purple-500" />
              <span className="text-xs font-medium text-muted-foreground">BLND Emissions</span>
            </div>
            <BlndApySparkline
              poolId={item.poolId}
              type="lending_supply"
              assetAddress={item.assetAddress}
              currentApy={item.blndApy ?? undefined}
              className="h-12 w-full"
            />
          </div>
        )}

        {/* 6 month Token Price */}
        <div className="bg-background/50 rounded-lg p-3 border border-border/30">
          <div className="flex items-center gap-1.5 mb-2">
            <DollarSign className="h-3 w-3 text-blue-500" />
            <span className="text-xs font-medium text-muted-foreground">{item.tokenSymbol} Price</span>
          </div>
          <TokenPriceSparkline
            tokenAddress={item.assetAddress}
            tokenSymbol={item.tokenSymbol}
            className="h-12 w-full"
          />
        </div>

        {/* Action Links */}
        <div className="flex items-center gap-4">
          <a
            href={`https://mainnet.blend.capital/supply/?poolId=${item.poolId}&assetId=${item.assetAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Supply on Blend Capital
            <ArrowUpRight className="h-3 w-3" />
          </a>

          <button
            onClick={() => setSimulatorOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Calculator className="h-3 w-3" />
            Simulate APY
          </button>
        </div>
      </div>

      {/* APY Simulator Modal/Drawer */}
      <ApySimulatorContainer
        open={simulatorOpen}
        onOpenChange={setSimulatorOpen}
        poolId={item.poolId}
        poolName={item.poolName}
        assetId={item.assetAddress}
        tokenSymbol={item.tokenSymbol}
        initialData={{
          totalSupply: item.totalSupplied ?? 0,
          totalBorrow: item.totalBorrowed ?? 0,
          supplyApy: item.supplyApy ?? 0,
          blndApy: item.blndApy ?? 0,
        }}
      />
    </div>
  )
}

function SupplyRow({ item, sortBy }: { item: SupplyExploreItem; sortBy: SortBy }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const logoUrl = resolveAssetLogo(item.tokenSymbol)

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between py-3 px-4 hover:bg-muted/50 transition-colors"
      >
        {/* Left side: Token info */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <TokenLogo
            src={logoUrl}
            symbol={item.tokenSymbol}
            size={36}
          />
          <div className="min-w-0 flex-1 text-left">
            <p className="font-medium truncate">{item.tokenSymbol}</p>
            <p className="text-sm text-muted-foreground truncate">
              {item.poolName}
            </p>
            {(item.totalSupplied !== null || item.totalBorrowed !== null) && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {item.totalSupplied !== null && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="inline-flex items-center gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                      >
                        <ArrowUpRight className="h-3 w-3 text-green-500" />
                        {formatUsdCompact(item.totalSupplied)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-xs">
                        <p className="font-medium">Supplied</p>
                        <p>{formatUsdFull(item.totalSupplied)}</p>
                        <p className="text-muted-foreground">{formatTokens(item.totalSuppliedTokens)} {item.tokenSymbol}</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                )}
                {item.totalSupplied !== null && item.totalBorrowed !== null && item.totalBorrowed > 0 && " · "}
                {item.totalBorrowed !== null && item.totalBorrowed > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="inline-flex items-center gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                      >
                        <ArrowDownLeft className="h-3 w-3 text-orange-500" />
                        {formatUsdCompact(item.totalBorrowed)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-xs">
                        <p className="font-medium">Borrowed</p>
                        <p>{formatUsdFull(item.totalBorrowed)}</p>
                        <p className="text-muted-foreground">{formatTokens(item.totalBorrowedTokens)} {item.tokenSymbol}</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Right side: APY badges and chevron */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex flex-col gap-1 items-end">
            <Badge
              variant="secondary"
              className={`text-xs font-medium min-w-[90px] justify-center ${sortBy === "total" ? "bg-white/20" : ""}`}
            >
              {formatApy(getTotalApy(item))} Total
            </Badge>
            {item.supplyApy !== null && (
              <Badge
                variant="secondary"
                className={`text-xs min-w-[90px] justify-center ${sortBy === "apy" ? "bg-white/20" : ""}`}
              >
                <TrendingUp className="mr-1 h-3 w-3" />
                {formatApy(item.supplyApy)}
              </Badge>
            )}
            {item.blndApy !== null && item.blndApy > 0.005 && (
              <Badge
                variant="secondary"
                className={`text-xs min-w-[90px] justify-center ${sortBy === "blnd" ? "bg-white/20" : ""}`}
              >
                <Flame className="mr-1 h-3 w-3" />
                {formatApy(item.blndApy)}
              </Badge>
            )}
          </div>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground ml-1" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground ml-1" />
          )}
        </div>
      </button>

      {/* Expanded charts section */}
      {isExpanded && <SupplyRowCharts item={item} />}
    </div>
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
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex flex-col gap-1 items-end">
          <Skeleton className="h-5 w-[90px]" />
          <Skeleton className="h-5 w-[90px]" />
          <Skeleton className="h-5 w-[90px]" />
        </div>
        <Skeleton className="h-4 w-4 ml-1" />
      </div>
    </div>
  )
}

export function SupplyResults({ items, isLoading, sortBy }: SupplyResultsProps) {
  if (isLoading) {
    return (
      <div>
        <h2 className="text-lg font-semibold mb-3">All Pools</h2>
        <Card className="py-0">
          <CardContent className="p-0">
            {Array.from({ length: 6 }).map((_, i) => (
              <SupplyRowSkeleton key={i} />
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div>
        <h2 className="text-lg font-semibold mb-3">All Pools</h2>
        <div className="text-center py-12 text-muted-foreground">
          No supply positions found
        </div>
      </div>
    )
  }

  const sortedItems = sortItems(items, sortBy)

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">All Pools</h2>
      <Card className="py-0">
        <CardContent className="p-0">
          {sortedItems.map((item) => (
            <SupplyRow
              key={`${item.poolId}-${item.assetAddress}`}
              item={item}
              sortBy={sortBy}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
