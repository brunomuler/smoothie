"use client";

import { memo, useMemo, useCallback } from "react";
import Link from "next/link";
import { TokenLogo } from "@/components/token-logo";
import { formatAmount } from "@/lib/format-utils";
import { useCurrencyPreference } from "@/hooks/use-currency-preference";
import { useDisplayPreferences } from "@/contexts/display-preferences-context";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  TrendingUp,
  ChevronRight,
  Flame,
  Shield,
  Clock,
  CheckCircle,
} from "lucide-react";
import { YieldDisplay } from "@/components/yield-display";
import type { AssetCardData } from "@/types/asset-card";
import type { SupplyPositionsProps, BackstopPositionData } from "./types";
import { SupplyPositionsSkeleton } from "./skeleton";
import { SupplyPositionsEmptyState } from "./empty-state";

// Memoized supply asset item to prevent unnecessary re-renders
interface SupplyAssetItemProps {
  asset: AssetCardData;
  tokenAmount: number;
  symbol: string;
  formatUsdAmount: (value: number) => string;
  formatYieldValue: (value: number) => string;
  showPriceChanges: boolean;
}

const SupplyAssetItem = memo(function SupplyAssetItem({
  asset,
  tokenAmount,
  symbol,
  formatUsdAmount,
  formatYieldValue,
  showPriceChanges,
}: SupplyAssetItemProps) {
  const yieldToShow = asset.earnedYield ?? 0;
  const yieldPercentage = asset.yieldPercentage ?? 0;

  return (
    <div className="flex items-center justify-between py-2 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <TokenLogo src={asset.logoUrl} symbol={asset.assetName} size={36} />
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{asset.assetName}</p>
          <p className="text-sm text-muted-foreground truncate">
            {formatUsdAmount(asset.rawBalance)}
            <span className="text-xs ml-1">
              ({formatAmount(tokenAmount)} {symbol})
            </span>
          </p>
          <YieldDisplay
            earnedYield={yieldToShow}
            yieldPercentage={yieldPercentage}
            yieldBreakdown={asset.yieldBreakdown}
            showPriceChanges={showPriceChanges}
            formatUsdAmount={formatUsdAmount}
            formatYieldValue={formatYieldValue}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1 items-start shrink-0 w-[110px]">
        <Badge variant="secondary" className="text-xs">
          <TrendingUp className="mr-1 h-3 w-3" />
          {asset.apyPercentage.toFixed(2)}% APY
        </Badge>
        {asset.growthPercentage > 0.005 && (
          <Badge variant="secondary" className="text-xs">
            <Flame className="mr-1 h-3 w-3" />
            {asset.growthPercentage.toFixed(2)}% BLND
          </Badge>
        )}
      </div>
    </div>
  );
});

// Memoized backstop position item
interface BackstopPositionItemProps {
  backstopPosition: BackstopPositionData;
  hasAssets: boolean;
  formatUsdAmount: (value: number) => string;
  formatYieldValue: (value: number) => string;
  showPriceChanges: boolean;
}

