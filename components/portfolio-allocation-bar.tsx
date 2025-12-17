"use client"

import { useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { BlendReservePosition, BlendBackstopPosition } from "@/lib/blend/positions"

// Token colors - consistent color scheme for each token
const TOKEN_COLORS: Record<string, string> = {
  USDC: "#2775CA",   // USDC blue
  XLM: "#E5E5E5",    // Stellar off-white
  EURC: "#0052FF",   // Euro blue
  AQUA: "#00C2FF",   // Aqua cyan
  BLND: "#8B5CF6",   // Blend purple
  CETES: "#10B981",  // Green for CETES
  USDGLO: "#F59E0B", // Yellow for USDGLO
  USTRY: "#EF4444",  // Red for USTRY
  USDT: "#26A17B",   // Tether green
}

function getTokenColor(symbol: string): string {
  return TOKEN_COLORS[symbol.toUpperCase()] || "#6B7280" // Default gray
}

interface PortfolioAllocationBarProps {
  positions: BlendReservePosition[]
  backstopPositions: BlendBackstopPosition[]
  isLoading?: boolean
}

interface PoolAllocation {
  poolId: string
  poolName: string
  totalValue: number
  percentage: number
  tokens: {
    symbol: string
    value: number
    percentage: number // percentage of total portfolio
  }[]
}

function formatPercentage(value: number): string {
  if (value < 1) return "<1%"
  return `${Math.round(value)}%`
}

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function PortfolioAllocationBar({
  positions,
  backstopPositions,
  isLoading = false,
}: PortfolioAllocationBarProps) {
  const { poolAllocations, totalValue } = useMemo(() => {
    // Group positions by pool
    const poolMap = new Map<string, PoolAllocation>()

    // Add regular positions
    for (const position of positions) {
      if (position.supplyUsdValue <= 0) continue

      const existing = poolMap.get(position.poolId)
      if (existing) {
        existing.totalValue += position.supplyUsdValue
        existing.tokens.push({
          symbol: position.symbol,
          value: position.supplyUsdValue,
          percentage: 0, // Will calculate later
        })
      } else {
        poolMap.set(position.poolId, {
          poolId: position.poolId,
          poolName: position.poolName,
          totalValue: position.supplyUsdValue,
          percentage: 0,
          tokens: [{
            symbol: position.symbol,
            value: position.supplyUsdValue,
            percentage: 0,
          }],
        })
      }
    }

    // Add backstop positions as "LP" token within each pool
    for (const bp of backstopPositions) {
      if (bp.lpTokensUsd <= 0) continue

      const existing = poolMap.get(bp.poolId)
      if (existing) {
        existing.totalValue += bp.lpTokensUsd
        existing.tokens.push({
          symbol: "LP",
          value: bp.lpTokensUsd,
          percentage: 0,
        })
      } else {
        poolMap.set(bp.poolId, {
          poolId: bp.poolId,
          poolName: bp.poolName,
          totalValue: bp.lpTokensUsd,
          percentage: 0,
          tokens: [{
            symbol: "LP",
            value: bp.lpTokensUsd,
            percentage: 0,
          }],
        })
      }
    }

    // Calculate total
    let total = 0
    for (const pool of poolMap.values()) {
      total += pool.totalValue
    }

    // Calculate percentages
    for (const pool of poolMap.values()) {
      pool.percentage = total > 0 ? (pool.totalValue / total) * 100 : 0
      for (const token of pool.tokens) {
        token.percentage = total > 0 ? (token.value / total) * 100 : 0
      }
    }

    // Sort pools by value descending
    const allocations = Array.from(poolMap.values()).sort(
      (a, b) => b.totalValue - a.totalValue
    )

    return { poolAllocations: allocations, totalValue: total }
  }, [positions, backstopPositions])

  // Show skeleton while loading
  if (isLoading) {
    return (
      <Card className="p-4 gap-0">
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-2 w-full rounded-sm" />
      </Card>
    )
  }

  // Don't show if empty or only a single token in a single pool
  // (allocation bar is only useful when there's diversity to show)
  const hasSingleTokenInSinglePool = poolAllocations.length === 1 && poolAllocations[0].tokens.length === 1

  if (poolAllocations.length === 0 || hasSingleTokenInSinglePool) {
    return null
  }

  // Build flat list of all token segments for the bar
  const tokenSegments: {
    poolId: string
    poolName: string
    symbol: string
    value: number
    percentage: number
    color: string
  }[] = []

  for (const pool of poolAllocations) {
    // Sort tokens within pool by value descending
    const sortedTokens = [...pool.tokens].sort((a, b) => b.value - a.value)
    for (const token of sortedTokens) {
      tokenSegments.push({
        poolId: pool.poolId,
        poolName: pool.poolName,
        symbol: token.symbol,
        value: token.value,
        percentage: token.percentage,
        color: token.symbol === "LP" ? "#8B5CF6" : getTokenColor(token.symbol),
      })
    }
  }

  // Calculate pool boundary positions (for the gray line)
  let cumulative = 0
  const poolBoundaries = poolAllocations.map((pool) => {
    const start = cumulative
    cumulative += pool.percentage
    return {
      poolId: pool.poolId,
      poolName: pool.poolName,
      percentage: pool.percentage,
      start,
      end: cumulative,
    }
  })

  return (
    <Card className="p-4 gap-0">
      <TooltipProvider>
        {/* Pool labels row */}
        <div className="relative h-5 mb-1">
          {poolBoundaries.map((pool, index) => {
            const poolData = poolAllocations.find(p => p.poolId === pool.poolId)

            if (pool.percentage >= 15) {
              return (
                <div
                  key={pool.poolId}
                  className="absolute text-xs text-muted-foreground truncate"
                  style={{
                    left: `${pool.start}%`,
                    width: `${pool.percentage}%`,
                    paddingLeft: index === 0 ? 0 : 4,
                  }}
                >
                  <span className="font-medium">{pool.poolName}</span>
                  <span className="ml-1 opacity-70">{formatPercentage(pool.percentage)}</span>
                </div>
              )
            }

            // Show a small gray circle for pools with hidden labels
            return (
              <Tooltip key={pool.poolId}>
                <TooltipTrigger asChild>
                  <div
                    className="absolute flex items-end cursor-pointer h-full"
                    style={{
                      left: `${pool.start}%`,
                      width: `${pool.percentage}%`,
                      paddingLeft: index === 0 ? 0 : 4,
                      paddingBottom: 2,
                    }}
                  >
                    <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="bg-black text-white border-black" arrowClassName="bg-black fill-black">
                  <div className="text-sm">
                    <div className="font-medium">{pool.poolName}</div>
                    <div className="text-gray-400">{formatPercentage(pool.percentage)} of portfolio</div>
                    {poolData && <div className="mt-1">{formatUsd(poolData.totalValue)}</div>}
                  </div>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>

        {/* Pool separator line (gray) */}
        <div className="relative h-0.5 bg-muted rounded-sm mb-1">
          {poolBoundaries.map((pool, index) => (
            <div
              key={pool.poolId}
              className="absolute h-full"
              style={{
                left: `${pool.start}%`,
                width: `${pool.percentage}%`,
                borderLeft: index > 0 ? "2px solid var(--background)" : undefined,
              }}
            />
          ))}
          {/* Pool boundary markers */}
          {poolBoundaries.slice(1).map((pool) => (
            <div
              key={`marker-${pool.poolId}`}
              className="absolute h-2 w-px bg-muted-foreground/50 -top-0.5"
              style={{ left: `${pool.start}%` }}
            />
          ))}
        </div>

        {/* Token allocation bar */}
        <div className="relative h-2 flex rounded-sm overflow-hidden">
          {tokenSegments.map((segment, index) => {
            // Check if this is a pool boundary (first token of a new pool)
            const isPoolBoundary = index > 0 && segment.poolId !== tokenSegments[index - 1].poolId

            return (
              <Tooltip key={`${segment.poolId}-${segment.symbol}-${index}`}>
                <TooltipTrigger asChild>
                  <div
                    className="h-full transition-opacity hover:opacity-80 cursor-pointer"
                    style={{
                      width: `${segment.percentage}%`,
                      backgroundColor: segment.color,
                      borderLeft: isPoolBoundary ? "2px solid var(--background)" : undefined,
                      minWidth: segment.percentage > 0 ? 2 : 0,
                    }}
                  />
                </TooltipTrigger>
                <TooltipContent className="bg-black text-white border-black" arrowClassName="bg-black fill-black">
                  <div className="text-sm">
                    <div className="flex items-center gap-1.5 font-medium">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: segment.color }}
                      />
                      {segment.symbol}
                    </div>
                    <div className="text-gray-400">{segment.poolName}</div>
                    <div className="mt-1">
                      {formatUsd(segment.value)} ({formatPercentage(segment.percentage)})
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs">
          {/* Get unique tokens */}
          {Array.from(new Set(tokenSegments.map(s => s.symbol))).map(symbol => (
            <div key={symbol} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: symbol === "LP" ? "#8B5CF6" : getTokenColor(symbol) }}
              />
              <span className="text-muted-foreground">{symbol}</span>
            </div>
          ))}
        </div>
      </TooltipProvider>
    </Card>
  )
}
