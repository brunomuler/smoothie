"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  Flame,
  ArrowUpRight,
  Info,
  AlertTriangle,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  simulateApyChange,
  getSliderAmounts,
  formatAmountCompact,
  getApyChangeExplanation,
  type SimulationAction,
  type ReserveConfig,
} from "@/lib/blend/apy-simulator";

interface ReserveData {
  poolId: string;
  poolName: string;
  assetId: string;
  tokenSymbol: string;
  totalSupply: number;
  totalBorrow: number;
  utilization: number;
  supplyApy: number;
  borrowApy: number;
  reserveConfig: ReserveConfig;
  irModifier: number;
  backstopTakeRate: number;
  maxUtil: number;
  blndEmissionsPerYear: number | null;
  blndPrice: number | null;
  assetPrice: number | null;
}

interface ApySimulatorContentProps {
  poolId: string;
  poolName: string;
  assetId: string;
  tokenSymbol: string;
  // Initial data (from explore page)
  initialData?: {
    totalSupply: number;
    totalBorrow: number;
    supplyApy: number;
    blndApy: number;
  };
}

const ACTION_LABELS: Record<SimulationAction, string> = {
  deposit: "Deposit",
  withdraw: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
};

function formatPercent(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "0%";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

function formatPercentNoSign(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

export function ApySimulatorContent({
  poolId,
  poolName,
  assetId,
  tokenSymbol,
  initialData,
}: ApySimulatorContentProps) {
  const [action, setAction] = useState<SimulationAction>("deposit");
  const [amount, setAmount] = useState<number>(10000);
  const [customAmount, setCustomAmount] = useState<string>("");

  // Fetch reserve config data
  const { data, isLoading, error } = useQuery({
    queryKey: ["reserve-config", poolId, assetId],
    queryFn: async () => {
      const response = await fetch(
        `/api/simulate-apy?poolId=${encodeURIComponent(poolId)}&assetId=${encodeURIComponent(assetId)}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch reserve config");
      }
      const json = await response.json();
      return json.reserve as ReserveData;
    },
    staleTime: 30000, // 30 seconds
  });

  // Get dynamic slider amounts based on pool TVL
  const sliderAmounts = useMemo(() => {
    const totalSupply = data?.totalSupply ?? initialData?.totalSupply ?? 100000;
    return getSliderAmounts(totalSupply);
  }, [data?.totalSupply, initialData?.totalSupply]);

  // Set initial amount to middle of slider
  useEffect(() => {
    if (sliderAmounts.length > 0) {
      const middleIndex = Math.floor(sliderAmounts.length / 2);
      setAmount(sliderAmounts[middleIndex]);
    }
  }, [sliderAmounts]);

  // Run simulation
  const simulation = useMemo(() => {
    if (!data) return null;

    return simulateApyChange({
      currentTotalSupply: data.totalSupply,
      currentTotalBorrow: data.totalBorrow,
      action,
      amount,
      reserveConfig: data.reserveConfig,
      irModifier: data.irModifier,
      backstopTakeRate: data.backstopTakeRate,
      blndEmissionsPerYear: data.blndEmissionsPerYear ?? undefined,
      blndPrice: data.blndPrice ?? undefined,
      assetPrice: data.assetPrice ?? undefined,
    });
  }, [data, action, amount]);

  // Handle slider change
  const handleSliderChange = (values: number[]) => {
    const index = values[0];
    if (index >= 0 && index < sliderAmounts.length) {
      setAmount(sliderAmounts[index]);
      setCustomAmount("");
    }
  };

  // Handle custom amount input
  const handleCustomAmountChange = (value: string) => {
    setCustomAmount(value);
    const parsed = parseFloat(value.replace(/,/g, ""));
    if (!isNaN(parsed) && parsed > 0) {
      setAmount(parsed);
    }
  };

  // Get current slider index
  const currentSliderIndex = sliderAmounts.indexOf(amount);

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
        <p>Failed to load reserve data</p>
      </div>
    );
  }

  const currentBlndApy =
    simulation?.currentBlndApy ?? initialData?.blndApy ?? 0;
  const hasBlndEmissions = currentBlndApy > 0.01;

  return (
    <div className="space-y-5">
      {/* Action Selection */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-2 block">
          Action
        </label>
        <div className="grid grid-cols-4 gap-1.5">
          {(Object.keys(ACTION_LABELS) as SimulationAction[]).map((act) => (
            <button
              key={act}
              onClick={() => setAction(act)}
              className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                action === act
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              {ACTION_LABELS[act]}
            </button>
          ))}
        </div>
      </div>

      {/* Amount Selection */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-2 block">
          Amount
        </label>
        <div className="space-y-3">
          {/* Slider */}
          <Slider
            value={[currentSliderIndex >= 0 ? currentSliderIndex : 2]}
            min={0}
            max={sliderAmounts.length - 1}
            step={1}
            onValueChange={handleSliderChange}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            {sliderAmounts.map((amt) => (
              <span
                key={amt}
                className={amt === amount ? "text-foreground font-medium" : ""}
              >
                {formatAmountCompact(amt)}
              </span>
            ))}
          </div>

          {/* Custom Input */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              or enter amount:
            </span>
            <Input
              type="text"
              value={customAmount || (currentSliderIndex < 0 ? amount.toLocaleString() : "")}
              onChange={(e) => handleCustomAmountChange(e.target.value)}
              placeholder={amount.toLocaleString()}
              className="h-8 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Results Table */}
      {simulation && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Metric
                </th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                  Current
                </th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                  After
                </th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                  Change
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Supply APY */}
              <tr className="border-b">
                <td className="px-3 py-2 flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                  Supply APY
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {formatPercentNoSign(simulation.currentSupplyApy)}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {formatPercentNoSign(simulation.newSupplyApy)}
                </td>
                <td
                  className={`px-3 py-2 text-right font-mono ${
                    simulation.supplyApyChange > 0
                      ? "text-emerald-500"
                      : simulation.supplyApyChange < 0
                        ? "text-red-500"
                        : ""
                  }`}
                >
                  {formatPercent(simulation.supplyApyChange)}
                </td>
              </tr>

              {/* BLND APY (if has emissions) */}
              {hasBlndEmissions && (
                <tr className="border-b">
                  <td className="px-3 py-2 flex items-center gap-1.5">
                    <Flame className="h-3.5 w-3.5 text-purple-500" />
                    BLND APY
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatPercentNoSign(simulation.currentBlndApy)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatPercentNoSign(simulation.newBlndApy)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${
                      simulation.blndApyChange > 0
                        ? "text-emerald-500"
                        : simulation.blndApyChange < 0
                          ? "text-red-500"
                          : ""
                    }`}
                  >
                    {formatPercent(simulation.blndApyChange)}
                  </td>
                </tr>
              )}

              {/* Total APY */}
              <tr className="border-b bg-muted/30">
                <td className="px-3 py-2 font-medium">Total APY</td>
                <td className="px-3 py-2 text-right font-mono font-medium">
                  {formatPercentNoSign(simulation.currentTotalApy)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-medium">
                  {formatPercentNoSign(simulation.newTotalApy)}
                </td>
                <td
                  className={`px-3 py-2 text-right font-mono font-medium ${
                    simulation.totalApyChange > 0
                      ? "text-emerald-500"
                      : simulation.totalApyChange < 0
                        ? "text-red-500"
                        : ""
                  }`}
                >
                  {formatPercent(simulation.totalApyChange)}
                </td>
              </tr>

              {/* Borrow APY */}
              <tr className="border-b">
                <td className="px-3 py-2 flex items-center gap-1.5">
                  <TrendingDown className="h-3.5 w-3.5 text-orange-500" />
                  Borrow APY
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {formatPercentNoSign(simulation.currentBorrowApy)}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {formatPercentNoSign(simulation.newBorrowApy)}
                </td>
                <td
                  className={`px-3 py-2 text-right font-mono ${
                    simulation.borrowApyChange < 0
                      ? "text-emerald-500"
                      : simulation.borrowApyChange > 0
                        ? "text-red-500"
                        : ""
                  }`}
                >
                  {formatPercent(simulation.borrowApyChange)}
                </td>
              </tr>

              {/* Utilization */}
              <tr>
                <td className="px-3 py-2">Utilization</td>
                <td className="px-3 py-2 text-right font-mono">
                  {formatPercentNoSign(simulation.currentUtilization)}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {formatPercentNoSign(simulation.newUtilization)}
                </td>
                <td
                  className={`px-3 py-2 text-right font-mono ${
                    simulation.utilizationChange > 0
                      ? "text-orange-500"
                      : simulation.utilizationChange < 0
                        ? "text-emerald-500"
                        : ""
                  }`}
                >
                  {formatPercent(simulation.utilizationChange)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Utilization Bar */}
      {simulation && (
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Utilization</span>
            <span>
              {formatPercentNoSign(simulation.currentUtilization)} →{" "}
              {formatPercentNoSign(simulation.newUtilization)}
            </span>
          </div>
          <div className="relative">
            <Progress
              value={simulation.newUtilization}
              className={`h-2 ${
                simulation.newUtilization > 90
                  ? "[&>div]:bg-red-500"
                  : simulation.newUtilization > 80
                    ? "[&>div]:bg-orange-500"
                    : "[&>div]:bg-emerald-500"
              }`}
            />
            {/* Target utilization marker */}
            <div
              className="absolute top-0 h-full w-0.5 bg-white/50"
              style={{
                left: `${(data.reserveConfig.targetUtil * 100)}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>0%</span>
            <span
              style={{
                marginLeft: `${(data.reserveConfig.targetUtil * 100) - 10}%`,
              }}
            >
              Target: {formatPercentNoSign(data.reserveConfig.targetUtil * 100)}
            </span>
            <span>100%</span>
          </div>
        </div>
      )}

      {/* Explanation */}
      {simulation && simulation.isValid && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            {getApyChangeExplanation(
              action,
              amount,
              tokenSymbol,
              simulation.utilizationChange
            )}
          </p>
        </div>
      )}

      {/* Error Message */}
      {simulation && !simulation.isValid && simulation.errorMessage && (
        <div className="flex items-start gap-2 text-xs text-red-500 bg-red-500/10 rounded-lg p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>{simulation.errorMessage}</p>
        </div>
      )}

      {/* Action Link */}
      <a
        href={`https://mainnet.blend.capital/${action === "deposit" || action === "withdraw" ? "supply" : "borrow"}/?poolId=${poolId}&assetId=${assetId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-1.5 w-full text-sm font-medium text-primary hover:text-primary/80 transition-colors py-2"
      >
        {action === "deposit" || action === "withdraw"
          ? "Supply on Blend Capital"
          : "Borrow on Blend Capital"}
        <ArrowUpRight className="h-4 w-4" />
      </a>
    </div>
  );
}
