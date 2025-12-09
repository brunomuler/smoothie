"use client"

import { useMemo, useState } from "react"
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
  pendingEmissions: number
  blndPrice: number | null
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
  blndPrice,
  blndApy = 0,
  isLoading = false,
}: BlndRewardsCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Fetch claim actions to calculate total claimed BLND
  const { actions: claimActions, isLoading: actionsLoading } = useUserActions({
    publicKey,
    actionTypes: ["claim"],
    limit: 1000,
    enabled: !!publicKey,
  })

  // Calculate total claimed BLND from all claim actions
  const totalClaimedBlnd = useMemo(() => {
    if (!claimActions || claimActions.length === 0) {
      return 0
    }
    return claimActions.reduce((total, action) => {
      // claim_amount is in raw units (7 decimals for BLND)
      const claimAmount = action.claim_amount || 0
      return total + claimAmount / 1e7
    }, 0)
  }, [claimActions])

  // Calculate USD values
  const pendingUsdValue = blndPrice && pendingEmissions ? pendingEmissions * blndPrice : null
  const claimedUsdValue = blndPrice && totalClaimedBlnd ? totalClaimedBlnd * blndPrice : null

  const hasPendingEmissions = pendingEmissions > 0
  const hasClaimedBlnd = totalClaimedBlnd > 0
  const loading = isLoading || actionsLoading

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
          {formatNumber(pendingEmissions, 2)} BLND
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
                  {formatNumber(pendingEmissions, 2)}
                  <span className="text-sm font-medium ml-0.5">BLND</span>
                </div>
                {pendingUsdValue !== null && (
                  <div className="text-xs text-muted-foreground">
                    {formatUsd(pendingUsdValue)}
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
                      {formatNumber(pendingEmissions + totalClaimedBlnd, 2)} BLND
                    </span>
                    {blndPrice && (
                      <span className="text-muted-foreground ml-2">
                        ({formatUsd((pendingEmissions + totalClaimedBlnd) * blndPrice)})
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
