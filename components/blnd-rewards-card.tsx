"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Gift, Coins, ChevronDown } from "lucide-react"
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

interface BlndRewardsCardProps {
  publicKey: string
  pendingEmissions: number // Supply/borrow claimable BLND
  backstopClaimableBlnd?: number // Backstop claimable BLND from SDK (usually 0 - SDK doesn't estimate)
  blndPrice: number | null
  blndPerLpToken?: number // For converting backstop LP to BLND
  blndApy?: number
  isLoading?: boolean
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
    // DEBUG
    console.log('[BlndRewardsCard] backstopClaimsData:', backstopClaimsData)
    console.log('[BlndRewardsCard] blndPerLpToken:', blndPerLpToken)

    if (!backstopClaimsData?.backstop_claims || !blndPerLpToken) {
      console.log('[BlndRewardsCard] Returning 0 - no data or no blndPerLpToken')
      return 0
    }
    // Sum all backstop LP tokens claimed and convert to BLND
    const totalLpClaimed = backstopClaimsData.backstop_claims.reduce(
      (total: number, claim: { total_claimed_lp: number }) => total + (claim.total_claimed_lp || 0),
      0
    )
    console.log('[BlndRewardsCard] totalLpClaimed:', totalLpClaimed)
    console.log('[BlndRewardsCard] backstopClaimedBlnd:', totalLpClaimed * blndPerLpToken)
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

  // Calculate USD values
  const pendingUsdValue = blndPrice && totalPendingBlnd ? totalPendingBlnd * blndPrice : null
  const claimedUsdValue = blndPrice && totalClaimedBlnd ? totalClaimedBlnd * blndPrice : null

  const hasPendingEmissions = totalPendingBlnd > 0
  const hasClaimedBlnd = totalClaimedBlnd > 0
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
          <Coins className="h-5 w-5 text-muted-foreground" />
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
        <div>
          <div className="px-4 pt-2 pb-4">
            <div className="grid grid-cols-2 gap-3">
              {/* Pending Emissions */}
              <div className="space-y-0.5">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Coins className="h-3 w-3" />
                  <span>To Be Claimed</span>
                </div>
                <div className="text-lg font-bold tabular-nums">
                  {formatNumber(totalPendingBlnd, 2)}
                  <span className="text-sm font-medium ml-0.5">BLND</span>
                </div>
                {pendingUsdValue !== null && (
                  <div className="text-xs text-muted-foreground">
                    {formatUsd(pendingUsdValue)}
                  </div>
                )}
                {/* Show breakdown if both supply and backstop have emissions */}
                {pendingEmissions > 0 && effectiveBackstopPending > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatNumber(pendingEmissions, 2)} supply + {formatNumber(effectiveBackstopPending, 2)} backstop
                  </div>
                )}
              </div>

              {/* Total Claimed */}
              <div className="space-y-0.5">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Gift className="h-3 w-3" />
                  <span>Total Claimed</span>
                </div>
                <div className="text-lg font-bold tabular-nums">
                  {formatNumber(totalClaimedBlnd, 2)}
                  <span className="text-sm font-medium ml-0.5">BLND</span>
                </div>
                {claimedUsdValue !== null && (
                  <div className="text-xs text-muted-foreground">
                    {formatUsd(claimedUsdValue)}
                  </div>
                )}
                {/* Show breakdown if both pool and backstop have claims */}
                {poolClaimedBlnd > 0 && backstopClaimedBlnd > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatNumber(poolClaimedBlnd, 2)} supply + ~{formatNumber(backstopClaimedBlnd, 2)} backstop
                  </div>
                )}
              </div>
            </div>

            {/* Total Summary */}
            {(hasPendingEmissions || hasClaimedBlnd) && (
              <>
                <Separator className="my-4" />
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
      </div>
    </Card>
  )
}