const BackstopPositionItem = memo(function BackstopPositionItem({
  backstopPosition,
  hasAssets,
  formatUsdAmount,
  formatYieldValue,
  showPriceChanges,
}: BackstopPositionItemProps) {
  const hasQ4w = backstopPosition.q4wShares > BigInt(0);

  // Format time remaining for single locked chunk as "Xd Yh"
  const timeRemaining = useMemo(() => {
    if (backstopPosition.q4wChunks.length !== 1) return null;
    const q4wExpDate = new Date(
      backstopPosition.q4wChunks[0].expiration * 1000,
    );
    const diff = q4wExpDate.getTime() - Date.now();
    if (diff <= 0) return null;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  }, [backstopPosition.q4wChunks]);

  // Calculate yield values
  const lpTokenPrice =
    backstopPosition.lpTokens > 0
      ? backstopPosition.lpTokensUsd / backstopPosition.lpTokens
      : 0;
  const yieldUsd = backstopPosition.yieldLp * lpTokenPrice;

  return (
    <div
      className={`flex items-center justify-between py-2 gap-3 ${hasAssets ? "border-t border-border/50 mt-2 pt-3" : ""}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
          <Shield className="h-5 w-5 text-purple-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">Backstop</p>
          <p className="text-sm text-muted-foreground truncate">
            {formatUsdAmount(backstopPosition.lpTokensUsd)}
            <span className="text-xs ml-1">
              ({formatAmount(backstopPosition.lpTokens, 2)} LP)
            </span>
          </p>
          <YieldDisplay
            earnedYield={yieldUsd}
            yieldPercentage={backstopPosition.yieldPercent}
            yieldBreakdown={backstopPosition.yieldBreakdown}
            showPriceChanges={showPriceChanges}
            formatUsdAmount={formatUsdAmount}
            formatYieldValue={formatYieldValue}
          />
          {hasQ4w && (
            <div className="text-xs text-amber-600 dark:text-amber-400 flex flex-col gap-0.5 mt-1">
              {backstopPosition.q4wChunks.length > 0 && (
                <p className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {backstopPosition.q4wChunks.length > 1 ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="underline decoration-dotted cursor-pointer">
                          {formatAmount(
                            backstopPosition.q4wChunks.reduce(
                              (sum, c) => sum + c.lpTokens,
                              0,
                            ),
                            2,
                          )}{" "}
                          LP in {backstopPosition.q4wChunks.length} queued
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="p-2.5">
                        <p className="font-medium text-zinc-400 mb-1.5">
                          Queued Withdrawals
                        </p>
                        <div className="space-y-1">
                          {backstopPosition.q4wChunks.map((chunk, i) => {
                            const chunkExpDate = new Date(
                              chunk.expiration * 1000,
                            );
                            const diff = chunkExpDate.getTime() - Date.now();
                            const days = Math.floor(
                              diff / (1000 * 60 * 60 * 24),
                            );
                            const hours = Math.floor(
                              (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
                            );
                            const chunkTime =
                              diff > 0
                                ? days > 0
                                  ? `${days}d ${hours}h`
                                  : `${hours}h`
                                : "Ready";
                            return (
                              <div
                                key={i}
                                className="flex justify-between gap-6"
                              >
                                <span className="font-mono">
                                  {formatAmount(chunk.lpTokens, 2)} LP
                                </span>
                                <span className="text-zinc-400">
                                  {chunkTime}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ) : timeRemaining ? (
                    `${formatAmount(backstopPosition.q4wChunks[0].lpTokens, 2)} LP queued, ${timeRemaining}`
                  ) : (
                    `${formatAmount(backstopPosition.q4wChunks[0].lpTokens, 2)} LP queued`
                  )}
                </p>
              )}
              {backstopPosition.unlockedQ4wLpTokens > 0.001 && (
                <p className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <CheckCircle className="h-3 w-3" />
                  {formatAmount(backstopPosition.unlockedQ4wLpTokens, 2)} LP
                  ready to withdraw
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1 items-start shrink-0 w-[110px]">
        {backstopPosition.interestApr > 0 && (
          <Badge variant="secondary" className="text-xs">
            <TrendingUp className="mr-1 h-3 w-3" />
            {backstopPosition.interestApr.toFixed(2)}% APR
          </Badge>
        )}
        {backstopPosition.emissionApy > 0 && (
          <Badge variant="secondary" className="text-xs">
            <Flame className="mr-1 h-3 w-3" />
            {backstopPosition.emissionApy.toFixed(2)}% BLND
          </Badge>
        )}
      </div>
    </div>
  );
});

export function SupplyPositions({
  isLoading,
  enrichedAssetCards,
  backstopPositions,
  blendSnapshot,
  onPoolClick,
}: SupplyPositionsProps) {
  // Currency preference for multi-currency display
  const { format: formatInCurrency } = useCurrencyPreference();

  // Display preferences (show price changes toggle)
  const { preferences: displayPreferences } = useDisplayPreferences();

  // Memoize format functions to prevent re-renders of child components
  const formatUsdAmount = useCallback(
    (value: number) => {
      if (!Number.isFinite(value)) return formatInCurrency(0);
      if (value > 0 && value < 0.01) {
        return formatInCurrency(value, {
          minimumFractionDigits: 6,
          maximumFractionDigits: 6,
        });
      }
      return formatInCurrency(value, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    },
    [formatInCurrency],
  );

  const formatYieldValue = useCallback(
    (value: number) =>
      formatInCurrency(value, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        showSign: true,
      }),
    [formatInCurrency],
  );

  // Memoize pool grouping to avoid recomputation on every render
  const poolMap = useMemo(() => {
    const map = enrichedAssetCards.reduce(
      (acc, asset) => {
        const poolId = asset.id.includes("-")
          ? asset.id.split("-")[0]
          : asset.id;
        const poolName = asset.protocolName;

        if (!acc[poolId]) {
          acc[poolId] = { poolName, assets: [] };
        }
        acc[poolId].assets.push(asset);
        return acc;
      },
      {} as Record<string, { poolName: string; assets: AssetCardData[] }>,
    );

    // Add backstop-only pools
    backstopPositions.forEach((bp) => {
      if (!map[bp.poolId] && bp.lpTokensUsd > 0) {
        map[bp.poolId] = { poolName: bp.poolName, assets: [] };
      }
    });

    return map;
  }, [enrichedAssetCards, backstopPositions]);

  // Create a map for quick position lookups
  const positionMap = useMemo(() => {
    const map = new Map<string, { supplyAmount: number; symbol: string }>();
    blendSnapshot?.positions.forEach((p) => {
      map.set(p.id, { supplyAmount: p.supplyAmount, symbol: p.symbol });
    });
    return map;
  }, [blendSnapshot?.positions]);

  if (isLoading) {
    return <SupplyPositionsSkeleton />;
  }

  if (enrichedAssetCards.length > 0 || backstopPositions.length > 0) {
    return (
      <div className="grid gap-4 grid-cols-1">
        {Object.entries(poolMap).map(([poolId, { poolName, assets }]) => {
          const backstopPosition = backstopPositions.find(
            (bp) => bp.poolId === poolId,
          );
          const showBackstop =
            backstopPosition && backstopPosition.lpTokensUsd > 0;

          return (
            <Card key={poolId} className="py-2 gap-0">
              <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                <CardTitle>{poolName} Pool</CardTitle>
                <Link
                  href={`/pool/${encodeURIComponent(poolId)}`}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => onPoolClick?.(poolId, poolName)}
                >
                  <ChevronRight className="h-5 w-5" />
                </Link>
              </CardHeader>
              <CardContent className="px-4 pt-0 pb-1">
                <div className="space-y-1">
                  {assets.map((asset) => {
                    const position = positionMap.get(asset.id);
                    const tokenAmount = position?.supplyAmount || 0;
                    const symbol = position?.symbol || asset.assetName;

                    return (
                      <SupplyAssetItem
                        key={asset.id}
                        asset={asset}
                        tokenAmount={tokenAmount}
                        symbol={symbol}
                        formatUsdAmount={formatUsdAmount}
                        formatYieldValue={formatYieldValue}
                        showPriceChanges={displayPreferences.showPriceChanges}
                      />
                    );
                  })}

                  {showBackstop && (
                    <BackstopPositionItem
                      key={`backstop-${poolId}`}
                      backstopPosition={backstopPosition}
                      hasAssets={assets.length > 0}
                      formatUsdAmount={formatUsdAmount}
                      formatYieldValue={formatYieldValue}
                      showPriceChanges={displayPreferences.showPriceChanges}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  // Empty state
  return <SupplyPositionsEmptyState />;
}
