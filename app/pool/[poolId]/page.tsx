"use client"

import { useState, useEffect, useMemo } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, TrendingUp, TrendingDown, AlertTriangle, ExternalLink, Lock, Unlock, Flame, Shield, Clock } from "lucide-react"
import { ApySparkline } from "@/components/apy-sparkline"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { fetchWalletBlendSnapshot, type BlendReservePosition, type BlendPoolEstimate, type BlendBackstopPosition } from "@/lib/blend/positions"
import type { BackstopCostBasis } from "@/lib/db/types"
import { toTrackedPools } from "@/lib/blend/pools"
import { usePoolsOnly } from "@/hooks/use-metadata"
import { TokenLogo } from "@/components/token-logo"

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

const WALLETS_STORAGE_KEY = "stellar-wallet-tracked-addresses"
const ACTIVE_WALLET_STORAGE_KEY = "stellar-wallet-active-id"

interface Wallet {
  id: string
  publicKey: string
  name?: string
  isActive: boolean
}

function formatUsd(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "$0.00"
  // Show more decimals for dust amounts
  if (value > 0 && value < 0.01) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 6,
      maximumFractionDigits: 6,
    }).format(value)
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
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
function PoolSummary({ estimate }: { estimate: BlendPoolEstimate }) {
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
            <TrendingUp className="h-3 w-3 text-green-500 shrink-0" />
            <span className="text-xs text-green-500">{formatPercent(estimate.supplyApy)} APY</span>
          </div>
        </CardContent>
      </Card>

      <Card className="py-2 md:py-3">
        <CardContent className="p-3 md:p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Borrowed</p>
          <p className="text-lg md:text-xl font-semibold truncate">{formatUsd(estimate.totalBorrowed)}</p>
          {estimate.totalBorrowed > 0 && (
            <div className="flex items-center gap-1 mt-1">
              <TrendingDown className="h-3 w-3 text-red-500 shrink-0" />
              <span className="text-xs text-red-500">{formatPercent(estimate.borrowApy)} APY</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="py-2 md:py-3">
        <CardContent className="p-3 md:p-4">
          <p className="text-xs text-muted-foreground mb-1">Net APY</p>
          <p className={`text-lg md:text-xl font-semibold ${estimate.netApy >= 0 ? "text-green-500" : "text-red-500"}`}>
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
            <p className={`text-lg md:text-xl font-semibold ${isDanger ? "text-red-500" : isWarning ? "text-yellow-500" : "text-green-500"}`}>
              {formatPercent(healthPercent)}
            </p>
            {isDanger && <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />}
          </div>
          <Progress
            value={healthPercent}
            className={`h-1.5 mt-2 ${
              isDanger ? "[&>div]:bg-red-500" :
              isWarning ? "[&>div]:bg-yellow-500" :
              "[&>div]:bg-green-500"
            }`}
          />
        </CardContent>
      </Card>
    </div>
  )
}

// Asset row for the positions table
function AssetRow({ position, blndPrice }: { position: PositionWithYield; blndPrice: number | null }) {
  const hasCollateral = position.collateralAmount > 0
  const hasNonCollateral = position.nonCollateralAmount > 0
  const hasBorrow = position.borrowAmount > 0
  const hasYield = position.earnedYield !== 0

  const yieldFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "always",
  })

  return (
    <div className="py-4 border-b last:border-0">
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
            <TrendingUp className="mr-1 h-3 w-3 text-green-500" />
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
              <TrendingDown className="mr-1 h-3 w-3 text-red-500" />
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

      {/* APY Sparkline - 6 month history - full width */}
      <div className="mb-3">
        <ApySparkline
          poolId={position.poolId}
          assetAddress={position.assetId}
          currentApy={position.supplyApy}
          className="w-full h-12"
        />
      </div>

      {/* Position details grid */}
      <div className="grid grid-cols-6 gap-4 text-sm">
        {/* Collateral */}
        <div>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <Lock className="h-3 w-3 text-amber-500" />
            Collateral
          </p>
          {hasCollateral ? (
            <>
              <p className="font-mono text-white">{formatNumber(position.collateralAmount)}</p>
              <p className="text-xs text-muted-foreground">{formatUsd(position.collateralUsdValue)}</p>
            </>
          ) : (
            <p className="text-muted-foreground">-</p>
          )}
        </div>

        {/* Non-Collateral */}
        <div>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <Unlock className="h-3 w-3 text-green-500" />
            Non-Collateral
          </p>
          {hasNonCollateral ? (
            <>
              <p className="font-mono text-white">{formatNumber(position.nonCollateralAmount)}</p>
              <p className="text-xs text-muted-foreground">{formatUsd(position.nonCollateralUsdValue)}</p>
            </>
          ) : (
            <p className="text-muted-foreground">-</p>
          )}
        </div>

        {/* Borrowed */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Borrowed</p>
          {hasBorrow ? (
            <>
              <p className="font-mono text-red-400">{formatNumber(position.borrowAmount)}</p>
              <p className="text-xs text-red-400">{formatUsd(position.borrowUsdValue)}</p>
            </>
          ) : (
            <p className="text-muted-foreground">-</p>
          )}
        </div>

        {/* Yield Earned */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Yield Earned</p>
          {hasYield ? (
            <>
              <p className={`font-mono ${position.earnedYield >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {yieldFormatter.format(position.earnedYield)}
              </p>
              <p className={`text-xs ${position.earnedYield >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {position.yieldPercentage >= 0 ? '+' : ''}{formatPercent(position.yieldPercentage)}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">-</p>
          )}
        </div>

        {/* BLND Emissions per token - always show for visibility */}
        <div>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <Flame className="h-3 w-3 text-purple-500" />
            BLND Rewards
          </p>
          <div className="space-y-1">
            <div>
              <p className="font-mono text-purple-400">
                {position.estimatedClaimableBlnd > 0
                  ? `~${formatNumber(position.estimatedClaimableBlnd, 4)} BLND`
                  : '0 BLND'
                }
              </p>
              {position.estimatedClaimableBlnd > 0 && blndPrice && (
                <p className="text-xs text-muted-foreground">
                  {formatUsd(position.estimatedClaimableBlnd * blndPrice)}
                </p>
              )}
              <p className="text-xs text-muted-foreground">to claim</p>
            </div>
            {position.estimatedClaimedBlnd > 0 && (
              <div className="pt-1 border-t border-border/30">
                <p className="font-mono text-sm text-muted-foreground">
                  ~{formatNumber(position.estimatedClaimedBlnd, 2)} BLND
                </p>
                {blndPrice && (
                  <p className="text-xs text-muted-foreground">
                    {formatUsd(position.estimatedClaimedBlnd * blndPrice)}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">claimed</p>
              </div>
            )}
          </div>
        </div>

        {/* Reserve Info */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Utilization</p>
          <div className="flex items-center gap-2">
            <Progress value={position.reserveUtilization * 100} className="h-1.5 flex-1" />
            <span className="text-xs">{formatPercent(position.reserveUtilization * 100)}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            CF: {formatPercent(position.collateralFactor * 100)} · LF: {formatPercent(position.liabilityFactor * 100)}
          </p>
        </div>
      </div>
    </div>
  )
}

// Mobile asset card
function MobileAssetCard({ position, blndPrice }: { position: PositionWithYield; blndPrice: number | null }) {
  const hasCollateral = position.collateralAmount > 0
  const hasNonCollateral = position.nonCollateralAmount > 0
  const hasBorrow = position.borrowAmount > 0
  const hasYield = position.earnedYield !== 0

  const yieldFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "always",
  })

  return (
    <div className="py-4 border-b last:border-0">
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
          <TrendingUp className="mr-1 h-3 w-3 text-green-500" />
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
            <TrendingDown className="mr-1 h-3 w-3 text-red-500" />
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

      {/* APY Sparkline - 6 month history - full width */}
      <div className="mb-3">
        <ApySparkline
          poolId={position.poolId}
          assetAddress={position.assetId}
          currentApy={position.supplyApy}
          className="w-full h-10"
        />
      </div>

      {/* Position details */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        {hasCollateral && (
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
              <Lock className="h-3 w-3 text-amber-500" />
              Collateral
            </p>
            <p className="font-mono text-white">{formatNumber(position.collateralAmount)}</p>
            <p className="text-xs text-muted-foreground">{formatUsd(position.collateralUsdValue)}</p>
          </div>
        )}

        {hasNonCollateral && (
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
              <Unlock className="h-3 w-3 text-green-500" />
              Non-Collateral
            </p>
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
            <p className={`font-mono ${position.earnedYield >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {yieldFormatter.format(position.earnedYield)}
            </p>
            <p className={`text-xs ${position.earnedYield >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {position.yieldPercentage >= 0 ? '+' : ''}{formatPercent(position.yieldPercentage)}
            </p>
          </div>
        )}

        {/* BLND Rewards per token - always show */}
        <div>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <Flame className="h-3 w-3 text-purple-500" />
            BLND Rewards
          </p>
          <div className="space-y-1">
            <div>
              <p className="font-mono text-purple-400">
                {position.estimatedClaimableBlnd > 0
                  ? `~${formatNumber(position.estimatedClaimableBlnd, 4)} BLND`
                  : '0 BLND'
                }
              </p>
              {position.estimatedClaimableBlnd > 0 && blndPrice && (
                <p className="text-xs text-muted-foreground">
                  {formatUsd(position.estimatedClaimableBlnd * blndPrice)}
                </p>
              )}
              <p className="text-xs text-muted-foreground">to claim</p>
            </div>
            {position.estimatedClaimedBlnd > 0 && (
              <div className="pt-1 border-t border-border/30">
                <p className="font-mono text-sm text-muted-foreground">
                  ~{formatNumber(position.estimatedClaimedBlnd, 2)} BLND
                </p>
                {blndPrice && (
                  <p className="text-xs text-muted-foreground">
                    {formatUsd(position.estimatedClaimedBlnd * blndPrice)}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">claimed</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reserve info */}
      <div className="mt-3 pt-3 border-t border-border/50">
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
  blndPerLpToken?: number // BLND per LP token for conversion
  blndPrice?: number | null // BLND price in USD for displaying value
}

function BackstopSection({ position, claimedLp = 0, blndPerLpToken = 0, blndPrice }: BackstopSectionProps) {
  const hasQ4w = position.q4wShares > BigInt(0)
  const q4wExpDate = position.q4wExpiration
    ? new Date(position.q4wExpiration * 1000)
    : null
  const isQ4wExpired = q4wExpDate && q4wExpDate <= new Date()
  const timeRemaining = q4wExpDate ? formatTimeRemaining(q4wExpDate) : ""

  // Pool-level Q4W risk assessment
  const poolQ4w = position.poolQ4wPercent
  const isHighRisk = poolQ4w >= 15
  const isMediumRisk = poolQ4w >= 5 && poolQ4w < 15
  const q4wRiskColor = isHighRisk ? 'text-red-500' : isMediumRisk ? 'text-amber-500' : 'text-green-500'
  const q4wRiskBgColor = isHighRisk ? 'bg-red-500/10' : isMediumRisk ? 'bg-amber-500/10' : 'bg-green-500/10'

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Shield className="h-5 w-5 text-purple-500" />
          Backstop Position
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* LP Tokens */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">LP Tokens</p>
            <p className="font-mono text-lg">{formatNumber(position.lpTokens, 4)}</p>
            <p className="text-xs text-muted-foreground">{formatUsd(position.lpTokensUsd)}</p>
          </div>

          {/* Breakdown */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">LP Breakdown</p>
            <p className="text-sm">{formatNumber(position.blndAmount, 2)} BLND</p>
            <p className="text-sm">{formatNumber(position.usdcAmount, 2)} USDC</p>
          </div>

          {/* APR/APY */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Yield Rates</p>
            <div className="flex flex-col gap-1">
              {position.interestApr > 0 && (
                <Badge variant="secondary" className="text-xs w-fit">
                  <TrendingUp className="mr-1 h-3 w-3" />
                  {formatPercent(position.interestApr)} APR
                </Badge>
              )}
              {position.emissionApy > 0 && (
                <Badge variant="secondary" className="text-xs w-fit">
                  <Flame className="mr-1 h-3 w-3" />
                  {formatPercent(position.emissionApy)} BLND
                </Badge>
              )}
            </div>
          </div>

          {/* Yield Earned */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Yield Earned</p>
            {(() => {
              // Calculate yield in USD
              const lpTokenPrice = position.lpTokens > 0
                ? position.lpTokensUsd / position.lpTokens
                : 0
              const yieldUsd = position.yieldLp * lpTokenPrice
              const yieldFormatter = new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
                signDisplay: "always",
              })

              // Convert claimed LP to BLND (approximate based on current LP composition)
              const claimedBlndApprox = claimedLp * blndPerLpToken

              return (
                <>
                  <p className={`font-mono ${position.yieldLp >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                    {yieldFormatter.format(yieldUsd)}
                  </p>
                  <p className={`text-xs ${position.yieldLp >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                    {position.yieldPercent >= 0 ? '+' : ''}{formatPercent(position.yieldPercent)}
                  </p>
                  {/* BLND Emissions - always show */}
                  <div className="mt-1 pt-1 border-t border-border/30">
                    <p className="text-xs text-purple-400">
                      <Flame className="inline h-3 w-3 mr-1" />
                      {position.claimableBlnd > 0
                        ? `${formatNumber(position.claimableBlnd, 4)} BLND to claim`
                        : '0 BLND to claim'
                      }
                    </p>
                    {position.claimableBlnd > 0 && blndPrice && (
                      <p className="text-xs text-muted-foreground">
                        {formatUsd(position.claimableBlnd * blndPrice)}
                      </p>
                    )}
                    {claimedBlndApprox > 0 && (
                      <p className="text-xs text-muted-foreground">
                        ~{formatNumber(claimedBlndApprox, 2)} BLND claimed
                        {blndPrice && ` (${formatUsd(claimedBlndApprox * blndPrice)})`}
                      </p>
                    )}
                  </div>
                </>
              )
            })()}
          </div>
        </div>

        {/* Pool Q4W Risk Indicator */}
        <div className="mt-4 pt-4 border-t">
          <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-lg ${q4wRiskBgColor}`}>
            <div className="flex items-center gap-2">
              {isHighRisk && <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />}
              <div>
                <p className="text-xs text-muted-foreground">Pool Q4W</p>
                <p className={`font-mono font-semibold ${q4wRiskColor}`}>
                  {formatPercent(poolQ4w)}
                </p>
              </div>
            </div>
            <div className="sm:text-right">
              <p className="text-xs text-muted-foreground">Capital queued for withdrawal</p>
              <p className={`text-xs ${q4wRiskColor}`}>
                {isHighRisk ? 'High risk - reduced coverage' :
                 isMediumRisk ? 'Moderate risk - monitor' :
                 'Low risk - healthy backstop'}
              </p>
            </div>
          </div>
        </div>

        {/* User Q4W Status */}
        {hasQ4w && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Clock className={`h-4 w-4 shrink-0 ${isQ4wExpired ? 'text-green-500' : 'text-amber-500'}`} />
              <span className={`text-sm ${isQ4wExpired ? 'text-green-500' : 'text-amber-500'}`}>
                {isQ4wExpired
                  ? `${formatNumber(position.q4wLpTokens, 2)} LP ready to withdraw`
                  : `${formatNumber(position.q4wLpTokens, 2)} LP unlocks in ${timeRemaining}`
                }
              </span>
              <span className="text-xs text-muted-foreground">
                ({formatUsd(position.q4wLpTokensUsd)})
              </span>
            </div>
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
  const [activeWallet, setActiveWallet] = useState<Wallet | null>(null)

  const { pools: dbPools } = usePoolsOnly()
  const trackedPools = useMemo(() => toTrackedPools(dbPools), [dbPools])

  useEffect(() => {
    try {
      const savedWallets = localStorage.getItem(WALLETS_STORAGE_KEY)
      const savedActiveId = localStorage.getItem(ACTIVE_WALLET_STORAGE_KEY)

      if (savedWallets && savedActiveId) {
        const parsedWallets = JSON.parse(savedWallets) as Wallet[]
        const active = parsedWallets.find((w) => w.id === savedActiveId)
        if (active) {
          setActiveWallet(active)
        }
      }
    } catch (error) {
      console.error("Error loading wallet from localStorage:", error)
    }
  }, [])

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
      const response = await fetch(`/api/backstop-cost-basis?user=${encodeURIComponent(activeWallet!.publicKey)}`)
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

  // Fetch balance history for each asset to get cost basis
  const { data: balanceHistoryData } = useQuery({
    queryKey: ["pool-balance-history", activeWallet?.publicKey, poolId, poolAssetAddresses.join(',')],
    enabled: !!activeWallet?.publicKey && poolAssetAddresses.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        poolAssetAddresses.map(async (assetAddress) => {
          const response = await fetch(
            `/api/balance-history?user=${encodeURIComponent(activeWallet!.publicKey)}&asset=${encodeURIComponent(assetAddress)}`
          )
          if (!response.ok) return null
          const data = await response.json()
          return { assetAddress, data }
        })
      )
      return results.filter(r => r !== null)
    },
    staleTime: 60_000,
  })

  // Fetch claimed BLND data
  const { data: claimedBlndData } = useQuery({
    queryKey: ["claimed-blnd", activeWallet?.publicKey],
    enabled: !!activeWallet?.publicKey,
    queryFn: async () => {
      const response = await fetch(`/api/claimed-blnd?user=${encodeURIComponent(activeWallet!.publicKey)}`)
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
      blndPerLpToken: snapshot?.backstopPositions?.[0]?.blndAmount && snapshot?.backstopPositions?.[0]?.lpTokens
        ? snapshot.backstopPositions[0].blndAmount / snapshot.backstopPositions[0].lpTokens
        : 0,
      poolName: positionsWithYield[0]?.poolName || backstopPosition?.poolName || "Unknown Pool",
      // Pool-level BLND data
      totalClaimableBlnd,
      totalClaimedBlnd,
      blndPrice: snapshot?.blndPrice || null,
    }
  }, [snapshot, poolId, costBases, costBasisMap, claimedBlndData])

  // Get pool info from tracked pools for explorer link
  const poolInfo = trackedPools.find(p => p.id === poolId)

  if (!activeWallet) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader title="Pool Details" />
        <main className="container mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <h2 className="text-2xl font-semibold mb-4">No Wallet Connected</h2>
            <p className="text-muted-foreground mb-8 max-w-md">
              Please connect a wallet to view pool details.
            </p>
            <Link href="/">
              <Button>Go to Home</Button>
            </Link>
          </div>
        </main>
      </div>
    )
  }

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
          <PoolSummary estimate={poolData.estimate} />

          {/* Supply/Borrow Positions */}
          {poolData.positions.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Your Positions</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Desktop */}
                <div className="hidden md:block">
                  {poolData.positions.map((position) => (
                    <AssetRow key={position.id} position={position} blndPrice={poolData.blndPrice} />
                  ))}
                </div>

                {/* Mobile */}
                <div className="md:hidden">
                  {poolData.positions.map((position) => (
                    <MobileAssetCard key={position.id} position={position} blndPrice={poolData.blndPrice} />
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
              blndPerLpToken={poolData.blndPerLpToken}
              blndPrice={poolData.blndPrice}
            />
          )}
        </div>
      </main>
    </div>
  )
}
