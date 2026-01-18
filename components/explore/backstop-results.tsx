"use client"

import { useState } from "react"
import { TrendingUp, Flame, Shield, ArrowUpRight, Clock, ChevronDown, ChevronUp } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { BackstopApySparkline } from "@/components/backstop-apy-sparkline"
import { BlndApySparkline } from "@/components/blnd-apy-sparkline"
import { LpPriceSparkline } from "@/components/lp-price-sparkline"
import type { BackstopExploreItem, SortBy, LpPriceDataPoint } from "@/types/explore"

interface BackstopResultsProps {
  items: BackstopExploreItem[]
  isLoading: boolean
  sortBy: SortBy
  lpTokenPrice: number | null
  lpPriceHistory: LpPriceDataPoint[]
}

function formatApy(value: number): string {
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

function sortItems(items: BackstopExploreItem[], sortBy: SortBy): BackstopExploreItem[] {
  return [...items].sort((a, b) => {
    // Apply 10k threshold: backstops with >=10k deposited ranked before backstops with <10k
    const aAboveThreshold = (a.totalDeposited ?? 0) >= 10000
    const bAboveThreshold = (b.totalDeposited ?? 0) >= 10000

    if (aAboveThreshold && !bAboveThreshold) return -1
    if (!aAboveThreshold && bAboveThreshold) return 1

    // Within the same threshold group, sort by the selected metric
    switch (sortBy) {
      case "apy":
        return b.interestApr - a.interestApr
      case "blnd":
        return b.emissionApy - a.emissionApy
      case "total":
      default:
        return b.totalApy - a.totalApy
    }
  })
}

function BackstopRowCharts({ item, lpTokenPrice, lpPriceHistory }: { item: BackstopExploreItem; lpTokenPrice: number | null; lpPriceHistory: LpPriceDataPoint[] }) {
  return (
    <div className="border-t border-border/30 bg-muted/10 px-4 py-4">
      <div className="space-y-3">
        {/* 6 month Interest APR */}
        <div className="bg-background/50 rounded-lg p-3 border border-border/30">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="h-3 w-3 text-emerald-500" />
            <span className="text-xs font-medium text-muted-foreground">Interest APR</span>
          </div>
          <BackstopApySparkline
            poolId={item.poolId}
            currentApy={item.interestApr}
            className="h-12 w-full"
          />
        </div>

        {/* 30 days BLND APY */}
        <div className="bg-background/50 rounded-lg p-3 border border-border/30">
          <div className="flex items-center gap-1.5 mb-2">
            <Flame className="h-3 w-3 text-purple-500" />
            <span className="text-xs font-medium text-muted-foreground">BLND Emissions</span>
          </div>
          <BlndApySparkline
            poolId={item.poolId}
            type="backstop"
            currentApy={item.emissionApy}
            className="h-12 w-full"
          />
        </div>

        {/* 6 months LP Token Price */}
        <div className="bg-background/50 rounded-lg p-3 border border-border/30">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="h-3 w-3 text-purple-400" />
            <span className="text-xs font-medium text-muted-foreground">LP Token Price</span>
          </div>
          <LpPriceSparkline currentPrice={lpTokenPrice ?? undefined} priceHistory={lpPriceHistory} className="h-12 w-full" />
        </div>

        {/* Link to Blend */}
        <a
          href={`https://mainnet.blend.capital/backstop/?poolId=${item.poolId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          Deposit on Blend Capital
          <ArrowUpRight className="h-3 w-3" />
        </a>
      </div>
    </div>
  )
}

function BackstopRow({ item, sortBy, lpTokenPrice, lpPriceHistory }: { item: BackstopExploreItem; sortBy: SortBy; lpTokenPrice: number | null; lpPriceHistory: LpPriceDataPoint[] }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between py-3 px-4 hover:bg-muted/50 transition-colors"
      >
        {/* Left side: Pool info */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {item.iconUrl ? (
            <img
              src={item.iconUrl}
              alt={item.poolName}
              className="w-9 h-9 rounded-full"
            />
          ) : (
            <div className="h-9 w-9 rounded-full bg-purple-500/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-purple-500" />
            </div>
          )}
          <div className="min-w-0 flex-1 text-left">
            <p className="font-medium truncate">{item.poolName}</p>
            <p className="text-sm text-muted-foreground">Backstop</p>
            {(item.totalDeposited !== null || item.q4wPercent !== null) && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {item.totalDeposited !== null && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="inline-flex items-center gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                      >
                        <ArrowUpRight className="h-3 w-3 text-green-500" />
                        {formatUsdCompact(item.totalDeposited)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-xs">
                        <p className="font-medium">Deposited</p>
                        <p>{formatUsdFull(item.totalDeposited)}</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                )}
                {item.totalDeposited !== null && item.q4wPercent !== null && " · "}
                {item.q4wPercent !== null && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="inline-flex items-center gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                      >
                        <Clock className="h-3 w-3 text-purple-500" />
                        {item.q4wPercent.toFixed(1)}%
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-xs">
                        <p className="font-medium">Q4W</p>
                        <p>{item.q4wPercent.toFixed(2)}% · {formatUsdFull(item.totalQ4w)}</p>
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
              {formatApy(item.totalApy)} Total
            </Badge>
            {item.interestApr > 0.005 && (
              <Badge
                variant="secondary"
                className={`text-xs min-w-[90px] justify-center ${sortBy === "apy" ? "bg-white/20" : ""}`}
              >
                <TrendingUp className="mr-1 h-3 w-3" />
                {formatApy(item.interestApr)}
              </Badge>
            )}
            {item.emissionApy > 0.005 && (
              <Badge
                variant="secondary"
                className={`text-xs min-w-[90px] justify-center ${sortBy === "blnd" ? "bg-white/20" : ""}`}
              >
                <Flame className="mr-1 h-3 w-3" />
                {formatApy(item.emissionApy)}
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
      {isExpanded && <BackstopRowCharts item={item} lpTokenPrice={lpTokenPrice} lpPriceHistory={lpPriceHistory} />}
    </div>
  )
}

function BackstopRowSkeleton() {
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

export function BackstopResults({ items, isLoading, sortBy, lpTokenPrice, lpPriceHistory }: BackstopResultsProps) {
  if (isLoading) {
    return (
      <div>
        <h2 className="text-lg font-semibold mb-3">All Backstops</h2>
        <Card className="py-0">
          <CardContent className="p-0">
            {Array.from({ length: 3 }).map((_, i) => (
              <BackstopRowSkeleton key={i} />
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div>
        <h2 className="text-lg font-semibold mb-3">All Backstops</h2>
        <div className="text-center py-12 text-muted-foreground">
          No backstop positions found
        </div>
      </div>
    )
  }

  const sortedItems = sortItems(items, sortBy)

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">All Backstops</h2>
      <Card className="py-0">
        <CardContent className="p-0">
          {sortedItems.map((item) => (
            <BackstopRow key={item.poolId} item={item} sortBy={sortBy} lpTokenPrice={lpTokenPrice} lpPriceHistory={lpPriceHistory} />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
