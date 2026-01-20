"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, TrendingUp, TrendingDown, AlertTriangle, ExternalLink, Flame, Shield, Clock, Calculator } from "lucide-react"
import { ApySparkline } from "@/components/apy-sparkline"
import { BackstopApySparkline } from "@/components/backstop-apy-sparkline"
import { BlndApySparkline } from "@/components/blnd-apy-sparkline"
import { LpPriceSparkline } from "@/components/lp-price-sparkline"
import { Q4wSparkline } from "@/components/q4w-sparkline"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { fetchWalletBlendSnapshot, type BlendReservePosition, type BlendPoolEstimate, type BlendBackstopPosition, type BlendWalletSnapshot } from "@/lib/blend/positions"
import { FixedMath } from "@blend-capital/blend-sdk"
import { fetchWithTimeout } from "@/lib/fetch-utils"
import type { BackstopCostBasis } from "@/lib/db/types"
import { toTrackedPools } from "@/lib/blend/pools"
import { usePoolsOnly } from "@/hooks/use-metadata"
import { TokenLogo } from "@/components/token-logo"
import { useCurrencyPreference } from "@/hooks/use-currency-preference"
import { useWalletState } from "@/hooks/use-wallet-state"
import { useAnalytics } from "@/hooks/use-analytics"
import { AuthenticatedPage } from "@/components/authenticated-page"
import { ApySimulatorContainer } from "@/components/apy-simulator"

// Extended position type with yield data
interface PositionWithYield extends BlendReservePosition {
  earnedYield: number
  yieldPercentage: number
  estimatedClaimableBlnd: number // Per-position share of pool's claimable BLND
  estimatedClaimedBlnd: number // Per-position share of pool's claimed BLND (proportional)
}

// Types for claimed BLND API response
interface PoolClaimData {
  pool_id: string
  total_claimed_blnd: number
  claim_count: number
  last_claim_date: string | null
}

interface BackstopClaimData {
  pool_address: string
  total_claimed_lp: number
  claim_count: number
  last_claim_date: string | null
}

interface BalanceHistoryRecord {
  pool_id: string
  total_cost_basis: number | null
  [key: string]: unknown
}

interface BalanceHistoryResult {
  assetAddress: string
  data: {
    history: BalanceHistoryRecord[]
    firstEventDate: string | null
  }
}


function formatNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "0"
  if (value >= 1000000) {
    return (value / 1000000).toLocaleString("en-US", { maximumFractionDigits: 2 }) + "M"
  }
  if (value >= 1000) {
    return (value / 1000).toLocaleString("en-US", { maximumFractionDigits: 2 }) + "K"
  }
  // Show more decimals for dust amounts
  if (value > 0 && value < 0.01) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 6,
      maximumFractionDigits: 6,
    })
  }
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function formatPercent(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "0%"
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`
}

// Summary stats at top
function PoolSummary({ estimate, formatUsd }: { estimate: BlendPoolEstimate; formatUsd: (value: number, decimals?: number) => string }) {
  const healthPercent = Math.min(estimate.borrowLimit * 100, 100)
  const isDanger = estimate.borrowLimit >= 0.8
  const isWarning = estimate.borrowLimit >= 0.5 && estimate.borrowLimit < 0.8

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      <Card className="py-2 md:py-3">
        <CardContent className="p-3 md:p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Supplied</p>
          <p className="text-lg md:text-xl font-semibold truncate">{formatUsd(estimate.totalSupplied)}</p>
          <div className="flex items-center gap-1 mt-1">
            <TrendingUp className="h-3 w-3 text-emerald-400 shrink-0" />
            <span className="text-xs text-emerald-400">{formatPercent(estimate.supplyApy)} APY</span>
          </div>
        </CardContent>
      </Card>

      <Card className="py-2 md:py-3">
        <CardContent className="p-3 md:p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Borrowed</p>
          <p className="text-lg md:text-xl font-semibold truncate">{formatUsd(estimate.totalBorrowed)}</p>
          {estimate.totalBorrowed > 0 && (
            <div className="flex items-center gap-1 mt-1">
              <TrendingDown className="h-3 w-3 text-red-400 shrink-0" />
              <span className="text-xs text-red-400">{formatPercent(estimate.borrowApy)} APY</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="py-2 md:py-3">
        <CardContent className="p-3 md:p-4">
          <p className="text-xs text-muted-foreground mb-1">Net APY</p>
          <p className={`text-lg md:text-xl font-semibold ${estimate.netApy >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {formatPercent(estimate.netApy)}
          </p>
          <p className="text-xs text-muted-foreground mt-1 truncate">
            Capacity: {formatUsd(estimate.borrowCap)}
          </p>
        </CardContent>
      </Card>

      <Card className="py-2 md:py-3">
        <CardContent className="p-3 md:p-4">
          <p className="text-xs text-muted-foreground mb-1">Borrow Limit</p>
          <div className="flex items-center gap-2">
            <p className={`text-lg md:text-xl font-semibold ${isDanger ? "text-red-400" : isWarning ? "text-yellow-400" : "text-emerald-400"}`}>
              {formatPercent(healthPercent)}
            </p>
            {isDanger && <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />}
          </div>
          <Progress
            value={healthPercent}
            className={`h-1.5 mt-2 ${
              isDanger ? "[&>div]:bg-red-400" :
              isWarning ? "[&>div]:bg-yellow-400" :
              "[&>div]:bg-emerald-400"
            }`}
          />
        </CardContent>
      </Card>
    </div>
  )
}

