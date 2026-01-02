"use client"

import { TrendingUp, Flame, Shield } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import type { BackstopExploreItem, SortBy } from "@/types/explore"

interface BackstopResultsProps {
  items: BackstopExploreItem[]
  isLoading: boolean
  sortBy: SortBy
}

function formatApy(value: number): string {
  return `${value.toFixed(2)}%`
}

function sortItems(items: BackstopExploreItem[], sortBy: SortBy): BackstopExploreItem[] {
  return [...items].sort((a, b) => {
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

function BackstopRow({ item, sortBy }: { item: BackstopExploreItem; sortBy: SortBy }) {
  const blendUrl = `https://mainnet.blend.capital/backstop/?poolId=${item.poolId}`

  return (
    <a
      href={blendUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between py-3 px-4 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-b-0"
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
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{item.poolName}</p>
          <p className="text-sm text-muted-foreground">Backstop</p>
        </div>
      </div>

      {/* Right side: APY badges */}
      <div className="flex flex-col gap-1 items-end shrink-0">
        <Badge
          variant="secondary"
          className={`text-xs font-medium ${sortBy === "total" ? "bg-white/20" : ""}`}
        >
          {formatApy(item.totalApy)} Total
        </Badge>
        <div className="flex gap-1">
          {item.interestApr > 0.005 && (
            <Badge
              variant="secondary"
              className={`text-xs ${sortBy === "apy" ? "bg-white/20" : ""}`}
            >
              <TrendingUp className="mr-1 h-3 w-3" />
              {formatApy(item.interestApr)}
            </Badge>
          )}
          {item.emissionApy > 0.005 && (
            <Badge
              variant="secondary"
              className={`text-xs ${sortBy === "blnd" ? "bg-white/20" : ""}`}
            >
              <Flame className="mr-1 h-3 w-3" />
              {formatApy(item.emissionApy)}
            </Badge>
          )}
        </div>
      </div>
    </a>
  )
}

function BackstopRowSkeleton() {
  return (
    <div className="flex items-center justify-between py-3 px-4 border-b border-border/50 last:border-b-0">
      <div className="flex items-center gap-3">
        <Skeleton className="w-9 h-9 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <div className="flex flex-col gap-1 items-end">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-20" />
      </div>
    </div>
  )
}

export function BackstopResults({ items, isLoading, sortBy }: BackstopResultsProps) {
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
            <BackstopRow key={item.poolId} item={item} sortBy={sortBy} />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
