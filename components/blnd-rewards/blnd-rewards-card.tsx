"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Flame, ChevronDown, Shield } from "lucide-react"
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
import { fetchWithTimeout } from "@/lib/fetch-utils"
import { useCurrencyPreference } from "@/hooks/use-currency-preference"
import { useDisplayPreferences } from "@/contexts/display-preferences-context"
import { getPoolName as getConfigPoolName } from "@/lib/config/pools"

import type { BlndRewardsCardProps, TableRow } from "./types"
import { formatNumber, formatCompact } from "./helpers"

export function BlndRewardsCard({
  publicKey,
  pendingEmissions,
  pendingSupplyEmissions = 0,
  pendingBorrowEmissions = 0,
  blndPrice,
  lpTokenPrice,
  blndPerLpToken = 0,
  blndApy = 0,
  totalPositionUsd = 0,
  isLoading = false,
  perPoolEmissions = {},
  perPoolSupplyEmissions = {},
  perPoolBorrowEmissions = {},
  backstopPositions = [],
  poolNames = {},
}: BlndRewardsCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Currency preference for multi-currency display
  const { format: formatInCurrency } = useCurrencyPreference()

  // Display preferences (BLND historical prices toggle)
  const { preferences: displayPreferences } = useDisplayPreferences()

  const formatUsd = (value: number) => {
    if (!Number.isFinite(value)) return formatInCurrency(0)
    return formatInCurrency(value, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

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
    queryKey: ["claimed-blnd-backstop", publicKey, blndPrice, lpTokenPrice],
    enabled: !!publicKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        user: publicKey,
        ...(blndPrice ? { sdkBlndPrice: blndPrice.toString() } : {}),
        ...(lpTokenPrice ? { sdkLpPrice: lpTokenPrice.toString() } : {}),
      })
      const response = await fetchWithTimeout(`/api/claimed-blnd?${params}`)
      if (!response.ok) return { backstop_claims: [], pool_claims: [], pool_claims_with_prices: [], total_claimed_blnd_usd_historical: 0, total_backstop_claimed_usd_historical: 0 }
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

  // Get historical USD value for pool claims from API
  const poolClaimedUsdHistorical = backstopClaimsData?.total_claimed_blnd_usd_historical || 0

  // Get historical USD value for backstop claims from API
  const backstopClaimedUsdHistorical = backstopClaimsData?.total_backstop_claimed_usd_historical || 0

  // Calculate pool claimed USD based on preference (historical vs current price)
  const poolClaimedUsdDisplay = useMemo(() => {
    if (displayPreferences.useHistoricalBlndPrices) {
      return poolClaimedUsdHistorical
    }
    // Use current price for all claims
    return poolClaimedBlnd * (blndPrice || 0)
  }, [displayPreferences.useHistoricalBlndPrices, poolClaimedUsdHistorical, poolClaimedBlnd, blndPrice])

  // Calculate total claimed LP from backstop emissions
  const totalClaimedLp = useMemo(() => {
    if (!backstopClaimsData?.backstop_claims) {
      return 0
    }
    return backstopClaimsData.backstop_claims.reduce(
      (total: number, claim: { total_claimed_lp: number }) => total + (claim.total_claimed_lp || 0),
      0
    )
  }, [backstopClaimsData])

  // Calculate backstop claimed USD based on preference (historical vs current price)
  const backstopClaimedUsdDisplay = useMemo(() => {
    if (displayPreferences.useHistoricalBlndPrices) {
      // Use historical LP token prices from API
      return backstopClaimedUsdHistorical
    }
    // Use current LP price
    return totalClaimedLp * (lpTokenPrice || 0)
  }, [displayPreferences.useHistoricalBlndPrices, backstopClaimedUsdHistorical, totalClaimedLp, lpTokenPrice])

  // Calculate total pending LP from backstop emissions
  const totalPendingLp = useMemo(() => {
    // Sum simulatedEmissionsLp from backstop positions, fallback to claimableBlnd converted
    return backstopPositions.reduce((sum, bp) => {
      if (bp.simulatedEmissionsLp != null && bp.simulatedEmissionsLp > 0) {
        return sum + bp.simulatedEmissionsLp
      }
      // Fallback: rough conversion if simulation unavailable
      if (bp.claimableBlnd && blndPerLpToken > 0) {
        return sum + (bp.claimableBlnd / blndPerLpToken)
      }
      return sum
    }, 0)
  }, [backstopPositions, blndPerLpToken])

  // Calculate combined weighted APY (BLND from supply/borrow + LP emissions from backstop)
  const combinedApy = useMemo(() => {
    // Calculate backstop totals
    let totalBackstopUsd = 0
    let weightedBackstopApy = 0
    backstopPositions.forEach(bp => {
      const posUsd = bp.lpTokensUsd || 0
      const posApy = bp.emissionApy || 0
      totalBackstopUsd += posUsd
      weightedBackstopApy += posUsd * posApy
    })

    // Weighted average across supply/borrow and backstop positions
    const totalUsd = totalPositionUsd + totalBackstopUsd
    if (totalUsd <= 0) return 0

    const blndWeighted = totalPositionUsd * blndApy
    const combined = (blndWeighted + weightedBackstopApy) / totalUsd
    return Number.isFinite(combined) ? combined : 0
  }, [backstopPositions, totalPositionUsd, blndApy])

  // BLND totals (pool emissions only)
  const totalClaimedBlnd = poolClaimedBlnd
  const totalPendingBlnd = pendingEmissions

  // Build table rows for per-pool breakdown
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
        // Keep LP value directly (don't convert to BLND)
        backstopClaimsMap.set(claim.pool_address, claim.total_claimed_lp || 0)
      }
    }

    // Collect all unique pool IDs
    const poolIds = new Set<string>()
    Object.keys(perPoolEmissions).forEach(id => poolIds.add(id))
    Object.keys(perPoolSupplyEmissions).forEach(id => poolIds.add(id))
    Object.keys(perPoolBorrowEmissions).forEach(id => poolIds.add(id))
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

    // Create rows for each pool - with separate deposit/borrow/backstop rows
    for (const poolId of poolIds) {
      // Use config pool name if available, otherwise fall back to SDK name
      const poolName = getConfigPoolName(poolId) || poolNameMap.get(poolId) || 'Pool'

      // Deposit row (supply emissions)
      const depositClaimable = perPoolSupplyEmissions[poolId] || 0
      // Note: claimed data from API doesn't distinguish deposit vs borrow, so we show it on deposit row
      const depositClaimed = poolClaimsMap.get(poolId) || 0

      if (depositClaimable > 0) {
        rows.push({
          name: `${poolName} Deposit`,
          claimable: depositClaimable,
          claimed: depositClaimed, // Show all pool claims on deposit row
          type: 'deposit',
          tokenUnit: 'BLND',
        })
      }

      // Borrow row
      const borrowClaimable = perPoolBorrowEmissions[poolId] || 0

      if (borrowClaimable > 0) {
        rows.push({
          name: `${poolName} Borrow`,
          claimable: borrowClaimable,
          claimed: 0, // Claims are combined, already shown on deposit row
          type: 'borrow',
          tokenUnit: 'BLND',
        })
      }

      // If we have deposit claimed but no deposit/borrow claimable, show a deposit row for the claimed amount
      if (depositClaimed > 0 && depositClaimable === 0 && borrowClaimable === 0) {
        rows.push({
          name: `${poolName} Deposit`,
          claimable: 0,
          claimed: depositClaimed,
          type: 'deposit',
          tokenUnit: 'BLND',
        })
      }

      // Backstop row - show LP tokens (not BLND)
      const backstopPos = backstopPositions.find(bp => bp.poolId === poolId)
      // Use simulatedEmissionsLp if available, otherwise convert claimableBlnd to LP
      const backstopClaimableLp = backstopPos?.simulatedEmissionsLp ??
        (backstopPos?.claimableBlnd && blndPerLpToken > 0
          ? backstopPos.claimableBlnd / blndPerLpToken
          : 0)
      const backstopClaimedLp = backstopClaimsMap.get(poolId) || 0 // Already in LP

      if (backstopClaimableLp > 0 || backstopClaimedLp > 0) {
        rows.push({
          name: `${poolName} Backstop`,
          claimable: backstopClaimableLp,
          claimed: backstopClaimedLp,
          type: 'backstop',
          tokenUnit: 'LP',
        })
      }
    }

    return rows
  }, [perPoolEmissions, perPoolSupplyEmissions, perPoolBorrowEmissions, backstopPositions, backstopClaimsData, blndPerLpToken, poolNames])

  const hasPendingEmissions = totalPendingBlnd > 0
  const hasClaimedBlnd = totalClaimedBlnd > 0
  const hasPendingLp = totalPendingLp > 0
  const hasClaimedLp = totalClaimedLp > 0
  const hasTableRows = tableRows.length > 0
  const loading = isLoading || actionsLoading || backstopClaimsLoading

  if (loading) {
    return (
      <Card className="p-0 gap-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <div className="space-y-1">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-4" />
          </div>
        </div>
      </Card>
    )
  }

  if (!hasPendingEmissions && !hasClaimedBlnd && !hasPendingLp && !hasClaimedLp) {
    return null
  }

  return (
    <Card className="overflow-hidden p-0 gap-0">
      <div
        className="cursor-pointer select-none flex items-center justify-between px-4 py-3"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-muted-foreground" />
          <div>
            {(() => {
              const hasBothRewards = totalPendingBlnd > 0 && totalPendingLp > 0
              const blndUsd = blndPrice ? totalPendingBlnd * blndPrice : 0
              const lpUsd = lpTokenPrice ? totalPendingLp * lpTokenPrice : 0
              const combinedUsd = blndUsd + lpUsd

              return (
                <>
                  {/* Combined USD value - shown first with bigger font */}
                  {combinedUsd > 0 && (
                    <div className="text-base font-semibold">{formatUsd(combinedUsd)}</div>
                  )}
                  {/* BLND and LP rewards underneath */}
                  {(totalPendingBlnd > 0 || totalPendingLp > 0) && (
                    <div className="text-sm text-muted-foreground">
                      {totalPendingBlnd > 0 && <>{formatCompact(totalPendingBlnd)} BLND</>}
                      {hasBothRewards && <span className="mx-1">+</span>}
                      {totalPendingLp > 0 && <>{formatCompact(totalPendingLp)} LP</>}
                    </div>
                  )}
                  {/* Show nothing pending but has claimed - show a label */}
                  {totalPendingBlnd === 0 && totalPendingLp === 0 && (hasClaimedBlnd || hasClaimedLp) && (
                    <div className="text-base font-semibold text-muted-foreground">Rewards</div>
                  )}
                </>
              )
            })()}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {combinedApy > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger onClick={(e) => e.stopPropagation()}>
                  <Badge variant="outline" className="text-xs">
                    {combinedApy.toFixed(2)}% APY
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Weighted average emission APY (BLND + LP)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <ChevronDown className={`h-4 w-4 mx-2 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </div>
      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${isExpanded ? 'max-h-[700px] opacity-100' : 'max-h-0 opacity-0'}`}
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
                  className="grid grid-cols-[1fr_auto_auto] gap-2 text-xs py-1"
                >
                  <div className="flex items-center gap-2 text-muted-foreground truncate" title={row.name}>
                    <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                      row.type === 'deposit' ? 'bg-green-500' :
                      row.type === 'borrow' ? 'bg-orange-500' :
                      'bg-purple-500'
                    }`} />
                    <span className="truncate">{row.name}</span>
                  </div>
                  <div className="w-20 text-right tabular-nums font-medium flex items-center justify-end gap-1">
                    {row.claimable > 0 ? (
                      <>
                        {row.tokenUnit === 'LP' ? <Shield className="h-3 w-3 text-muted-foreground" /> : <Flame className="h-3 w-3 text-muted-foreground" />}
                        {formatNumber(row.claimable, 2)}
                      </>
                    ) : '-'}
                  </div>
                  <div className="w-20 text-right tabular-nums text-muted-foreground flex items-center justify-end gap-1">
                    {row.claimed > 0 ? (
                      <>
                        {row.tokenUnit === 'LP' ? <Shield className="h-3 w-3" /> : <Flame className="h-3 w-3" />}
                        {formatNumber(row.claimed, 2)}
                      </>
                    ) : '-'}
                  </div>
                </div>
              ))
            ) : (
              /* Fallback: show simple deposit/borrow/backstop breakdown when no per-pool data */
              <>
                {pendingSupplyEmissions > 0 && (
                  <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-xs py-1">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="inline-block w-2 h-2 rounded-full flex-shrink-0 bg-green-500" />
                      <span>Deposit</span>
                    </div>
                    <div className="w-20 text-right tabular-nums font-medium flex items-center justify-end gap-1">
                      <Flame className="h-3 w-3 text-muted-foreground" />
                      {formatNumber(pendingSupplyEmissions, 2)}
                    </div>
                    <div className="w-20 text-right tabular-nums text-muted-foreground flex items-center justify-end gap-1">
                      {poolClaimedBlnd > 0 ? (
                        <>
                          <Flame className="h-3 w-3" />
                          {formatNumber(poolClaimedBlnd, 2)}
                        </>
                      ) : '-'}
                    </div>
                  </div>
                )}
                {pendingBorrowEmissions > 0 && (
                  <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-xs py-1">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="inline-block w-2 h-2 rounded-full flex-shrink-0 bg-orange-500" />
                      <span>Borrow</span>
                    </div>
                    <div className="w-20 text-right tabular-nums font-medium flex items-center justify-end gap-1">
                      <Flame className="h-3 w-3 text-muted-foreground" />
                      {formatNumber(pendingBorrowEmissions, 2)}
                    </div>
                    <div className="w-20 text-right tabular-nums text-muted-foreground">-</div>
                  </div>
                )}
                {/* Show deposit row with claimed if no pending but has claimed */}
                {pendingSupplyEmissions === 0 && pendingBorrowEmissions === 0 && poolClaimedBlnd > 0 && (
                  <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-xs py-1">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="inline-block w-2 h-2 rounded-full flex-shrink-0 bg-green-500" />
                      <span>Deposit</span>
                    </div>
                    <div className="w-20 text-right tabular-nums font-medium">-</div>
                    <div className="w-20 text-right tabular-nums text-muted-foreground flex items-center justify-end gap-1">
                      <Flame className="h-3 w-3" />
                      {formatNumber(poolClaimedBlnd, 2)}
                    </div>
                  </div>
                )}
                {(totalPendingLp > 0 || totalClaimedLp > 0) && (
                  <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-xs py-1">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="inline-block w-2 h-2 rounded-full flex-shrink-0 bg-purple-500" />
                      <span>Backstop</span>
                    </div>
                    <div className="w-20 text-right tabular-nums font-medium flex items-center justify-end gap-1">
                      {totalPendingLp > 0 ? (
                        <>
                          <Shield className="h-3 w-3 text-muted-foreground" />
                          {formatNumber(totalPendingLp, 2)}
                        </>
                      ) : '-'}
                    </div>
                    <div className="w-20 text-right tabular-nums text-muted-foreground flex items-center justify-end gap-1">
                      {totalClaimedLp > 0 ? (
                        <>
                          <Shield className="h-3 w-3" />
                          {formatNumber(totalClaimedLp, 2)}
                        </>
                      ) : '-'}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* BLND Total row */}
            {(totalPendingBlnd > 0 || totalClaimedBlnd > 0) && (
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-sm pt-2 border-t border-border/50 font-medium">
                <div className="flex items-center gap-1">
                  <Flame className="h-3.5 w-3.5 text-muted-foreground" />
                  BLND Total
                </div>
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
                  {totalClaimedBlnd > 0 && (
                    <div className="text-xs font-normal">
                      {formatUsd(poolClaimedUsdDisplay)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* LP Total row */}
            {(totalPendingLp > 0 || totalClaimedLp > 0) && (
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-sm pt-2 border-t border-border/50 font-medium">
                <div className="flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                  LP Total
                </div>
                <div className="w-20 text-right">
                  <div className="tabular-nums">{formatNumber(totalPendingLp, 2)}</div>
                  {lpTokenPrice && totalPendingLp > 0 && (
                    <div className="text-xs text-muted-foreground font-normal">
                      {formatUsd(totalPendingLp * lpTokenPrice)}
                    </div>
                  )}
                </div>
                <div className="w-20 text-right text-muted-foreground">
                  <div className="tabular-nums">{formatNumber(totalClaimedLp, 2)}</div>
                  {totalClaimedLp > 0 && (
                    <div className="text-xs font-normal">
                      {formatUsd(backstopClaimedUsdDisplay)}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Total Earned summary */}
          {(hasPendingEmissions || hasClaimedBlnd || hasPendingLp || hasClaimedLp) && (
            <>
              <Separator className="my-3" />
              <div className="space-y-2">
                {/* Combined Total USD */}
                {(() => {
                  const blndTotalUsd = blndPrice ? (totalPendingBlnd * blndPrice) + poolClaimedUsdDisplay : 0
                  const lpTotalUsd = lpTokenPrice ? (totalPendingLp * lpTokenPrice) + backstopClaimedUsdDisplay : 0
                  const combinedTotalUsd = blndTotalUsd + lpTotalUsd
                  if (combinedTotalUsd > 0) {
                    return (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Total Earned</span>
                        <span className="font-semibold tabular-nums">
                          {formatUsd(combinedTotalUsd)}
                        </span>
                      </div>
                    )
                  }
                  return null
                })()}
              </div>
            </>
          )}

          {/* Yield Projection */}
          {blndPrice && ((blndApy > 0 && totalPositionUsd > 0) || backstopPositions.length > 0) && (
            <div className="grid grid-cols-3 gap-3 text-center mt-8">
                {(() => {
                  // Calculate backstop totals for LP projections
                  const hasLpPositions = backstopPositions.length > 0
                  let totalBackstopUsd = 0
                  let weightedBackstopApy = 0
                  backstopPositions.forEach(bp => {
                    const posUsd = bp.lpTokensUsd || 0
                    const posApy = bp.emissionApy || 0
                    totalBackstopUsd += posUsd
                    weightedBackstopApy += posUsd * posApy
                  })
                  const backstopApy = totalBackstopUsd > 0 ? weightedBackstopApy / totalBackstopUsd : 0

                  // BLND projections: supply/borrow positions × their BLND APY
                  // Note: blndApy and totalPositionUsd are both supply/borrow only (excludes backstop)
                  const annualBlndUsd = totalPositionUsd * (blndApy / 100)
                  const annualBlnd = blndPrice > 0 ? annualBlndUsd / blndPrice : 0
                  const monthlyBlnd = annualBlnd / 12
                  const dailyBlnd = annualBlnd / 365

                  // LP yield: backstop position value × emission APY → USD → LP tokens
                  const annualLpUsd = totalBackstopUsd * (backstopApy / 100)
                  const annualLp = lpTokenPrice && lpTokenPrice > 0 ? annualLpUsd / lpTokenPrice : 0
                  const monthlyLp = annualLp / 12
                  const dailyLp = annualLp / 365

                  // Combined USD
                  const dailyBlndUsd = dailyBlnd * blndPrice
                  const dailyLpUsd = dailyLp * (lpTokenPrice || 0)
                  const dailyTotalUsd = dailyBlndUsd + dailyLpUsd
                  const monthlyTotalUsd = dailyTotalUsd * 30
                  const annualTotalUsd = dailyTotalUsd * 365

                  const hasBlndPositions = blndApy > 0 && totalPositionUsd > 0

                  return (
                    <>
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Daily</div>
                        <div className="font-semibold tabular-nums text-sm">{formatUsd(dailyTotalUsd)}</div>
                        {hasBlndPositions && (
                          <div className="tabular-nums text-xs text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                            <Flame className="h-2.5 w-2.5" />
                            {formatNumber(dailyBlnd, 2)}
                          </div>
                        )}
                        {hasLpPositions && (
                          <div className="tabular-nums text-xs text-muted-foreground flex items-center justify-center gap-1">
                            <Shield className="h-2.5 w-2.5" />
                            {dailyLp > 0 ? formatNumber(dailyLp, 2) : '-'}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Monthly</div>
                        <div className="font-semibold tabular-nums text-sm">{formatUsd(monthlyTotalUsd)}</div>
                        {hasBlndPositions && (
                          <div className="tabular-nums text-xs text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                            <Flame className="h-2.5 w-2.5" />
                            {formatNumber(monthlyBlnd, 2)}
                          </div>
                        )}
                        {hasLpPositions && (
                          <div className="tabular-nums text-xs text-muted-foreground flex items-center justify-center gap-1">
                            <Shield className="h-2.5 w-2.5" />
                            {monthlyLp > 0 ? formatNumber(monthlyLp, 2) : '-'}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Annual</div>
                        <div className="font-semibold tabular-nums text-sm">{formatUsd(annualTotalUsd)}</div>
                        {hasBlndPositions && (
                          <div className="tabular-nums text-xs text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                            <Flame className="h-2.5 w-2.5" />
                            {formatNumber(annualBlnd, 2)}
                          </div>
                        )}
                        {hasLpPositions && (
                          <div className="tabular-nums text-xs text-muted-foreground flex items-center justify-center gap-1">
                            <Shield className="h-2.5 w-2.5" />
                            {annualLp > 0 ? formatNumber(annualLp, 2) : '-'}
                          </div>
                        )}
                      </div>
                    </>
                  )
                })()}
              </div>
          )}
        </div>
      </div>
    </Card>
  )
}
