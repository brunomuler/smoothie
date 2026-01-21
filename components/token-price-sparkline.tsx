"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, Tooltip, ResponsiveContainer, YAxis } from "recharts";
import { format } from "date-fns";
import { fetchWithTimeout } from "@/lib/fetch-utils";

interface PriceDataPoint {
  date: string;
  price: number;
}

interface TokenPriceSparklineProps {
  tokenAddress: string;
  tokenSymbol: string;
  currentPrice?: number; // SDK price to use for latest day
  className?: string;
}

async function fetchTokenPriceHistory(
  tokenAddress: string,
): Promise<PriceDataPoint[]> {
  const params = new URLSearchParams({
    token: tokenAddress,
    days: "180", // 6 months
  });

  const response = await fetchWithTimeout(`/api/token-price-history?${params}`);
  if (!response.ok) {
    throw new Error("Failed to fetch token price history");
  }

  const data = await response.json();
  return data.history || [];
}

function formatPrice(value: number): string {
  if (value >= 1) {
    return `$${value.toFixed(2)}`;
  }
  if (value >= 0.01) {
    return `$${value.toFixed(4)}`;
  }
  return `$${value.toFixed(6)}`;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: PriceDataPoint }>;
  tokenSymbol: string;
}

function CustomTooltip({ active, payload, tokenSymbol }: CustomTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const data = payload[0];
  const date = data.payload.date;
  const price = data.value;

  // Parse date as local time to avoid timezone shift
  const [year, month, day] = date.split("-").map(Number);
  const localDate = new Date(year, month - 1, day);

  return (
    <div className="bg-black text-white border border-zinc-800 rounded-md px-2 py-1.5 shadow-md text-[11px] whitespace-nowrap">
      <p className="text-zinc-400">{format(localDate, "MMM d, yyyy")}</p>
      <p className="font-medium text-blue-400">
        {tokenSymbol}: {formatPrice(price)}
      </p>
    </div>
  );
}

export function TokenPriceSparkline({
  tokenAddress,
  tokenSymbol,
  currentPrice,
  className = "",
}: TokenPriceSparklineProps) {
  const { data: priceHistory, isLoading } = useQuery({
    queryKey: ["token-price-history", tokenAddress],
    queryFn: () => fetchTokenPriceHistory(tokenAddress),
    staleTime: 60 * 60 * 1000, // 1 hour
    refetchInterval: false,
  });

  // Replace the latest day's price with the SDK price if provided
  const chartData = useMemo(() => {
    if (!priceHistory?.length) return [];
    if (currentPrice === undefined) return priceHistory;

    // Replace the last data point with current SDK price
    const data = [...priceHistory];
    if (data.length > 0) {
      data[data.length - 1] = {
        ...data[data.length - 1],
        price: currentPrice,
      };
    }
    return data;
  }, [priceHistory, currentPrice]);

  // Calculate price change percentage and current price
  const { priceChangePercent, latestPrice } = useMemo(() => {
    if (!chartData?.length || chartData.length < 2) {
      return { priceChange: 0, priceChangePercent: 0, latestPrice: 0 };
    }

    const startPrice = chartData[0].price;
    const endPrice = chartData[chartData.length - 1].price;
    const change = endPrice - startPrice;
    const changePercent = startPrice > 0 ? (change / startPrice) * 100 : 0;

    return {
      priceChange: change,
      priceChangePercent: changePercent,
      latestPrice: endPrice,
    };
  }, [chartData]);

  // Default size if not specified via className
  const defaultSize =
    !className?.includes("w-") && !className?.includes("h-") ? "h-8 w-16" : "";

  if (isLoading) {
    return (
      <div
        className={`bg-muted/30 animate-pulse rounded ${defaultSize} ${className}`}
      />
    );
  }

  if (!chartData?.length) {
    return null;
  }

  const isPositive = priceChangePercent >= 0;

  return (
    <div className="flex items-center gap-3">
      <div className={`${defaultSize} ${className} flex-1`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
          >
            <YAxis domain={["dataMin", "dataMax"]} hide />
            <Tooltip
              content={<CustomTooltip tokenSymbol={tokenSymbol} />}
              cursor={false}
              allowEscapeViewBox={{ x: true, y: true }}
              wrapperStyle={{ zIndex: 50 }}
              position={{ y: -50 }}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#3b82f6"
              strokeWidth={1}
              dot={false}
              activeDot={{
                r: 2,
                fill: "#3b82f6",
                stroke: "#3b82f6",
              }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold text-blue-400 mb-1">
          {formatPrice(latestPrice)}
        </p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
          6mo
        </p>
        <p className="text-xs text-foreground">
          {isPositive ? "+" : ""}
          {priceChangePercent.toFixed(1)}%
        </p>
      </div>
    </div>
  );
}
