"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ExternalLink,
  Flame,
  Shield,
  Clock,
  Calculator,
  DollarSign,
  Info,
} from "lucide-react";
import { ApySparkline } from "@/components/apy-sparkline";
import { BackstopApySparkline } from "@/components/backstop-apy-sparkline";
import { BlndApySparkline } from "@/components/blnd-apy-sparkline";
import { LpPriceSparkline } from "@/components/lp-price-sparkline";
import { Q4wSparkline } from "@/components/q4w-sparkline";
import { TokenPriceSparkline } from "@/components/token-price-sparkline";
import { YieldDisplay } from "@/components/yield-display";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  fetchWalletBlendSnapshot,
  type BlendReservePosition,
  type BlendPoolEstimate,
  type BlendBackstopPosition,
  type BlendWalletSnapshot,
} from "@/lib/blend/positions";
import { FixedMath } from "@blend-capital/blend-sdk";
import { fetchWithTimeout } from "@/lib/fetch-utils";
import type { BackstopCostBasis } from "@/lib/db/types";
import { toTrackedPools } from "@/lib/blend/pools";
import { usePoolsOnly } from "@/hooks/use-metadata";
import { TokenLogo } from "@/components/token-logo";
import { useCurrencyPreference } from "@/hooks/use-currency-preference";
import { useWalletState } from "@/hooks/use-wallet-state";
import { useAnalytics } from "@/hooks/use-analytics";
import { AuthenticatedPage } from "@/components/authenticated-page";
import { ApySimulatorContainer } from "@/components/apy-simulator";
import { useHistoricalYieldBreakdown } from "@/hooks/use-historical-yield-breakdown";
import type { YieldBreakdown } from "@/components/yield-display";

// Extended position type with yield data
interface PositionWithYield extends BlendReservePosition {
  earnedYield: number;
  yieldPercentage: number;
  yieldBreakdown?: YieldBreakdown;
  estimatedClaimableBlnd: number; // Per-position share of pool's claimable BLND
  estimatedClaimedBlnd: number; // Per-position share of pool's claimed BLND (proportional)
}

// Types for claimed BLND API response
interface PoolClaimData {
  pool_id: string;
  total_claimed_blnd: number;
  claim_count: number;
  last_claim_date: string | null;
}

interface BackstopClaimData {
  pool_address: string;
  total_claimed_lp: number;
  claim_count: number;
  last_claim_date: string | null;
}

interface BalanceHistoryRecord {
  pool_id: string;
  total_cost_basis: number | null;
  [key: string]: unknown;
}

interface BalanceHistoryResult {
  assetAddress: string;
  data: {
    history: BalanceHistoryRecord[];
    firstEventDate: string | null;
  };
}

function formatNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "0";
  if (value >= 1000000) {
    return (
      (value / 1000000).toLocaleString("en-US", { maximumFractionDigits: 2 }) +
      "M"
    );
  }
  if (value >= 1000) {
    return (
      (value / 1000).toLocaleString("en-US", { maximumFractionDigits: 2 }) + "K"
    );
  }
  // Show more decimals for dust amounts
  if (value > 0 && value < 0.01) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 6,
      maximumFractionDigits: 6,
    });
  }
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatNumberFull(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "0";
  // Show more decimals for dust amounts
  if (value > 0 && value < 0.01) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 6,
      maximumFractionDigits: 6,
    });
  }
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatPercent(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

// Summary stats at top
function PoolSummary({
  estimate,
  formatUsd,
}: {
  estimate: BlendPoolEstimate;
  formatUsd: (value: number, decimals?: number) => string;
}) {
  const healthPercent = Math.min(estimate.borrowLimit * 100, 100);
  const isDanger = estimate.borrowLimit >= 0.8;
  const isWarning = estimate.borrowLimit >= 0.5 && estimate.borrowLimit < 0.8;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      <Card className="py-2 md:py-3">
        <CardContent className="p-3 md:p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Supplied</p>
          <p className="text-lg md:text-xl font-semibold truncate">
            {formatUsd(estimate.totalSupplied)}
          </p>
          <div className="flex items-center gap-1 mt-1">
            <TrendingUp className="h-3 w-3 text-emerald-400 shrink-0" />
            <span className="text-xs text-emerald-400">
              {formatPercent(estimate.supplyApy)} APY
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="py-2 md:py-3">
        <CardContent className="p-3 md:p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Borrowed</p>
          <p className="text-lg md:text-xl font-semibold truncate">
            {formatUsd(estimate.totalBorrowed)}
          </p>
          {estimate.totalBorrowed > 0 && (
            <div className="flex items-center gap-1 mt-1">
              <TrendingDown className="h-3 w-3 text-red-400 shrink-0" />
              <span className="text-xs text-red-400">
                {formatPercent(estimate.borrowApy)} APY
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="py-2 md:py-3">
        <CardContent className="p-3 md:p-4">
          <p className="text-xs text-muted-foreground mb-1">Net APY</p>
          <p
            className={`text-lg md:text-xl font-semibold ${estimate.netApy >= 0 ? "text-emerald-400" : "text-red-400"}`}
          >
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
            <p
              className={`text-lg md:text-xl font-semibold ${isDanger ? "text-red-400" : isWarning ? "text-yellow-400" : "text-emerald-400"}`}
            >
              {formatPercent(healthPercent)}
            </p>
            {isDanger && (
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            )}
          </div>
          <Progress
            value={healthPercent}
            className={`h-1.5 mt-2 ${
              isDanger
                ? "[&>div]:bg-red-400"
                : isWarning
                  ? "[&>div]:bg-yellow-400"
                  : "[&>div]:bg-emerald-400"
            }`}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// Asset row for the positions table
function AssetRow({
  position,
  blndPrice,
  formatUsd,
  formatYield,
}: {
  position: PositionWithYield;
  blndPrice: number | null;
  formatUsd: (value: number, decimals?: number) => string;
  formatYield: (value: number) => string;
}) {
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const hasCollateral = position.collateralAmount > 0;
  const hasNonCollateral = position.nonCollateralAmount > 0;
  const hasBorrow = position.borrowAmount > 0;
  const hasYield = position.earnedYield !== 0;

  // Calculate total supply for display
  const totalSupplyAmount =
    position.collateralAmount + position.nonCollateralAmount;
  const totalSupplyUsd =
    position.collateralUsdValue + position.nonCollateralUsdValue;

  return (
    <div className="py-6 border-b last:border-0 first:pt-0 last:pb-0">
      {/* Top row: Token info with balance and APY badges - matching home page layout */}
      <div className="flex items-center justify-between py-2 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <TokenLogo
            src={`/tokens/${position.symbol.toLowerCase()}.png`}
            symbol={position.symbol}
            size={36}
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">{position.symbol}</p>
            <p className="text-sm text-muted-foreground truncate">
              {formatUsd(totalSupplyUsd)}
              <span className="text-xs ml-1">
                ({formatNumber(totalSupplyAmount)} {position.symbol})
              </span>
            </p>
            <YieldDisplay
              earnedYield={position.earnedYield}
              yieldPercentage={position.yieldPercentage}
              yieldBreakdown={position.yieldBreakdown}
              formatUsdAmount={formatUsd}
              formatYieldValue={formatYield}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1 items-start shrink-0 w-[110px]">
          <Badge variant="secondary" className="text-xs">
            <TrendingUp className="mr-1 h-3 w-3" />
            {formatPercent(position.supplyApy)} APY
          </Badge>
          {position.blndApy > 0.005 && (
            <Badge variant="secondary" className="text-xs">
              <Flame className="mr-1 h-3 w-3" />
              {formatPercent(position.blndApy)} BLND
            </Badge>
          )}
        </div>
      </div>

      {/* Borrow info if applicable */}
      {hasBorrow && (
        <div className="flex items-center justify-between py-2 gap-3 border-t border-border/50 mt-2 pt-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9" /> {/* Spacer to align with token logo */}
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate text-red-400">Borrowed</p>
              <p className="text-sm text-red-400 truncate">
                {formatUsd(position.borrowUsdValue)}
                <span className="text-xs ml-1">
                  ({formatNumber(position.borrowAmount)} {position.symbol})
                </span>
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-1 items-start shrink-0 w-[110px]">
            <Badge variant="secondary" className="text-xs">
              <TrendingDown className="mr-1 h-3 w-3 text-red-400" />
              {formatPercent(position.borrowApy)} APY
            </Badge>
            {position.borrowBlndApy > 0.005 && (
              <Badge variant="secondary" className="text-xs">
                <Flame className="mr-1 h-3 w-3" />
                {formatPercent(position.borrowBlndApy)} BLND
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Position details */}
      <div className="space-y-4 text-sm my-6">
        {/* BLND Rewards */}
        {(position.estimatedClaimableBlnd > 0 || position.estimatedClaimedBlnd > 0) && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">BLND Rewards</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                <p className="text-xs text-muted-foreground mb-1">Claimable</p>
                <p className="font-mono text-purple-400">
                  {formatNumberFull(position.estimatedClaimableBlnd, 2)} BLND
                </p>
                {position.estimatedClaimableBlnd > 0 && blndPrice && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatUsd(position.estimatedClaimableBlnd * blndPrice)}
                  </p>
                )}
              </div>
              <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                <p className="text-xs text-muted-foreground mb-1">Claimed</p>
                <p className="font-mono text-foreground">
                  {formatNumberFull(position.estimatedClaimedBlnd, 0)} BLND
                </p>
                {position.estimatedClaimedBlnd > 0 && blndPrice && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatUsd(position.estimatedClaimedBlnd * blndPrice)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* APY Sparklines - Supply APY (6mo) and BLND Emission APY (30d) */}
      <div className="space-y-3">
        <div className="bg-background/50 rounded-lg p-3 border border-border/30">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="h-3 w-3 text-emerald-500" />
            <span className="text-xs font-medium text-muted-foreground">
              Supply APY
            </span>
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
              <span className="text-xs font-medium text-muted-foreground">
                BLND Emissions
              </span>
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
        <div className="bg-background/50 rounded-lg p-3 border border-border/30">
          <div className="flex items-center gap-1.5 mb-2">
            <DollarSign className="h-3 w-3 text-blue-500" />
            <span className="text-xs font-medium text-muted-foreground">
              {position.symbol} Price
            </span>
          </div>
          <TokenPriceSparkline
            tokenAddress={position.assetId}
            tokenSymbol={position.symbol}
            className="h-12 w-full"
          />
        </div>

        {/* Utilization */}
        <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground pt-2">
          <span>
            Utilization: <span className="font-mono">{formatPercent(position.reserveUtilization * 100)}</span>
          </span>
          <span>·</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-pointer underline decoration-dotted">
                CF: {formatPercent(position.collateralFactor * 100)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>Collateral Factor</p>
            </TooltipContent>
          </Tooltip>
          <span>·</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-pointer underline decoration-dotted">
                LF: {formatPercent(position.liabilityFactor * 100)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>Liability Factor</p>
            </TooltipContent>
          </Tooltip>
        </div>

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
  );
}

// Mobile asset card
function MobileAssetCard({
  position,
  blndPrice,
  formatUsd,
  formatYield,
}: {
  position: PositionWithYield;
  blndPrice: number | null;
  formatUsd: (value: number, decimals?: number) => string;
  formatYield: (value: number) => string;
}) {
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const hasCollateral = position.collateralAmount > 0;
  const hasNonCollateral = position.nonCollateralAmount > 0;
  const hasBorrow = position.borrowAmount > 0;
  const hasYield = position.earnedYield !== 0;

  // Calculate total supply for display
  const totalSupplyAmount =
    position.collateralAmount + position.nonCollateralAmount;
  const totalSupplyUsd =
    position.collateralUsdValue + position.nonCollateralUsdValue;

  return (
    <div className="py-6 border-b last:border-0 first:pt-0 last:pb-0">
      {/* Top row: Token info with balance and APY badges - matching home page layout */}
      <div className="flex items-center justify-between py-2 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <TokenLogo
            src={`/tokens/${position.symbol.toLowerCase()}.png`}
            symbol={position.symbol}
            size={36}
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">{position.symbol}</p>
            <p className="text-sm text-muted-foreground truncate">
              {formatUsd(totalSupplyUsd)}
              <span className="text-xs ml-1">
                ({formatNumber(totalSupplyAmount)} {position.symbol})
              </span>
            </p>
            <YieldDisplay
              earnedYield={position.earnedYield}
              yieldPercentage={position.yieldPercentage}
              yieldBreakdown={position.yieldBreakdown}
              formatUsdAmount={formatUsd}
              formatYieldValue={formatYield}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1 items-start shrink-0 w-[110px]">
          <Badge variant="secondary" className="text-xs">
            <TrendingUp className="mr-1 h-3 w-3" />
            {formatPercent(position.supplyApy)} APY
          </Badge>
          {position.blndApy > 0.005 && (
            <Badge variant="secondary" className="text-xs">
              <Flame className="mr-1 h-3 w-3" />
              {formatPercent(position.blndApy)} BLND
            </Badge>
          )}
        </div>
      </div>

      {/* Borrow info if applicable */}
      {hasBorrow && (
        <div className="flex items-center justify-between py-2 gap-3 border-t border-border/50 mt-2 pt-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9" /> {/* Spacer to align with token logo */}
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate text-red-400">Borrowed</p>
              <p className="text-sm text-red-400 truncate">
                {formatUsd(position.borrowUsdValue)}
                <span className="text-xs ml-1">
                  ({formatNumber(position.borrowAmount)} {position.symbol})
                </span>
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-1 items-start shrink-0 w-[110px]">
            <Badge variant="secondary" className="text-xs">
              <TrendingDown className="mr-1 h-3 w-3 text-red-400" />
              {formatPercent(position.borrowApy)} APY
            </Badge>
            {position.borrowBlndApy > 0.005 && (
              <Badge variant="secondary" className="text-xs">
                <Flame className="mr-1 h-3 w-3" />
                {formatPercent(position.borrowBlndApy)} BLND
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Position details */}
      <div className="space-y-4 text-sm my-6">
        {/* BLND Rewards */}
        {(position.estimatedClaimableBlnd > 0 || position.estimatedClaimedBlnd > 0) && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">BLND Rewards</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                <p className="text-xs text-muted-foreground mb-1">Claimable</p>
                <p className="font-mono text-purple-400">
                  {formatNumberFull(position.estimatedClaimableBlnd, 2)} BLND
                </p>
                {position.estimatedClaimableBlnd > 0 && blndPrice && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatUsd(position.estimatedClaimableBlnd * blndPrice)}
                  </p>
                )}
              </div>
              <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                <p className="text-xs text-muted-foreground mb-1">Claimed</p>
                <p className="font-mono text-foreground">
                  {formatNumberFull(position.estimatedClaimedBlnd, 0)} BLND
                </p>
                {position.estimatedClaimedBlnd > 0 && blndPrice && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatUsd(position.estimatedClaimedBlnd * blndPrice)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* APY Sparklines - Supply APY (6mo) and BLND Emission APY (30d) */}
      <div className="space-y-3">
        <div className="bg-background/50 rounded-lg p-3 border border-border/30">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="h-3 w-3 text-emerald-500" />
            <span className="text-xs font-medium text-muted-foreground">
              Supply APY
            </span>
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
              <span className="text-xs font-medium text-muted-foreground">
                BLND Emissions
              </span>
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
        <div className="bg-background/50 rounded-lg p-3 border border-border/30">
          <div className="flex items-center gap-1.5 mb-2">
            <DollarSign className="h-3 w-3 text-blue-500" />
            <span className="text-xs font-medium text-muted-foreground">
              {position.symbol} Price
            </span>
          </div>
          <TokenPriceSparkline
            tokenAddress={position.assetId}
            tokenSymbol={position.symbol}
            className="h-12 w-full"
          />
        </div>

        {/* Utilization */}
        <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground pt-2">
          <span>
            Utilization: <span className="font-mono">{formatPercent(position.reserveUtilization * 100)}</span>
          </span>
          <span>·</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-pointer underline decoration-dotted">
                CF: {formatPercent(position.collateralFactor * 100)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>Collateral Factor</p>
            </TooltipContent>
          </Tooltip>
          <span>·</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-pointer underline decoration-dotted">
                LF: {formatPercent(position.liabilityFactor * 100)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>Liability Factor</p>
            </TooltipContent>
          </Tooltip>
        </div>

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
  );
}

// Format remaining time as "Xd Yh Zm"
function formatTimeRemaining(targetDate: Date): string {
  const now = Date.now();
  const diff = targetDate.getTime() - now;

  if (diff <= 0) return "0d 0h 0m";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

// Backstop section component
interface BackstopSectionProps {
  position: BlendBackstopPosition;
  claimedLp?: number; // Total LP tokens claimed from emissions
  backstopYieldBreakdown?: YieldBreakdown;
  formatUsd: (value: number, decimals?: number) => string;
  formatYield: (value: number) => string;
}

function BackstopSection({
  position,
  claimedLp = 0,
  backstopYieldBreakdown,
  formatUsd,
  formatYield,
}: BackstopSectionProps) {
  const hasQ4w = position.q4wShares > BigInt(0);
  const q4wExpDate = position.q4wExpiration
    ? new Date(position.q4wExpiration * 1000)
    : null;
  const isQ4wExpired = q4wExpDate && q4wExpDate <= new Date();
  const timeRemaining = q4wExpDate ? formatTimeRemaining(q4wExpDate) : "";

  // Pool-level Q4W percentage
  const poolQ4w = position.poolQ4wPercent;

  // Calculate derived values
  const lpTokenPrice =
    position.lpTokens > 0 ? position.lpTokensUsd / position.lpTokens : 0;
  const yieldUsd = position.yieldLp * lpTokenPrice;

  // Use simulated LP tokens from on-chain RPC (exact match with Blend UI)
  // Falls back to 0 if simulation failed
  const claimableLp = position.simulatedEmissionsLp ?? 0;

  // Calculate yield percentage for display
  const yieldPercentage = position.yieldPercent;

  return (
    <Card className="py-2 gap-0">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-lg">Backstop Position</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pt-0 pb-1 space-y-6">
        {/* Main row: Backstop info with APY badges - matching home page layout */}
        <div className="flex items-center justify-between py-2 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-purple-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">Backstop</p>
              <p className="text-sm text-muted-foreground truncate">
                {formatUsd(position.lpTokensUsd)}
                <span className="text-xs ml-1">
                  ({formatNumber(position.lpTokens, 2)} LP)
                </span>
              </p>
              <YieldDisplay
                earnedYield={yieldUsd}
                yieldPercentage={yieldPercentage}
                yieldBreakdown={backstopYieldBreakdown}
                formatUsdAmount={formatUsd}
                formatYieldValue={formatYield}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1 items-start shrink-0 w-[110px]">
            {position.interestApr > 0 && (
              <Badge variant="secondary" className="text-xs">
                <TrendingUp className="mr-1 h-3 w-3" />
                {formatPercent(position.interestApr)} APR
              </Badge>
            )}
            {position.emissionApy > 0 && (
              <Badge variant="secondary" className="text-xs">
                <Flame className="mr-1 h-3 w-3" />
                {formatPercent(position.emissionApy)} BLND
              </Badge>
            )}
          </div>
        </div>

        {/* LP Rewards row */}
        {(claimableLp > 0 || claimedLp > 0) && (
          <div className="text-sm">
            <p className="text-xs text-muted-foreground mb-2">LP Rewards</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                <p className="text-xs text-muted-foreground mb-1">Claimable</p>
                <p className="font-mono text-purple-400">
                  {formatNumber(claimableLp, 2)} LP
                </p>
                {claimableLp > 0 && lpTokenPrice > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatUsd(claimableLp * lpTokenPrice)}
                  </p>
                )}
              </div>
              <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                <p className="text-xs text-muted-foreground mb-1">Claimed</p>
                <p className="font-mono text-foreground">
                  {formatNumber(claimedLp, 2)} LP
                </p>
                {claimedLp > 0 && lpTokenPrice > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatUsd(claimedLp * lpTokenPrice)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Charts Section */}
        <div className="space-y-3">
          <div className="bg-background/50 rounded-lg p-3 border border-border/30">
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="h-3 w-3 text-emerald-500" />
              <span className="text-xs font-medium text-muted-foreground">
                Interest APR
              </span>
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
                <span className="text-xs font-medium text-muted-foreground">
                  BLND Emissions
                </span>
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
              <span className="text-xs font-medium text-muted-foreground">
                LP Token Price
              </span>
            </div>
            <LpPriceSparkline
              currentPrice={lpTokenPrice || undefined}
              className="h-12 w-full"
            />
          </div>
          <div className="bg-background/50 rounded-lg p-3 border border-border/30">
            <div className="flex items-center gap-1.5 mb-2">
              <Clock className="h-3 w-3 text-amber-500" />
              <span className="text-xs font-medium text-muted-foreground">
                Pool Q4W
              </span>
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
            <Clock
              className={`h-4 w-4 shrink-0 ${isQ4wExpired ? "text-emerald-400" : "text-amber-500"}`}
            />
            {isQ4wExpired ? (
              <span className="text-sm text-emerald-400 font-medium">
                {formatNumber(position.q4wLpTokens, 2)} LP ready to withdraw
              </span>
            ) : position.q4wChunks.length > 1 ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-sm text-amber-500 font-medium underline decoration-dotted cursor-pointer">
                    {formatNumber(position.q4wLpTokens, 2)} LP in{" "}
                    {position.q4wChunks.length} unlocks
                  </span>
                </TooltipTrigger>
                <TooltipContent className="p-2.5">
                  <p className="font-medium text-zinc-400 mb-1.5">
                    Unlock Schedule
                  </p>
                  <div className="space-y-1">
                    {position.q4wChunks.map((chunk, i) => (
                      <div key={i} className="flex justify-between gap-6">
                        <span className="font-mono">
                          {formatNumber(chunk.lpTokens, 2)} LP
                        </span>
                        <span className="text-zinc-400">
                          {formatTimeRemaining(
                            new Date(chunk.expiration * 1000),
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            ) : (
              <span className="text-sm text-amber-500 font-medium">
                {formatNumber(position.q4wLpTokens, 2)} LP unlocks in{" "}
                {timeRemaining}
              </span>
            )}
            <span className="text-sm text-muted-foreground">
              ({formatUsd(position.q4wLpTokensUsd)})
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Page header component to reduce duplication
function PageHeader({
  title,
  subtitle,
  explorerUrl,
}: {
  title: string;
  subtitle?: string;
  explorerUrl?: string;
}) {
  return (
    <header className="border-b">
      <div className="container max-w-3xl mx-auto px-4 py-4">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold truncate">{title}</h1>
            {subtitle && (
              <p className="text-xs text-muted-foreground font-mono truncate">
                {subtitle}
              </p>
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
  );
}

export default function PoolDetailsPage() {
  const params = useParams();
  const poolId = decodeURIComponent(params.poolId as string);
  const queryClient = useQueryClient();
  const { capture } = useAnalytics();

  // Use the shared wallet state hook
  const { activeWallet } = useWalletState();

  // Currency preference hook
  const { format: formatInCurrency } = useCurrencyPreference();

  // Create format functions using the currency preference
  const formatUsd = (value: number, decimals = 2): string => {
    if (!Number.isFinite(value)) return formatInCurrency(0);
    // Show more decimals for dust amounts
    if (value > 0 && value < 0.01) {
      return formatInCurrency(value, {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6,
      });
    }
    return formatInCurrency(value, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatYield = (value: number): string => {
    return formatInCurrency(value, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay: "always",
    });
  };

  const { pools: dbPools } = usePoolsOnly();
  const trackedPools = useMemo(() => toTrackedPools(dbPools), [dbPools]);

  const {
    data: snapshot,
    isLoading,
    error,
  } = useQuery({
    queryKey: [
      "blend-wallet-snapshot",
      activeWallet?.publicKey,
      trackedPools.map((p) => p.id).join(","),
    ],
    enabled: !!activeWallet?.publicKey && trackedPools.length > 0,
    queryFn: () =>
      fetchWalletBlendSnapshot(activeWallet?.publicKey, trackedPools),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  // Fetch backstop cost basis
  const { data: costBases } = useQuery({
    queryKey: ["backstop-cost-basis", activeWallet?.publicKey],
    enabled: !!activeWallet?.publicKey,
    queryFn: async () => {
      const response = await fetchWithTimeout(
        `/api/backstop-cost-basis?user=${encodeURIComponent(activeWallet!.publicKey)}`,
      );
      if (!response.ok) throw new Error("Failed to fetch backstop cost basis");
      const data = await response.json();
      return (data.cost_bases || []) as BackstopCostBasis[];
    },
    staleTime: 60_000,
  });

  // Get unique asset addresses for positions in this pool
  const poolAssetAddresses = useMemo(() => {
    if (!snapshot) return [];
    const positions = snapshot.positions.filter((p) => p.poolId === poolId);
    return [...new Set(positions.map((p) => p.assetId))];
  }, [snapshot, poolId]);

  // Fetch balance history for all assets in a single batch request (optimization: N requests -> 1)
  const { data: balanceHistoryData } = useQuery<BalanceHistoryResult[]>({
    queryKey: [
      "pool-balance-history-batch",
      activeWallet?.publicKey,
      poolId,
      poolAssetAddresses.join(","),
    ],
    enabled: !!activeWallet?.publicKey && poolAssetAddresses.length > 0,
    queryFn: async () => {
      const params = new URLSearchParams({
        user: activeWallet!.publicKey,
        assets: poolAssetAddresses.join(","),
        days: "365",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      const response = await fetchWithTimeout(
        `/api/balance-history-batch?${params.toString()}`,
      );
      if (!response.ok) return [];
      const data = await response.json();
      // Transform batch results to match the expected format
      return (data.results || []).map(
        (result: {
          asset_address: string;
          history: BalanceHistoryRecord[];
          firstEventDate: string | null;
        }) => ({
          assetAddress: result.asset_address,
          data: {
            history: result.history,
            firstEventDate: result.firstEventDate,
          },
        }),
      );
    },
    staleTime: 60_000,
  });

  // Fetch claimed BLND data
  const { data: claimedBlndData } = useQuery({
    queryKey: ["claimed-blnd", activeWallet?.publicKey],
    enabled: !!activeWallet?.publicKey,
    queryFn: async () => {
      const response = await fetchWithTimeout(
        `/api/claimed-blnd?user=${encodeURIComponent(activeWallet!.publicKey)}`,
      );
      if (!response.ok) throw new Error("Failed to fetch claimed BLND");
      const data = await response.json();
      return {
        poolClaims: (data.pool_claims || []) as PoolClaimData[],
        backstopClaims: (data.backstop_claims || []) as BackstopClaimData[],
      };
    },
    staleTime: 60_000,
  });

  // Build cost basis map from balance history
  const costBasisMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!balanceHistoryData) return map;

    balanceHistoryData.forEach((result) => {
      if (!result?.data?.history) return;
      const { assetAddress, data } = result;

      // Get latest cost basis for this pool from the history
      for (const record of data.history) {
        if (record.pool_id === poolId && record.total_cost_basis !== null) {
          const compositeKey = `${poolId}-${assetAddress}`;
          map.set(compositeKey, record.total_cost_basis);
          break; // First occurrence is latest (sorted by date desc)
        }
      }
    });

    return map;
  }, [balanceHistoryData, poolId]);

  // Filter positions for this pool only
  const poolPositions = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.positions.filter((p) => p.poolId === poolId);
  }, [snapshot, poolId]);

  // Filter backstop positions for this pool only
  const poolBackstopPositions = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.backstopPositions.filter((bp) => bp.poolId === poolId);
  }, [snapshot, poolId]);

  // Use the historical yield breakdown hook for proper breakdown data
  const yieldBreakdowns = useHistoricalYieldBreakdown(
    activeWallet?.publicKey,
    poolPositions,
    poolBackstopPositions,
    snapshot?.lpTokenPrice || null,
  );

  const poolData = useMemo(() => {
    if (!snapshot) return null;

    const poolEstimate = snapshot.poolEstimates.find(
      (e) => e.poolId === poolId,
    );
    const poolPositions = snapshot.positions.filter((p) => p.poolId === poolId);
    const rawBackstopPosition = snapshot.backstopPositions.find(
      (bp) => bp.poolId === poolId,
    );

    // Enrich backstop position with yield data
    let backstopPosition: BlendBackstopPosition | null = null;
    if (rawBackstopPosition && rawBackstopPosition.lpTokensUsd > 0) {
      const costBasis = costBases?.find((cb) => cb.pool_address === poolId);
      if (costBasis) {
        // Include Q4W LP tokens in total - they're still the user's tokens, just locked
        const totalLpTokens =
          rawBackstopPosition.lpTokens + rawBackstopPosition.q4wLpTokens;
        let yieldLp = totalLpTokens - costBasis.cost_basis_lp;
        // Handle floating-point precision: treat very small values as zero
        const EPSILON = 0.0001;
        if (Math.abs(yieldLp) < EPSILON) {
          yieldLp = 0;
        }
        const yieldPercent =
          costBasis.cost_basis_lp > 0
            ? (yieldLp / costBasis.cost_basis_lp) * 100
            : 0;
        backstopPosition = {
          ...rawBackstopPosition,
          costBasisLp: costBasis.cost_basis_lp,
          yieldLp,
          yieldPercent,
        };
      } else {
        backstopPosition = {
          ...rawBackstopPosition,
          costBasisLp: 0,
          yieldLp: 0,
          yieldPercent: 0,
        };
      }
    }

    // Get claimed BLND data for this pool
    const poolClaimData = claimedBlndData?.poolClaims?.find(
      (pc) => pc.pool_id === poolId,
    );
    const backstopClaimData = claimedBlndData?.backstopClaims?.find(
      (bc) => bc.pool_address === poolId,
    );

    // Get total claimable BLND for this pool from per-pool emissions
    // This is more reliable than summing per-position claimable amounts
    // as the SDK may not provide per-reserve breakdown
    const poolTotalClaimableBlnd = snapshot?.perPoolEmissions?.[poolId] || 0;

    // Pool-level claimed BLND (from database) - need this before position calculation
    const poolTotalClaimedBlnd = poolClaimData?.total_claimed_blnd || 0;

    // Calculate total supply USD value for proportional distribution
    const totalSupplyUsd = poolPositions.reduce(
      (sum, pos) => sum + (pos.supplyUsdValue || 0),
      0,
    );

    // Enrich positions with yield data and distribute claimable/claimed BLND proportionally
    const positionsWithYield: PositionWithYield[] = poolPositions.map(
      (position) => {
        const compositeKey = position.id; // Already in format: poolId-assetAddress
        const costBasisTokens = costBasisMap.get(compositeKey);
        const usdPrice = position.price?.usdPrice || 1;

        // Get yield breakdown from the hook (has proper cost basis, yield, price change)
        const assetBreakdown = yieldBreakdowns.byAsset.get(compositeKey);

        // Default values
        let earnedYield = 0;
        let yieldPercentage = 0;
        let yieldBreakdown: YieldBreakdown | undefined;

        if (assetBreakdown) {
          // Use the proper breakdown from the hook
          earnedYield = assetBreakdown.totalEarnedUsd;
          yieldPercentage = assetBreakdown.totalEarnedPercent;
          yieldBreakdown = {
            costBasisHistorical: assetBreakdown.costBasisHistorical,
            protocolYieldUsd: assetBreakdown.protocolYieldUsd,
            priceChangeUsd: assetBreakdown.priceChangeUsd,
            totalEarnedUsd: assetBreakdown.totalEarnedUsd,
            totalEarnedPercent: assetBreakdown.totalEarnedPercent,
          };
        } else if (costBasisTokens !== undefined && costBasisTokens > 0) {
          // Fallback to simple token-based calculation
          const currentTokens = position.supplyAmount;
          const yieldTokens = currentTokens - costBasisTokens;

          // Handle floating-point precision
          const EPSILON = 0.0001;
          if (Math.abs(yieldTokens) > EPSILON) {
            earnedYield = yieldTokens * usdPrice;
            yieldPercentage = (yieldTokens / costBasisTokens) * 100;
          }
        }

        // Calculate this position's share of pool's claimable BLND
        // Distribute proportionally based on supply USD value
        // Use SDK's per-reserve value if available, otherwise estimate from pool total
        const sdkClaimable = position.claimableBlnd || 0;
        const estimatedClaimableBlnd =
          sdkClaimable > 0
            ? sdkClaimable
            : totalSupplyUsd > 0 && poolTotalClaimableBlnd > 0
              ? poolTotalClaimableBlnd *
                ((position.supplyUsdValue || 0) / totalSupplyUsd)
              : 0;

        // Calculate this position's share of pool's claimed BLND (proportional distribution)
        // Claims are made at pool level, so we distribute based on supply USD value
        const estimatedClaimedBlnd =
          totalSupplyUsd > 0 && poolTotalClaimedBlnd > 0
            ? poolTotalClaimedBlnd *
              ((position.supplyUsdValue || 0) / totalSupplyUsd)
            : 0;

        return {
          ...position,
          earnedYield,
          yieldPercentage,
          yieldBreakdown,
          estimatedClaimableBlnd,
          estimatedClaimedBlnd,
        };
      },
    );

    // Total claimable for UI display
    const totalClaimableBlnd = poolTotalClaimableBlnd;

    // Pool-level claimed BLND (from database)
    const totalClaimedBlnd = poolTotalClaimedBlnd;

    // Show pool if user has positions OR backstop
    const hasPositions = positionsWithYield.length > 0;
    const hasBackstop = backstopPosition !== null;

    if (!poolEstimate || (!hasPositions && !hasBackstop)) return null;

    // Get backstop yield breakdown from the hook
    const backstopBreakdownData = yieldBreakdowns.byBackstop.get(poolId);
    const backstopYieldBreakdown: YieldBreakdown | undefined =
      backstopBreakdownData
        ? {
            costBasisHistorical: backstopBreakdownData.costBasisHistorical,
            protocolYieldUsd: backstopBreakdownData.protocolYieldUsd,
            priceChangeUsd: backstopBreakdownData.priceChangeUsd,
            totalEarnedUsd: backstopBreakdownData.totalEarnedUsd,
            totalEarnedPercent: backstopBreakdownData.totalEarnedPercent,
          }
        : undefined;

    return {
      estimate: poolEstimate,
      positions: positionsWithYield,
      backstopPosition,
      backstopYieldBreakdown,
      backstopClaimedLp: backstopClaimData?.total_claimed_lp || 0,
      blndPerLpToken: snapshot?.blndPerLpToken || 0,
      poolName:
        positionsWithYield[0]?.poolName ||
        backstopPosition?.poolName ||
        "Unknown Pool",
      // Pool-level BLND data
      totalClaimableBlnd,
      totalClaimedBlnd,
      blndPrice: snapshot?.blndPrice || null,
    };
  }, [
    snapshot,
    poolId,
    costBases,
    costBasisMap,
    claimedBlndData,
    yieldBreakdowns,
  ]);

  // Get pool info from tracked pools for explorer link
  const poolInfo = trackedPools.find((p) => p.id === poolId);

  const handleRefresh = useCallback(async () => {
    if (!activeWallet?.publicKey) return;

    capture("pull_to_refresh", { page: "pool", pool_id: poolId });

    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["blend-wallet-snapshot", activeWallet.publicKey],
      }),
      queryClient.invalidateQueries({
        queryKey: ["backstop-cost-basis", activeWallet.publicKey],
      }),
      queryClient.invalidateQueries({
        queryKey: [
          "pool-balance-history-batch",
          activeWallet.publicKey,
          poolId,
        ],
      }),
      queryClient.invalidateQueries({
        queryKey: ["claimed-blnd", activeWallet.publicKey],
      }),
    ]);
  }, [activeWallet?.publicKey, poolId, queryClient, capture]);

  // Render content based on state
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="min-h-screen bg-background">
          <PageHeader title="Pool Details" />
          <main className="container max-w-3xl mx-auto px-4 py-8">
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="h-24 bg-muted animate-pulse rounded-lg"
                  />
                ))}
              </div>
              <div className="h-64 bg-muted animate-pulse rounded-lg" />
            </div>
          </main>
        </div>
      );
    }

    if (error) {
      return (
        <div className="min-h-screen bg-background">
          <PageHeader title="Pool Details" />
          <main className="container max-w-3xl mx-auto px-4 py-8">
            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
              <p className="text-destructive text-sm">
                Error loading pool data:{" "}
                {error instanceof Error ? error.message : "Unknown error"}
              </p>
            </div>
          </main>
        </div>
      );
    }

    if (!poolData) {
      return (
        <div className="min-h-screen bg-background">
          <PageHeader title="Pool Details" />
          <main className="container max-w-3xl mx-auto px-4 py-8">
            <div className="text-center py-8 text-muted-foreground">
              <p>No data found for this pool.</p>
              <p className="text-sm mt-2">
                The pool ID might be invalid or you don&apos;t have positions in
                this pool.
              </p>
              <Link href="/">
                <Button className="mt-4">Go to Home</Button>
              </Link>
            </div>
          </main>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background">
        <PageHeader
          title={`${poolData.poolName} Pool`}
          explorerUrl={`https://stellar.expert/explorer/public/contract/${poolId}`}
        />

        <main className="container max-w-3xl mx-auto px-4 py-6">
          <div className="space-y-6">
            {/* Summary Stats */}
            <PoolSummary estimate={poolData.estimate} formatUsd={formatUsd} />

            {/* Supply/Borrow Positions */}
            {poolData.positions.length > 0 && (
              <Card className="py-2 gap-0">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-lg">Your Positions</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pt-0 pb-1">
                  {/* Desktop */}
                  <div className="hidden md:block">
                    {poolData.positions.map((position) => (
                      <AssetRow
                        key={position.id}
                        position={position}
                        blndPrice={poolData.blndPrice}
                        formatUsd={formatUsd}
                        formatYield={formatYield}
                      />
                    ))}
                  </div>

                  {/* Mobile */}
                  <div className="md:hidden">
                    {poolData.positions.map((position) => (
                      <MobileAssetCard
                        key={position.id}
                        position={position}
                        blndPrice={poolData.blndPrice}
                        formatUsd={formatUsd}
                        formatYield={formatYield}
                      />
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
                backstopYieldBreakdown={poolData.backstopYieldBreakdown}
                formatUsd={formatUsd}
                formatYield={formatYield}
              />
            )}
          </div>
        </main>
      </div>
    );
  };

  return (
    <AuthenticatedPage withLayout={false} onRefresh={handleRefresh}>
      {renderContent()}
    </AuthenticatedPage>
  );
}