// Asset row for the positions table
function AssetRow({ position, blndPrice, formatUsd, formatYield }: {
  position: PositionWithYield
  blndPrice: number | null
  formatUsd: (value: number, decimals?: number) => string
  formatYield: (value: number) => string
}) {
  const [simulatorOpen, setSimulatorOpen] = useState(false)
  const hasCollateral = position.collateralAmount > 0
  const hasNonCollateral = position.nonCollateralAmount > 0
  const hasBorrow = position.borrowAmount > 0
  const hasYield = position.earnedYield !== 0

  return (
    <div className="py-6 border-b last:border-0 first:pt-0 last:pb-0">
      {/* Top row: Token info and APY badges */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <TokenLogo
            src={`/tokens/${position.symbol.toLowerCase()}.png`}
            symbol={position.symbol}
            size={32}
          />
          <div>
            <p className="font-medium">{position.symbol}</p>
            <p className="text-xs text-muted-foreground">
              {position.price?.usdPrice ? formatUsd(position.price.usdPrice, 4) : "-"}
            </p>
          </div>
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          <Badge variant="secondary" className="text-xs">
            <TrendingUp className="mr-1 h-3 w-3 text-emerald-400" />
            {formatPercent(position.supplyApy)}
          </Badge>
          {position.blndApy > 0 && (
            <Badge variant="outline" className="text-xs">
              <Flame className="mr-1 h-3 w-3" />
              +{formatPercent(position.blndApy)}
            </Badge>
          )}
          {hasBorrow && (
            <Badge variant="secondary" className="text-xs">
              <TrendingDown className="mr-1 h-3 w-3 text-red-400" />
              {formatPercent(position.borrowApy)}
            </Badge>
          )}
          {hasBorrow && position.borrowBlndApy > 0 && (
            <Badge variant="outline" className="text-xs">
              <Flame className="mr-1 h-3 w-3" />
              +{formatPercent(position.borrowBlndApy)}
            </Badge>
          )}
        </div>
      </div>

      {/* Position details grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm my-6">
        {/* Collateral */}
        {hasCollateral && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Collateral</p>
            <p className="font-mono text-white">{formatNumber(position.collateralAmount)}</p>
            <p className="text-xs text-muted-foreground">{formatUsd(position.collateralUsdValue)}</p>
          </div>
        )}

        {/* Non-Collateral */}
        {hasNonCollateral && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Non-Collateral</p>
            <p className="font-mono text-white">{formatNumber(position.nonCollateralAmount)}</p>
            <p className="text-xs text-muted-foreground">{formatUsd(position.nonCollateralUsdValue)}</p>
          </div>
        )}

        {/* Borrowed */}
        {hasBorrow && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Borrowed</p>
            <p className="font-mono text-red-400">{formatNumber(position.borrowAmount)}</p>
            <p className="text-xs text-red-400">{formatUsd(position.borrowUsdValue)}</p>
          </div>
        )}

        {/* Yield Earned */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Yield Earned</p>
          {hasYield ? (
            <div className="flex items-center gap-2">
              <p className={`font-mono ${position.earnedYield >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatYield(position.earnedYield)}
              </p>
              <Badge variant="secondary" className={`text-xs ${position.earnedYield >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {position.yieldPercentage >= 0 ? '+' : ''}{formatPercent(position.yieldPercentage)}
              </Badge>
            </div>
          ) : (
            <p className="text-muted-foreground">-</p>
          )}
        </div>

        {/* BLND Rewards */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">BLND Rewards</p>
          <p className="font-mono text-purple-400">
            ~{formatNumber(position.estimatedClaimableBlnd, 2)} BLND
            {position.estimatedClaimableBlnd > 0 && blndPrice && (
              <span className="text-xs text-muted-foreground font-sans"> ({formatUsd(position.estimatedClaimableBlnd * blndPrice)}) to claim</span>
            )}
          </p>
          {position.estimatedClaimedBlnd > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              ~{formatNumber(position.estimatedClaimedBlnd, 0)} BLND
              {blndPrice && ` (${formatUsd(position.estimatedClaimedBlnd * blndPrice)})`} claimed
            </p>
          )}
        </div>

        {/* Utilization */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Utilization</p>
          <div className="flex items-center gap-2">
            <Progress value={position.reserveUtilization * 100} className="h-1.5 w-16" />
            <span className="text-xs font-mono">{formatPercent(position.reserveUtilization * 100)}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            CF: {formatPercent(position.collateralFactor * 100)} · LF: {formatPercent(position.liabilityFactor * 100)}
          </p>
        </div>
      </div>

      {/* APY Sparklines - Supply APY (6mo) and BLND Emission APY (30d) */}
      <div className="space-y-3">
        <div className="bg-background/50 rounded-lg p-3 border border-border/30">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="h-3 w-3 text-emerald-500" />
            <span className="text-xs font-medium text-muted-foreground">Supply APY</span>
          </div>
          <ApySparkline
            poolId={position.poolId}
            assetAddress={position.assetId}
            currentApy={position.supplyApy}
            className="h-12 w-full"
          />
        </div>
        {position.blndApy > 0 && (
          <div className="bg-background/50 rounded-lg p-3 border border-border/30">
            <div className="flex items-center gap-1.5 mb-2">
              <Flame className="h-3 w-3 text-purple-500" />
              <span className="text-xs font-medium text-muted-foreground">BLND Emissions</span>
            </div>
            <BlndApySparkline
              poolId={position.poolId}
              type="lending_supply"
              assetAddress={position.assetId}
              currentApy={position.blndApy}
              className="h-12 w-full"
            />
          </div>
        )}

        {/* Action Links */}
        <div className="flex items-center gap-4 pt-2">
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
        poolId={position.poolId}
        poolName={position.poolName}
        assetId={position.assetId}
        tokenSymbol={position.symbol}
        initialData={{
          totalSupply: 0,
          totalBorrow: 0,
          supplyApy: position.supplyApy,
          blndApy: position.blndApy,
        }}
      />
    </div>
  )
}

// Mobile asset card
function MobileAssetCard({ position, blndPrice, formatUsd, formatYield }: {
  position: PositionWithYield
  blndPrice: number | null
  formatUsd: (value: number, decimals?: number) => string
  formatYield: (value: number) => string
}) {
  const [simulatorOpen, setSimulatorOpen] = useState(false)
  const hasCollateral = position.collateralAmount > 0
  const hasNonCollateral = position.nonCollateralAmount > 0
  const hasBorrow = position.borrowAmount > 0
  const hasYield = position.earnedYield !== 0

  return (
    <div className="py-6 border-b last:border-0 first:pt-0 last:pb-0">
      {/* Header with token info */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <TokenLogo
            src={`/tokens/${position.symbol.toLowerCase()}.png`}
            symbol={position.symbol}
            size={32}
          />
          <div>
            <p className="font-medium">{position.symbol}</p>
            <p className="text-xs text-muted-foreground">
              {position.price?.usdPrice ? formatUsd(position.price.usdPrice, 4) : "-"}
            </p>
          </div>
        </div>
      </div>

      {/* APY badges - in a row below header for better mobile layout */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        <Badge variant="secondary" className="text-xs">
          <TrendingUp className="mr-1 h-3 w-3 text-emerald-400" />
          {formatPercent(position.supplyApy)}
        </Badge>
        {position.blndApy > 0 && (
          <Badge variant="outline" className="text-xs">
            <Flame className="mr-1 h-3 w-3" />
            +{formatPercent(position.blndApy)}
          </Badge>
        )}
        {hasBorrow && (
          <Badge variant="secondary" className="text-xs">
            <TrendingDown className="mr-1 h-3 w-3 text-red-400" />
            {formatPercent(position.borrowApy)}
          </Badge>
        )}
        {hasBorrow && position.borrowBlndApy > 0 && (
          <Badge variant="outline" className="text-xs">
            <Flame className="mr-1 h-3 w-3" />
            +{formatPercent(position.borrowBlndApy)}
          </Badge>
        )}
      </div>

      {/* Position details */}
      <div className="grid grid-cols-2 gap-3 text-sm my-6">
        {hasCollateral && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Collateral</p>
            <p className="font-mono text-white">{formatNumber(position.collateralAmount)}</p>
            <p className="text-xs text-muted-foreground">{formatUsd(position.collateralUsdValue)}</p>
          </div>
        )}

        {hasNonCollateral && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Non-Collateral</p>
            <p className="font-mono text-white">{formatNumber(position.nonCollateralAmount)}</p>
            <p className="text-xs text-muted-foreground">{formatUsd(position.nonCollateralUsdValue)}</p>
          </div>
        )}

        {hasBorrow && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Borrowed</p>
            <p className="font-mono text-red-400">{formatNumber(position.borrowAmount)}</p>
            <p className="text-xs text-red-400">{formatUsd(position.borrowUsdValue)}</p>
          </div>
        )}

        {/* Yield Earned */}
        {hasYield && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Yield Earned</p>
            <div className="flex items-center gap-2">
              <p className={`font-mono ${position.earnedYield >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatYield(position.earnedYield)}
              </p>
              <Badge variant="secondary" className={`text-xs ${position.earnedYield >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {position.yieldPercentage >= 0 ? '+' : ''}{formatPercent(position.yieldPercentage)}
              </Badge>
            </div>
          </div>
        )}

        {/* BLND Rewards - full width */}
        <div className="col-span-2">
          <p className="text-xs text-muted-foreground mb-1">BLND Rewards</p>
          <p className="font-mono text-purple-400">
            ~{formatNumber(position.estimatedClaimableBlnd, 2)} BLND
            {position.estimatedClaimableBlnd > 0 && blndPrice && (
              <span className="text-xs text-muted-foreground font-sans"> ({formatUsd(position.estimatedClaimableBlnd * blndPrice)}) to claim</span>
            )}
          </p>
          {position.estimatedClaimedBlnd > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              ~{formatNumber(position.estimatedClaimedBlnd, 0)} BLND
              {blndPrice && ` (${formatUsd(position.estimatedClaimedBlnd * blndPrice)})`} claimed
            </p>
          )}
        </div>
      </div>

      {/* Reserve info */}
      <div className="mb-3 pt-3 border-t border-border/50">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Utilization</span>
          <div className="flex items-center gap-2">
            <Progress value={position.reserveUtilization * 100} className="w-16 h-1.5" />
            <span>{formatPercent(position.reserveUtilization * 100)}</span>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs mt-1">
          <span className="text-muted-foreground">Collateral Factor</span>
          <span>{formatPercent(position.collateralFactor * 100)}</span>
        </div>
        <div className="flex items-center justify-between text-xs mt-1">
          <span className="text-muted-foreground">Liability Factor</span>
          <span>{formatPercent(position.liabilityFactor * 100)}</span>
        </div>
      </div>

      {/* APY Sparklines - Supply APY (6mo) and BLND Emission APY (30d) */}
      <div className="space-y-3">
        <div className="bg-background/50 rounded-lg p-3 border border-border/30">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="h-3 w-3 text-emerald-500" />
            <span className="text-xs font-medium text-muted-foreground">Supply APY</span>
          </div>
          <ApySparkline
            poolId={position.poolId}
            assetAddress={position.assetId}
            currentApy={position.supplyApy}
            className="h-12 w-full"
          />
        </div>
        {position.blndApy > 0 && (
          <div className="bg-background/50 rounded-lg p-3 border border-border/30">
            <div className="flex items-center gap-1.5 mb-2">
              <Flame className="h-3 w-3 text-purple-500" />
              <span className="text-xs font-medium text-muted-foreground">BLND Emissions</span>
            </div>
            <BlndApySparkline
              poolId={position.poolId}
              type="lending_supply"
              assetAddress={position.assetId}
              currentApy={position.blndApy}
              className="h-12 w-full"
            />
          </div>
        )}

        {/* Action Links */}
        <div className="flex items-center gap-4 pt-2">
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
        poolId={position.poolId}
        poolName={position.poolName}
        assetId={position.assetId}
        tokenSymbol={position.symbol}
        initialData={{
          totalSupply: 0,
          totalBorrow: 0,
          supplyApy: position.supplyApy,
          blndApy: position.blndApy,
        }}
      />
    </div>
  )
}

// Format remaining time as "Xd Yh Zm"
function formatTimeRemaining(targetDate: Date): string {
  const now = Date.now()
  const diff = targetDate.getTime() - now

  if (diff <= 0) return "0d 0h 0m"

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`
  } else {
    return `${minutes}m`
  }
}

// Backstop section component
interface BackstopSectionProps {
  position: BlendBackstopPosition
  claimedLp?: number // Total LP tokens claimed from emissions
  formatUsd: (value: number, decimals?: number) => string
  formatYield: (value: number) => string
}

function BackstopSection({ position, claimedLp = 0, formatUsd, formatYield }: BackstopSectionProps) {
  const hasQ4w = position.q4wShares > BigInt(0)
  const q4wExpDate = position.q4wExpiration
    ? new Date(position.q4wExpiration * 1000)
    : null
  const isQ4wExpired = q4wExpDate && q4wExpDate <= new Date()
  const timeRemaining = q4wExpDate ? formatTimeRemaining(q4wExpDate) : ""

  // Pool-level Q4W percentage
  const poolQ4w = position.poolQ4wPercent

  // Calculate derived values
  const lpTokenPrice = position.lpTokens > 0 ? position.lpTokensUsd / position.lpTokens : 0
  const yieldUsd = position.yieldLp * lpTokenPrice

  // Use simulated LP tokens from on-chain RPC (exact match with Blend UI)
  // Falls back to 0 if simulation failed
  const claimableLp = position.simulatedEmissionsLp ?? 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Shield className="h-5 w-5 text-purple-500" />
          Backstop Position
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6 text-sm">
          {/* LP Tokens */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">LP Tokens</p>
            <p className="font-mono text-white">{formatNumber(position.lpTokens, 2)}</p>
            <p className="text-xs text-muted-foreground">{formatUsd(position.lpTokensUsd)}</p>
          </div>

          {/* Yield Rates */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Yield Rates</p>
            <div className="flex flex-wrap gap-1.5">
              {position.interestApr > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {formatPercent(position.interestApr)} APR
                </Badge>
              )}
              {position.emissionApy > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {formatPercent(position.emissionApy)} BLND
                </Badge>
              )}
            </div>
          </div>

          {/* Yield Earned */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Yield Earned</p>
            <div className="flex items-center gap-2">
              <p className={`font-mono ${position.yieldLp >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatYield(yieldUsd)}
              </p>
              <Badge variant="secondary" className={`text-xs ${position.yieldLp >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {position.yieldPercent >= 0 ? '+' : ''}{formatPercent(position.yieldPercent)}
              </Badge>
            </div>
          </div>

          {/* LP Rewards (from emissions) */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">LP Rewards</p>
            <p className="font-mono text-purple-400">
              {formatNumber(claimableLp, 2)} LP
              {claimableLp > 0 && lpTokenPrice > 0 && (
                <span className="text-xs text-muted-foreground font-sans"> ({formatUsd(claimableLp * lpTokenPrice)}) to claim</span>
              )}
            </p>
            {claimedLp > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatNumber(claimedLp, 2)} LP
                {lpTokenPrice > 0 && ` (${formatUsd(claimedLp * lpTokenPrice)})`} claimed
              </p>
            )}
          </div>

          {/* Pool Q4W */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Pool Q4W</p>
            <p className="font-mono text-white">{formatPercent(poolQ4w)}</p>
          </div>
        </div>

        {/* Charts Section */}
        <div className="space-y-3">
          <div className="bg-background/50 rounded-lg p-3 border border-border/30">
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="h-3 w-3 text-emerald-500" />
              <span className="text-xs font-medium text-muted-foreground">Interest APR</span>
            </div>
            <BackstopApySparkline
              poolId={position.poolId}
              currentApy={position.interestApr}
              className="h-12 w-full"
            />
          </div>
          {position.emissionApy > 0.005 && (
            <div className="bg-background/50 rounded-lg p-3 border border-border/30">
              <div className="flex items-center gap-1.5 mb-2">
                <Flame className="h-3 w-3 text-purple-500" />
                <span className="text-xs font-medium text-muted-foreground">BLND Emissions</span>
              </div>
              <BlndApySparkline
                poolId={position.poolId}
                type="backstop"
                currentApy={position.emissionApy}
                className="h-12 w-full"
              />
            </div>
          )}
          <div className="bg-background/50 rounded-lg p-3 border border-border/30">
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="h-3 w-3 text-purple-400" />
              <span className="text-xs font-medium text-muted-foreground">LP Token Price</span>
            </div>
            <LpPriceSparkline
              currentPrice={lpTokenPrice || undefined}
              className="h-12 w-full"
            />
          </div>
          <div className="bg-background/50 rounded-lg p-3 border border-border/30">
            <div className="flex items-center gap-1.5 mb-2">
              <Clock className="h-3 w-3 text-amber-500" />
              <span className="text-xs font-medium text-muted-foreground">Pool Q4W</span>
            </div>
            <Q4wSparkline
              poolId={position.poolId}
              currentQ4w={poolQ4w}
              className="h-12 w-full"
            />
          </div>
        </div>

        {/* User Q4W Status */}
        {hasQ4w && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
            <Clock className={`h-4 w-4 shrink-0 ${isQ4wExpired ? 'text-emerald-400' : 'text-amber-500'}`} />
            {isQ4wExpired ? (
              <span className="text-sm text-emerald-400 font-medium">
                {formatNumber(position.q4wLpTokens, 2)} LP ready to withdraw
              </span>
            ) : position.q4wChunks.length > 1 ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-sm text-amber-500 font-medium underline decoration-dotted cursor-pointer">
                    {formatNumber(position.q4wLpTokens, 2)} LP in {position.q4wChunks.length} unlocks
                  </span>
                </TooltipTrigger>
                <TooltipContent className="p-2.5">
                  <p className="font-medium text-zinc-400 mb-1.5">Unlock Schedule</p>
                  <div className="space-y-1">
                    {position.q4wChunks.map((chunk, i) => (
                      <div key={i} className="flex justify-between gap-6">
                        <span className="font-mono">{formatNumber(chunk.lpTokens, 2)} LP</span>
                        <span className="text-zinc-400">{formatTimeRemaining(new Date(chunk.expiration * 1000))}</span>
                      </div>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            ) : (
              <span className="text-sm text-amber-500 font-medium">
                {formatNumber(position.q4wLpTokens, 2)} LP unlocks in {timeRemaining}
              </span>
            )}
            <span className="text-sm text-muted-foreground">
              ({formatUsd(position.q4wLpTokensUsd)})
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Page header component to reduce duplication
function PageHeader({ title, subtitle, explorerUrl }: { title: string; subtitle?: string; explorerUrl?: string }) {
  return (
    <header className="border-b">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold truncate">{title}</h1>
            {subtitle && (
              <p className="text-xs text-muted-foreground font-mono truncate">{subtitle}</p>
            )}
          </div>
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0"
            >
              <span className="hidden sm:inline">View on Explorer</span>
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </header>
  )
}

export default function PoolDetailsPage() {
  const params = useParams()
  const poolId = decodeURIComponent(params.poolId as string)
  const queryClient = useQueryClient()
  const { capture } = useAnalytics()

  // Use the shared wallet state hook
  const { activeWallet } = useWalletState()

  // Currency preference hook
  const { format: formatInCurrency } = useCurrencyPreference()

  // Create format functions using the currency preference
  const formatUsd = (value: number, decimals = 2): string => {
    if (!Number.isFinite(value)) return formatInCurrency(0)
    // Show more decimals for dust amounts
    if (value > 0 && value < 0.01) {
      return formatInCurrency(value, {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6,
      })
    }
    return formatInCurrency(value, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  }

  const formatYield = (value: number): string => {
    return formatInCurrency(value, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay: "always",
    })
  }

  const { pools: dbPools } = usePoolsOnly()
  const trackedPools = useMemo(() => toTrackedPools(dbPools), [dbPools])

  const { data: snapshot, isLoading, error } = useQuery({
    queryKey: ["blend-wallet-snapshot", activeWallet?.publicKey, trackedPools.map(p => p.id).join(',')],
    enabled: !!activeWallet?.publicKey && trackedPools.length > 0,
    queryFn: () => fetchWalletBlendSnapshot(activeWallet?.publicKey, trackedPools),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })

  // Fetch backstop cost basis
  const { data: costBases } = useQuery({
    queryKey: ["backstop-cost-basis", activeWallet?.publicKey],
    enabled: !!activeWallet?.publicKey,
    queryFn: async () => {
      const response = await fetchWithTimeout(`/api/backstop-cost-basis?user=${encodeURIComponent(activeWallet!.publicKey)}`)
      if (!response.ok) throw new Error('Failed to fetch backstop cost basis')
      const data = await response.json()
      return (data.cost_bases || []) as BackstopCostBasis[]
    },
    staleTime: 60_000,
  })

  // Get unique asset addresses for positions in this pool
  const poolAssetAddresses = useMemo(() => {
    if (!snapshot) return []
    const positions = snapshot.positions.filter(p => p.poolId === poolId)
    return [...new Set(positions.map(p => p.assetId))]
  }, [snapshot, poolId])

  // Fetch balance history for all assets in a single batch request (optimization: N requests -> 1)
  const { data: balanceHistoryData } = useQuery<BalanceHistoryResult[]>({
    queryKey: ["pool-balance-history-batch", activeWallet?.publicKey, poolId, poolAssetAddresses.join(',')],
    enabled: !!activeWallet?.publicKey && poolAssetAddresses.length > 0,
    queryFn: async () => {
      const params = new URLSearchParams({
        user: activeWallet!.publicKey,
        assets: poolAssetAddresses.join(','),
        days: '365',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      const response = await fetchWithTimeout(`/api/balance-history-batch?${params.toString()}`)
      if (!response.ok) return []
      const data = await response.json()
      // Transform batch results to match the expected format
      return (data.results || []).map((result: { asset_address: string; history: BalanceHistoryRecord[]; firstEventDate: string | null }) => ({
        assetAddress: result.asset_address,
        data: { history: result.history, firstEventDate: result.firstEventDate }
      }))
    },
    staleTime: 60_000,
  })

  // Fetch claimed BLND data
  const { data: claimedBlndData } = useQuery({
    queryKey: ["claimed-blnd", activeWallet?.publicKey],
    enabled: !!activeWallet?.publicKey,
    queryFn: async () => {
      const response = await fetchWithTimeout(`/api/claimed-blnd?user=${encodeURIComponent(activeWallet!.publicKey)}`)
      if (!response.ok) throw new Error('Failed to fetch claimed BLND')
      const data = await response.json()
      return {
        poolClaims: (data.pool_claims || []) as PoolClaimData[],
        backstopClaims: (data.backstop_claims || []) as BackstopClaimData[],
      }
    },
    staleTime: 60_000,
  })

  // Build cost basis map from balance history
  const costBasisMap = useMemo(() => {
    const map = new Map<string, number>()
    if (!balanceHistoryData) return map

    balanceHistoryData.forEach((result) => {
      if (!result?.data?.history) return
      const { assetAddress, data } = result

      // Get latest cost basis for this pool from the history
      for (const record of data.history) {
        if (record.pool_id === poolId && record.total_cost_basis !== null) {
          const compositeKey = `${poolId}-${assetAddress}`
          map.set(compositeKey, record.total_cost_basis)
          break // First occurrence is latest (sorted by date desc)
        }
      }
    })

    return map
  }, [balanceHistoryData, poolId])

  const poolData = useMemo(() => {
    if (!snapshot) return null

    const poolEstimate = snapshot.poolEstimates.find(e => e.poolId === poolId)
    const poolPositions = snapshot.positions.filter(p => p.poolId === poolId)
    const rawBackstopPosition = snapshot.backstopPositions.find(bp => bp.poolId === poolId)

    // Enrich backstop position with yield data
    let backstopPosition: BlendBackstopPosition | null = null
    if (rawBackstopPosition && rawBackstopPosition.lpTokensUsd > 0) {
      const costBasis = costBases?.find(cb => cb.pool_address === poolId)
      if (costBasis) {
        // Include Q4W LP tokens in total - they're still the user's tokens, just locked
        const totalLpTokens = rawBackstopPosition.lpTokens + rawBackstopPosition.q4wLpTokens
        let yieldLp = totalLpTokens - costBasis.cost_basis_lp
        // Handle floating-point precision: treat very small values as zero
        const EPSILON = 0.0001
        if (Math.abs(yieldLp) < EPSILON) {
          yieldLp = 0
        }
        const yieldPercent = costBasis.cost_basis_lp > 0
          ? (yieldLp / costBasis.cost_basis_lp) * 100
          : 0
        backstopPosition = {
          ...rawBackstopPosition,
          costBasisLp: costBasis.cost_basis_lp,
          yieldLp,
          yieldPercent,
        }
      } else {
        backstopPosition = {
          ...rawBackstopPosition,
          costBasisLp: 0,
          yieldLp: 0,
          yieldPercent: 0,
        }
      }
    }

    // Get claimed BLND data for this pool
    const poolClaimData = claimedBlndData?.poolClaims?.find(pc => pc.pool_id === poolId)
    const backstopClaimData = claimedBlndData?.backstopClaims?.find(bc => bc.pool_address === poolId)

    // Get total claimable BLND for this pool from per-pool emissions
    // This is more reliable than summing per-position claimable amounts
    // as the SDK may not provide per-reserve breakdown
    const poolTotalClaimableBlnd = snapshot?.perPoolEmissions?.[poolId] || 0

    // Pool-level claimed BLND (from database) - need this before position calculation
    const poolTotalClaimedBlnd = poolClaimData?.total_claimed_blnd || 0

    // Calculate total supply USD value for proportional distribution
    const totalSupplyUsd = poolPositions.reduce((sum, pos) => sum + (pos.supplyUsdValue || 0), 0)

    // Enrich positions with yield data and distribute claimable/claimed BLND proportionally
    const positionsWithYield: PositionWithYield[] = poolPositions.map((position) => {
      const compositeKey = position.id // Already in format: poolId-assetAddress
      const costBasisTokens = costBasisMap.get(compositeKey)
      const usdPrice = position.price?.usdPrice || 1

      // Default values
      let earnedYield = 0
      let yieldPercentage = 0

      if (costBasisTokens !== undefined && costBasisTokens > 0) {
        const currentTokens = position.supplyAmount
        const yieldTokens = currentTokens - costBasisTokens

        // Handle floating-point precision
        const EPSILON = 0.0001
        if (Math.abs(yieldTokens) > EPSILON) {
          earnedYield = yieldTokens * usdPrice
          yieldPercentage = (yieldTokens / costBasisTokens) * 100
        }
      }

      // Calculate this position's share of pool's claimable BLND
      // Distribute proportionally based on supply USD value
      // Use SDK's per-reserve value if available, otherwise estimate from pool total
      const sdkClaimable = position.claimableBlnd || 0
      const estimatedClaimableBlnd = sdkClaimable > 0
        ? sdkClaimable
        : (totalSupplyUsd > 0 && poolTotalClaimableBlnd > 0
            ? poolTotalClaimableBlnd * ((position.supplyUsdValue || 0) / totalSupplyUsd)
            : 0)

      // Calculate this position's share of pool's claimed BLND (proportional distribution)
      // Claims are made at pool level, so we distribute based on supply USD value
      const estimatedClaimedBlnd = totalSupplyUsd > 0 && poolTotalClaimedBlnd > 0
        ? poolTotalClaimedBlnd * ((position.supplyUsdValue || 0) / totalSupplyUsd)
        : 0

      return {
        ...position,
        earnedYield,
        yieldPercentage,
        estimatedClaimableBlnd,
        estimatedClaimedBlnd,
      }
    })

    // Total claimable for UI display
    const totalClaimableBlnd = poolTotalClaimableBlnd

    // Pool-level claimed BLND (from database)
    const totalClaimedBlnd = poolTotalClaimedBlnd

    // Show pool if user has positions OR backstop
    const hasPositions = positionsWithYield.length > 0
    const hasBackstop = backstopPosition !== null

    if (!poolEstimate || (!hasPositions && !hasBackstop)) return null

    return {
      estimate: poolEstimate,
      positions: positionsWithYield,
      backstopPosition,
      backstopClaimedLp: backstopClaimData?.total_claimed_lp || 0,
      blndPerLpToken: snapshot?.blndPerLpToken || 0,
      poolName: positionsWithYield[0]?.poolName || backstopPosition?.poolName || "Unknown Pool",
      // Pool-level BLND data
      totalClaimableBlnd,
      totalClaimedBlnd,
      blndPrice: snapshot?.blndPrice || null,
    }
  }, [snapshot, poolId, costBases, costBasisMap, claimedBlndData])

  // Get pool info from tracked pools for explorer link
  const poolInfo = trackedPools.find(p => p.id === poolId)

  const handleRefresh = useCallback(async () => {
    if (!activeWallet?.publicKey) return

    capture('pull_to_refresh', { page: 'pool', pool_id: poolId })

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["blend-wallet-snapshot", activeWallet.publicKey] }),
      queryClient.invalidateQueries({ queryKey: ["backstop-cost-basis", activeWallet.publicKey] }),
      queryClient.invalidateQueries({ queryKey: ["pool-balance-history-batch", activeWallet.publicKey, poolId] }),
      queryClient.invalidateQueries({ queryKey: ["claimed-blnd", activeWallet.publicKey] }),
    ])
  }, [activeWallet?.publicKey, poolId, queryClient, capture])

  // Render content based on state
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="min-h-screen bg-background">
          <PageHeader title="Pool Details" />
          <main className="container mx-auto px-4 py-8">
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
              <div className="h-64 bg-muted animate-pulse rounded-lg" />
            </div>
          </main>
        </div>
      )
    }

    if (error) {
      return (
        <div className="min-h-screen bg-background">
          <PageHeader title="Pool Details" />
          <main className="container mx-auto px-4 py-8">
            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
              <p className="text-destructive text-sm">
                Error loading pool data: {error instanceof Error ? error.message : "Unknown error"}
              </p>
            </div>
          </main>
        </div>
      )
    }

    if (!poolData) {
      return (
        <div className="min-h-screen bg-background">
          <PageHeader title="Pool Details" />
          <main className="container mx-auto px-4 py-8">
            <div className="text-center py-8 text-muted-foreground">
              <p>No data found for this pool.</p>
              <p className="text-sm mt-2">
                The pool ID might be invalid or you don&apos;t have positions in this pool.
              </p>
              <Link href="/">
                <Button className="mt-4">Go to Home</Button>
              </Link>
            </div>
          </main>
        </div>
      )
    }

    return (
      <div className="min-h-screen bg-background">
        <PageHeader
          title={`${poolData.poolName} Pool`}
          explorerUrl={`https://stellar.expert/explorer/public/contract/${poolId}`}
        />

        <main className="container mx-auto px-4 py-6">
          <div className="space-y-6">
            {/* Summary Stats */}
            <PoolSummary estimate={poolData.estimate} formatUsd={formatUsd} />

            {/* Supply/Borrow Positions */}
            {poolData.positions.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Your Positions</CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Desktop */}
                  <div className="hidden md:block">
                    {poolData.positions.map((position) => (
                      <AssetRow key={position.id} position={position} blndPrice={poolData.blndPrice} formatUsd={formatUsd} formatYield={formatYield} />
                    ))}
                  </div>

                  {/* Mobile */}
                  <div className="md:hidden">
                    {poolData.positions.map((position) => (
                      <MobileAssetCard key={position.id} position={position} blndPrice={poolData.blndPrice} formatUsd={formatUsd} formatYield={formatYield} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Backstop Position */}
            {poolData.backstopPosition && (
              <BackstopSection
                position={poolData.backstopPosition}
                claimedLp={poolData.backstopClaimedLp}
                formatUsd={formatUsd}
                formatYield={formatYield}
              />
            )}
          </div>
        </main>
      </div>
    )
  }

  return (
    <AuthenticatedPage withLayout={false} onRefresh={handleRefresh}>
      {renderContent()}
    </AuthenticatedPage>
  )
}
