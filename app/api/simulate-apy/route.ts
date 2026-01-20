/**
 * APY Simulation API Route
 *
 * Fetches reserve configuration data needed for APY simulation.
 * Returns reserve config, current state, and computed simulation results.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  Pool,
  PoolV2,
  PoolMetadata,
  Backstop,
  TokenMetadata,
  FixedMath,
} from "@blend-capital/blend-sdk";
import { getBlendNetwork } from "@/lib/blend/network";
import {
  simulateApyChange,
  type SimulationAction,
  type ReserveConfig,
} from "@/lib/blend/apy-simulator";
import { createApiHandler, requireString, CACHE_CONFIGS } from "@/lib/api";

interface ReserveConfigResponse {
  poolId: string;
  poolName: string;
  assetId: string;
  tokenSymbol: string;
  // Current state
  totalSupply: number;
  totalBorrow: number;
  utilization: number;
  supplyApy: number;
  borrowApy: number;
  // Reserve config for simulation
  reserveConfig: ReserveConfig;
  irModifier: number;
  backstopTakeRate: number;
  maxUtil: number;
  // For BLND emission calculation
  blndEmissionsPerYear: number | null;
  blndPrice: number | null;
  assetPrice: number | null;
}

function computeBlndPrice(backstop: Backstop | null): number | null {
  if (!backstop?.backstopToken) return null;

  try {
    const bt = backstop.backstopToken;
    const usdcAmount = FixedMath.toFloat(bt.usdc, 7);
    const blndAmount = FixedMath.toFloat(bt.blnd, 7);
    if (blndAmount > 0) {
      return (usdcAmount / 0.2) / (blndAmount / 0.8);
    }
  } catch {
    // Failed to compute BLND price
  }
  return null;
}

async function loadReserveConfig(
  poolId: string,
  assetId: string
): Promise<ReserveConfigResponse | null> {
  const network = getBlendNetwork();

  try {
    // Load pool and metadata
    const metadata = await PoolMetadata.load(network, poolId);
    const pool = await PoolV2.loadWithMetadata(network, poolId, metadata);

    // Get reserve
    const reserve = pool.reserves.get(assetId);
    if (!reserve) {
      return null;
    }

    // Get token symbol
    let tokenSymbol = assetId.slice(0, 4);
    try {
      const tokenMeta = await TokenMetadata.load(network, assetId);
      tokenSymbol = tokenMeta.symbol;
    } catch {
      // Use truncated address as fallback
    }

    // Load backstop for BLND price and take rate
    let backstop: Backstop | null = null;
    if (metadata.backstop) {
      try {
        backstop = await Backstop.load(network, metadata.backstop);
      } catch {
        // Backstop load failed
      }
    }

    const blndPrice = computeBlndPrice(backstop);

    // Extract reserve config
    const config = reserve.config;
    if (!config) {
      return null;
    }

    // Get IR modifier - convert from fixed point
    const irModDecimals = reserve.irmodDecimals || 9;
    const irModifier = reserve.data?.interestRateModifier
      ? Number(reserve.data.interestRateModifier) / Math.pow(10, irModDecimals)
      : 1;

    // Get backstop take rate from pool metadata (7 decimals)
    const backstopTakeRate = metadata.backstopRate
      ? Number(metadata.backstopRate) / 1e7
      : 0;

    // Calculate total supply and borrow
    const totalSupply = reserve.totalSupplyFloat();
    const totalBorrow = reserve.totalLiabilitiesFloat();
    const utilization = reserve.getUtilizationFloat();

    // Get current APYs
    const supplyApy = reserve.estSupplyApy * 100;
    const borrowApy = reserve.estBorrowApy * 100;

    // Calculate BLND emissions per year for this reserve
    let blndEmissionsPerYear: number | null = null;
    if (reserve.supplyEmissions) {
      try {
        const totalSupplyRaw = reserve.totalSupply();
        const decimals = config.decimals ?? 7;
        const emissionsPerToken = reserve.supplyEmissions.emissionsPerYearPerToken(
          totalSupplyRaw,
          decimals
        );
        // Total emissions = emissions per token * total supply (in tokens)
        blndEmissionsPerYear = emissionsPerToken * totalSupply;
      } catch {
        // Failed to calculate emissions
      }
    }

    // Estimate asset price (for stablecoins use $1, otherwise approximate)
    // In a real implementation, you'd fetch this from an oracle or price feed
    const stablecoins = ["USDC", "USDT", "EURC", "USDGLO"];
    const assetPrice = stablecoins.includes(tokenSymbol.toUpperCase()) ? 1 : 1;

    // Convert config values from fixed point (7 decimals) to float
    const reserveConfig: ReserveConfig = {
      rBase: config.r_base / 1e7,
      rOne: config.r_one / 1e7,
      rTwo: config.r_two / 1e7,
      rThree: config.r_three / 1e7,
      targetUtil: config.util / 1e7,
      maxUtil: config.max_util / 1e7,
    };

    return {
      poolId,
      poolName: metadata.name,
      assetId,
      tokenSymbol,
      totalSupply,
      totalBorrow,
      utilization,
      supplyApy,
      borrowApy,
      reserveConfig,
      irModifier,
      backstopTakeRate,
      maxUtil: config.max_util / 1e7,
      blndEmissionsPerYear,
      blndPrice,
      assetPrice,
    };
  } catch (error) {
    console.error(`[Simulate APY API] Failed to load reserve config:`, error);
    return null;
  }
}

interface SimulateApyResponse {
  reserve: ReserveConfigResponse;
  simulation: ReturnType<typeof simulateApyChange> | null;
}

export const GET = createApiHandler<SimulateApyResponse>({
  logPrefix: "[Simulate APY API]",
  cache: { maxAge: 30, staleWhileRevalidate: 60 }, // Short cache since pool state changes frequently

  async handler(_request: NextRequest, { searchParams }) {
    const poolId = requireString(searchParams, "poolId");
    const assetId = requireString(searchParams, "assetId");

    // Optional simulation parameters
    const action = searchParams.get("action") as SimulationAction | null;
    const amountStr = searchParams.get("amount");
    const amount = amountStr ? parseFloat(amountStr) : null;

    // Load reserve configuration
    const reserveData = await loadReserveConfig(poolId, assetId);

    if (!reserveData) {
      throw new Error("Reserve not found");
    }

    // If simulation parameters provided, run simulation
    let simulation: ReturnType<typeof simulateApyChange> | null = null;
    if (action && amount && amount > 0) {
      simulation = simulateApyChange({
        currentTotalSupply: reserveData.totalSupply,
        currentTotalBorrow: reserveData.totalBorrow,
        action,
        amount,
        reserveConfig: reserveData.reserveConfig,
        irModifier: reserveData.irModifier,
        backstopTakeRate: reserveData.backstopTakeRate,
        blndEmissionsPerYear: reserveData.blndEmissionsPerYear ?? undefined,
        blndPrice: reserveData.blndPrice ?? undefined,
        assetPrice: reserveData.assetPrice ?? undefined,
      });
    }

    return {
      reserve: reserveData,
      simulation,
    };
  },
});
