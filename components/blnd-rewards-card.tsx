"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Flame, ChevronDown } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Skeleton } from "@/components/ui/skeleton"
import { useUserActions } from "@/hooks/use-user-actions"

interface BackstopPositionData {
  poolId: string
  poolName: string
  claimableBlnd?: number
}

interface BlndRewardsCardProps {
  publicKey: string
  pendingEmissions: number // Supply/borrow claimable BLND (total)
  backstopClaimableBlnd?: number // Backstop claimable BLND from SDK (usually 0 - SDK doesn't estimate)
  blndPrice: number | null
  blndPerLpToken?: number // For converting backstop LP to BLND
  blndApy?: number
  isLoading?: boolean
  // Per-pool data for table display
  perPoolEmissions?: Record<string, number> // poolId -> claimable BLND
  backstopPositions?: BackstopPositionData[] // Backstop positions with pool info
  poolNames?: Record<string, string> // poolId -> pool name (for supply/borrow positions)
}

function formatNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "0.00"
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "$0.00"
  return `$${formatNumber(value)}`
}

export function BlndRewardsCard({
  publicKey,
  pendingEmissions,
  backstopClaimableBlnd = 0,
  blndPrice,
  blndPerLpToken = 0,
  blndApy = 0,
  isLoading = false,
  perPoolEmissions = {},
  backstopPositions = [],
  poolNames = {},
}: BlndRewardsCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Fetch claim actions to calculate total claimed BLND from supply/borrow positions
  const { actions: claimActions, isLoading: actionsLoading } = useUserActions({
    publicKey,
    actionTypes: ["claim"],
    limit: 1000,
    enabled: !!publicKey,
    selectActionsOnly: true, // Only re-render when actions change
  })

  // Fetch backstop claimed LP data (also includes last_claim_date for estimating pending)
  const { data: backstopClaimsData, isLoading: backstopClaimsLoading } = useQuery({
    queryKey: ["claimed-blnd-backstop", publicKey],
    enabled: !!publicKey,
    queryFn: async () => {
      const response = await fetch(`/api/claimed-blnd?user=${encodeURIComponent(publicKey)}`)
      if (!response.ok) return { backstop_claims: [], pool_claims: [] }
      const data = await response.json()
      return data
    },
    staleTime: 60_000,
  })

  // Calculate total claimed BLND from supply/borrow claim actions
  const poolClaimedBlnd = useMemo(() => {
    if (!claimActions || claimActions.length === 0) {
      return 0
    }
    return claimActions.reduce((total, action) => {
      // claim_amount is in raw units (7 decimals for BLND)
      const claimAmount = action.claim_amount || 0
      return total + claimAmount / 1e7
    }, 0)
  }, [claimActions])

  // Calculate total claimed BLND from backstop emissions (LP tokens → BLND)
  const backstopClaimedBlnd = useMemo(() => {
    if (!backstopClaimsData?.backstop_claims || !blndPerLpToken) {
      return 0
    }
    // Sum all backstop LP tokens claimed and convert to BLND
    const totalLpClaimed = backstopClaimsData.backstop_claims.reduce(
      (total: number, claim: { total_claimed_lp: number }) => total + (claim.total_claimed_lp || 0),
      0
    )
    return totalLpClaimed * blndPerLpToken
  }, [backstopClaimsData, blndPerLpToken])

  // Backstop pending emissions
  // Note: SDK doesn't provide backstop emissions estimate, so we only use what's passed in
  // (which is usually 0). Backstop emissions auto-compound as LP tokens when claimed,
  // so showing a pending BLND amount would be misleading anyway.
  const effectiveBackstopPending = backstopClaimableBlnd > 0 ? backstopClaimableBlnd : 0

  // Combined totals
  const totalClaimedBlnd = poolClaimedBlnd + backstopClaimedBlnd
  const totalPendingBlnd = pendingEmissions + effectiveBackstopPending

  // Build table rows for per-pool breakdown
  interface TableRow {
    name: string
    claimable: number
    claimed: number
    isBackstop: boolean
  }

  const tableRows = useMemo(() => {
    const rows: TableRow[] = []

    // Get claimed data maps from API
    const poolClaimsMap = new Map<string, number>()
    const backstopClaimsMap = new Map<string, number>()

    if (backstopClaimsData?.pool_claims) {
      for (const claim of backstopClaimsData.pool_claims) {
        poolClaimsMap.set(claim.pool_id, claim.total_claimed_blnd || 0)
      }
    }

    if (backstopClaimsData?.backstop_claims) {
      for (const claim of backstopClaimsData.backstop_claims) {
        // Convert LP to BLND if we have the ratio, otherwise store LP directly
        const claimedValue = blndPerLpToken > 0
          ? (claim.total_claimed_lp || 0) * blndPerLpToken
          : (claim.total_claimed_lp || 0) // Show LP if can't convert
        backstopClaimsMap.set(claim.pool_address, claimedValue)
      }
    }

    // Collect all unique pool IDs
    const poolIds = new Set<string>()
    Object.keys(perPoolEmissions).forEach(id => poolIds.add(id))
    backstopPositions.forEach(bp => poolIds.add(bp.poolId))
    poolClaimsMap.forEach((_, id) => poolIds.add(id))
    backstopClaimsMap.forEach((_, id) => poolIds.add(id))

    // Build pool name map from backstop positions and poolNames prop
    const poolNameMap = new Map<string, string>()
    // Add names from poolNames prop (supply/borrow positions)
    Object.entries(poolNames).forEach(([id, name]) => {
      poolNameMap.set(id, name)
    })
    // Add names from backstop positions (may override if same pool)
    backstopPositions.forEach(bp => {
      poolNameMap.set(bp.poolId, bp.poolName)
    })

    // Create rows for each pool
    for (const poolId of poolIds) {
      const poolName = poolNameMap.get(poolId) || 'Pool'
      const shortName = poolName.length > 12 ? poolName.substring(0, 12) + '...' : poolName

      // Supply/borrow row
      const supplyClaimable = perPoolEmissions[poolId] || 0
      const supplyClaimed = poolClaimsMap.get(poolId) || 0

      if (supplyClaimable > 0 || supplyClaimed > 0) {
        rows.push({
          name: shortName,
          claimable: supplyClaimable,
          claimed: supplyClaimed,
          isBackstop: false,
        })
      }

      // Backstop row
      const backstopPos = backstopPositions.find(bp => bp.poolId === poolId)
      const backstopClaimable = backstopPos?.claimableBlnd || 0
      const backstopClaimed = backstopClaimsMap.get(poolId) || 0

      if (backstopClaimable > 0 || backstopClaimed > 0) {
        rows.push({
          name: `${shortName} Bkst`,
          claimable: backstopClaimable,
          claimed: backstopClaimed,
          isBackstop: true,
        })
      }
    }

    return rows
  }, [perPoolEmissions, backstopPositions, backstopClaimsData, blndPerLpToken, poolNames])

  const hasPendingEmissions = totalPendingBlnd > 0
  const hasClaimedBlnd = totalClaimedBlnd > 0
  const hasTableRows = tableRows.length > 0
  const loading = isLoading || actionsLoading || backstopClaimsLoading

  if (loading) {
    return (
      <Card className="p-0 gap-0">
        <div className="flex items-center justify-between px-4 py-3">
          <Skeleton className="h-5 w-28 sm:w-32" />
          <Skeleton className="h-6 w-16 sm:w-20" />
        </div>
        <div className="px-4 pt-2 pb-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-16 sm:w-24" />
              <Skeleton className="h-8 w-full max-w-[120px]" />
              <Skeleton className="h-4 w-14 sm:w-20" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-16 sm:w-24" />
              <Skeleton className="h-8 w-full max-w-[120px]" />
              <Skeleton className="h-4 w-14 sm:w-20" />
            </div>
          </div>
        </div>
      </Card>
    )
  }

  if (!hasPendingEmissions && !hasClaimedBlnd) {
    return null
  }

  return (
    <Card className="overflow-hidden p-0 gap-0">
      <div
        className="cursor-pointer select-none flex items-center justify-between px-4 py-3"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 text-base font-semibold">
          <Flame className="h-5 w-5 text-muted-foreground" />
          {formatNumber(totalPendingBlnd, 2)} BLND
        </div>
        <div className="flex items-center gap-2">
          {blndApy > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger onClick={(e) => e.stopPropagation()}>
                  <Badge variant="outline" className="text-xs">
                    +{blndApy.toFixed(2)}% APY
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Weighted average BLND APY across all positions</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </div>
      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="px-4 pt-2 pb-4">
          {/* Table-like structure */}
          <div className="space-y-1">
            {/* Header row */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-xs text-muted-foreground pb-1 border-b border-border/50">
              <div></div>
              <div className="w-20 text-right">Claimable</div>
              <div className="w-20 text-right">Claimed</div>
            </div>

            {/* Data rows */}
            {hasTableRows ? (
              tableRows.map((row, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[1fr_auto_auto] gap-2 text-sm py-1"
                >
                  <div className="text-muted-foreground truncate" title={row.name}>
                    {row.name}
                  </div>
                  <div className="w-20 text-right tabular-nums font-medium">
                    {row.claimable > 0 ? formatNumber(row.claimable, 2) : '-'}
                  </div>
                  <div className="w-20 text-right tabular-nums text-muted-foreground">
                    {row.claimed > 0 ? `${row.isBackstop ? '~' : ''}${formatNumber(row.claimed, 2)}` : '-'}
                  </div>
                </div>
              ))
            ) : (
              /* Fallback: show simple supply/backstop breakdown when no per-pool data */
              <>
                {pendingEmissions > 0 || poolClaimedBlnd > 0 ? (
                  <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-sm py-1">
                    <div className="text-muted-foreground">Supply</div>
                    <div className="w-20 text-right tabular-nums font-medium">
                      {pendingEmissions > 0 ? formatNumber(pendingEmissions, 2) : '-'}
                    </div>
                    <div className="w-20 text-right tabular-nums text-muted-foreground">
                      {poolClaimedBlnd > 0 ? formatNumber(poolClaimedBlnd, 2) : '-'}
                    </div>
                  </div>
                ) : null}
                {effectiveBackstopPending > 0 || backstopClaimedBlnd > 0 ? (
                  <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-sm py-1">
                    <div className="text-muted-foreground">Backstop</div>
                    <div className="w-20 text-right tabular-nums font-medium">
                      {effectiveBackstopPending > 0 ? formatNumber(effectiveBackstopPending, 2) : '-'}
                    </div>
                    <div className="w-20 text-right tabular-nums text-muted-foreground">
                      {backstopClaimedBlnd > 0 ? `~${formatNumber(backstopClaimedBlnd, 2)}` : '-'}
                    </div>
                  </div>
                ) : null}
              </>
            )}

            {/* Total row */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-sm pt-2 border-t border-border/50 font-medium">
              <div>Total</div>
              <div className="w-20 text-right">
                <div className="tabular-nums">{formatNumber(totalPendingBlnd, 2)}</div>
                {blndPrice && totalPendingBlnd > 0 && (
                  <div className="text-xs text-muted-foreground font-normal">
                    {formatUsd(totalPendingBlnd * blndPrice)}
                  </div>
                )}
              </div>
              <div className="w-20 text-right text-muted-foreground">
                <div className="tabular-nums">{formatNumber(totalClaimedBlnd, 2)}</div>
                {blndPrice && totalClaimedBlnd > 0 && (
                  <div className="text-xs font-normal">
                    {formatUsd(totalClaimedBlnd * blndPrice)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Total BLND Earned summary */}
          {(hasPendingEmissions || hasClaimedBlnd) && (
            <>
              <Separator className="my-3" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total BLND Earned</span>
                <div className="text-right">
                  <span className="font-semibold tabular-nums">
                    {formatNumber(totalPendingBlnd + totalClaimedBlnd, 2)} BLND
                  </span>
                  {blndPrice && (
                    <span className="text-muted-foreground ml-2">
                      ({formatUsd((totalPendingBlnd + totalClaimedBlnd) * blndPrice)})
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}
