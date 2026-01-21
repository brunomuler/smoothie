import {
  Backstop,
  BackstopPoolUser,
  BackstopPoolUserEst,
  BackstopPoolV1,
  BackstopPoolV2,
  BackstopPoolEst,
  Pool,
  PoolEstimate,
  PoolMetadata,
  PoolOracle,
  PoolV1,
  PoolV2,
  PoolUserEmissionData,
  PositionsEstimate,
  TokenMetadata,
  Version,
  FixedMath,
  getOraclePrice,
  getOracleDecimals,
  type Network,
  type PoolUser,
  type Reserve,
} from "@blend-capital/blend-sdk";
import { getBlendNetwork } from "./network";
import { type TrackedPool } from "./pools";
import { simulateCometDeposit } from "./comet";
import type { PriceQuote } from "@/lib/pricing/types";
import { getPoolName as getConfigPoolName, POOLS } from "@/lib/config/pools";

// Helper to resolve pool name: use config if available, otherwise SDK metadata
function resolvePoolName(poolId: string, sdkName: string): string {
  // If we have a configured name for this pool, use it
  const configName = POOLS[poolId]?.name;
  if (configName) {
    return configName;
  }
  // Otherwise use the SDK's metadata name
  return sdkName;
}

export interface BlendReservePosition {
  id: string;
  poolId: string;
  poolName: string;
  assetId: string;
  symbol: string;
  name: string;
  price?: PriceQuote | null;
  // Supply breakdown
  supplyAmount: number; // Total supply (collateral + non-collateral) in tokens
  supplyUsdValue: number; // Total supply in USD
  collateralAmount: number; // Collateralized (locked) supply in tokens
  collateralUsdValue: number; // Collateralized supply in USD
  nonCollateralAmount: number; // Non-collateralized supply in tokens
  nonCollateralUsdValue: number; // Non-collateralized supply in USD
  // Borrow
  borrowAmount: number; // Borrowed amount in tokens
  borrowUsdValue: number; // Borrowed amount in USD
  // APYs
  supplyApy: number;
  borrowApy: number;
  blndApy: number; // BLND APY from supply emissions
  borrowBlndApy: number; // BLND APY from borrow emissions
  // Token conversion rates
  bRate: number; // Current b_rate from SDK
  dRate: number; // Current d_rate from SDK
  bTokens: number; // Total bTokens (supply + collateral)
  dTokens: number; // Total dTokens (liabilities)
  // Reserve-level data
  collateralFactor: number; // e.g. 0.75 = 75% LTV
  liabilityFactor: number; // Liquidation threshold factor
  reserveUtilization: number; // Pool utilization %
  reserveTotalSupply: number; // Total pool supply in tokens
  reserveTotalBorrow: number; // Total pool borrow in tokens
  // Claimable BLND emissions
  claimableBlnd: number; // BLND waiting to be claimed for this position
}

// Individual Q4W (queued withdrawal) chunk with its own amount and expiration
export interface Q4WChunk {
  shares: bigint;
  lpTokens: number;
  lpTokensUsd: number;
  expiration: number; // Unix timestamp
}

// Backstop position for a specific pool
export interface BlendBackstopPosition {
  id: string; // Format: backstop-{poolId}
  poolId: string;
  poolName: string;
  // Position data
  shares: bigint; // Raw shares (internal accounting unit)
  lpTokens: number; // LP tokens value (shares converted via pool ratio)
  lpTokensUsd: number; // USD value of LP tokens
  // LP token breakdown
  blndAmount: number; // BLND portion of LP (80%)
  usdcAmount: number; // USDC portion of LP (20%)
  // Queued withdrawal (Q4W) - 21-day lock
  q4wShares: bigint; // Shares queued for withdrawal (total across all chunks)
  q4wLpTokens: number; // LP tokens value of queued shares (total)
  q4wLpTokensUsd: number; // USD value of queued shares (total)
  q4wExpiration: number | null; // Unix timestamp when closest Q4W unlocks
  q4wChunks: Q4WChunk[]; // Individual Q4W chunks with their own amounts and expirations (locked only)
  unlockedQ4wShares: bigint; // Shares ready to withdraw (past expiration)
  unlockedQ4wLpTokens: number; // LP tokens ready to withdraw (past expiration)
  // APR/APY
  interestApr: number; // APR from pool interest (backstop's share of borrower interest)
  emissionApy: number; // APY from BLND emissions for this pool's backstop (in %)
  blndEmissionsPerLpToken: number; // Raw BLND emissions per LP token per year
  // Yield tracking (from event aggregation)
  costBasisLp: number; // Net LP tokens deposited (deposits - withdrawals)
  yieldLp: number; // LP tokens earned (current lpTokens - costBasisLp)
  yieldPercent: number; // Percentage yield ((yieldLp / costBasisLp) * 100)
  // Pool-level Q4W risk indicator
  poolQ4wPercent: number; // Percent of pool's backstop capital queued for withdrawal (higher = riskier)
  // Claimable BLND emissions
  claimableBlnd: number; // BLND waiting to be claimed for this backstop position
  // Simulated LP tokens from emissions (via on-chain simulation)
  simulatedEmissionsLp: number | null; // LP tokens claimable from emissions, null if simulation failed
}

// Per-pool position estimate (health, borrow capacity, etc.)
export interface BlendPoolEstimate {
  poolId: string;
  poolName: string;
  totalBorrowed: number; // In oracle denomination (USD)
  totalSupplied: number; // In oracle denomination (USD)
  totalEffectiveLiabilities: number; // Adjusted by liability factor
  totalEffectiveCollateral: number; // Adjusted by collateral factor
  borrowCap: number; // Max liabilities user can take on
  borrowLimit: number; // Ratio of liabilities to collateral (0-1, higher = riskier)
  netApy: number;
  supplyApy: number;
  borrowApy: number;
}

export interface BlendWalletSnapshot {
  positions: BlendReservePosition[];
  backstopPositions: BlendBackstopPosition[]; // User's backstop positions per pool
  poolEstimates: BlendPoolEstimate[]; // Per-pool health/borrow data
  totalSupplyUsd: number;
  totalBorrowUsd: number;
  totalCollateralUsd: number; // Total collateralized supply
  totalNonCollateralUsd: number; // Total non-collateralized supply
  totalBackstopUsd: number; // Total backstop value in USD
  totalBackstopQ4wUsd: number; // Total queued backstop withdrawals in USD
  netPositionUsd: number;
  weightedSupplyApy: number | null;
  weightedBorrowApy: number | null;
  netApy: number | null;
  weightedBlndApy: number | null;
  weightedSupplyBorrowBlndApy: number | null; // BLND APY from supply/borrow positions only (excludes backstop)
  totalEmissions: number; // Total claimable BLND emissions in tokens
  totalSupplyEmissions: number; // Claimable BLND from deposits
  totalBorrowEmissions: number; // Claimable BLND from borrows
  perPoolEmissions: Record<string, number>; // Per-pool claimable BLND emissions (total)
  perPoolSupplyEmissions: Record<string, number>; // Per-pool claimable BLND from deposits
  perPoolBorrowEmissions: Record<string, number>; // Per-pool claimable BLND from borrows
  blndPrice: number | null; // BLND price in USDC from backstop
  lpTokenPrice: number | null; // LP token price in USD from backstop
  blndPerLpToken: number; // BLND tokens per LP token (for converting emissions to LP)
  // Backstop comet pool data for estSingleSidedDeposit calculation
  backstopPoolBlnd: bigint; // BLND in comet pool (7 decimals)
  backstopPoolShares: bigint; // Total LP shares in comet pool (7 decimals)
}

interface LoadContext {
  network: Network;
  pools: TrackedPool[];
  oracleDecimals: Map<string, number>;
}

interface PoolSnapshot {
  tracked: TrackedPool;
  metadata: PoolMetadata;
  pool: Pool;
  oracle: PoolOracle | null;
  user: PoolUser | undefined;
  backstop: Backstop | null;
}

// Module-level caches with TTL for better performance
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const POOL_CACHE_TTL = 30 * 1000; // 30 seconds for pool-level data

const backstopCache = new Map<string, Backstop | null>();
const tokenMetadataGlobalCache = new Map<string, CacheEntry<TokenMetadata>>();
const priceGlobalCache = new Map<string, CacheEntry<PriceQuote | null>>();

// Pool instance cache - caches pool-level data (metadata, pool, oracle, backstop)
interface PoolInstanceCacheEntry {
  metadata: PoolMetadata;
  pool: Pool;
  oracle: PoolOracle | null;
  backstop: Backstop | null;
  timestamp: number;
}
const poolInstanceCache = new Map<string, PoolInstanceCacheEntry>();

// Backstop pool cache - caches BackstopPoolV1/V2 data
const backstopPoolCache = new Map<string, CacheEntry<BackstopPoolV1 | BackstopPoolV2>>();

// In-flight request deduplication - prevents concurrent duplicate RPC calls
const inFlightRequests = new Map<string, Promise<BlendWalletSnapshot>>();

function isCacheValid<T>(entry: CacheEntry<T> | undefined): boolean {
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_TTL;
}

function getCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const entry = cache.get(key);
  if (isCacheValid(entry)) {
    return entry!.data;
  }
  cache.delete(key); // Remove stale entry
  return undefined;
}

function setCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
  cache.set(key, { data: value, timestamp: Date.now() });
}

async function loadBackstop(
  network: Network,
  backstopId: string | undefined
): Promise<Backstop | null> {
  if (!backstopId) {
    return null;
  }

  if (backstopCache.has(backstopId)) {
    return backstopCache.get(backstopId)!;
  }

  try {
    const backstop = await Backstop.load(network, backstopId);
    backstopCache.set(backstopId, backstop);
    return backstop;
  } catch (error) {
    console.warn(
      `[blend] Failed to load backstop ${backstopId}:`,
      (error as Error)?.message ?? error
    );
    backstopCache.set(backstopId, null);
    return null;
  }
}

// Cached backstop pool loading with TTL
async function loadBackstopPoolCached(
  network: Network,
  backstopId: string,
  poolId: string,
  version: Version
): Promise<BackstopPoolV1 | BackstopPoolV2 | null> {
  const cacheKey = `${backstopId}:${poolId}`;
  const cached = getCachedValue(backstopPoolCache, cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const backstopPool = version === Version.V2
      ? await BackstopPoolV2.load(network, backstopId, poolId)
      : await BackstopPoolV1.load(network, backstopId, poolId);
    setCachedValue(backstopPoolCache, cacheKey, backstopPool);
    return backstopPool;
  } catch (error) {
    console.warn(
      `[blend] Failed to load backstop pool ${poolId}:`,
      (error as Error)?.message ?? error
    );
    return null;
  }
}

async function loadPoolInstance(
  trackedPool: TrackedPool,
  network: Network
): Promise<PoolSnapshot | null> {
  try {
    // Check pool instance cache first (30s TTL)
    const cached = poolInstanceCache.get(trackedPool.id);
    if (cached && Date.now() - cached.timestamp < POOL_CACHE_TTL) {
      return {
        tracked: trackedPool,
        metadata: cached.metadata,
        pool: cached.pool,
        oracle: cached.oracle,
        user: undefined, // User data is always fresh
        backstop: cached.backstop,
      };
    }

    const metadata = await PoolMetadata.load(network, trackedPool.id);
    const pool: Pool =
      trackedPool.version === Version.V2
        ? await PoolV2.loadWithMetadata(network, trackedPool.id, metadata)
        : await PoolV1.loadWithMetadata(network, trackedPool.id, metadata);

    // Load oracle and backstop in parallel (optimization: saves 1 round-trip)
    const [oracle, backstop] = await Promise.all([
      pool.loadOracle().catch((oracleError) => {
        console.warn(
          `[blend] Failed to load oracle for pool ${trackedPool.id}:`,
          (oracleError as Error)?.message ?? oracleError
        );
        return null;
      }),
      loadBackstop(network, metadata.backstop),
    ]);

    // Cache the pool instance for 30 seconds
    poolInstanceCache.set(trackedPool.id, {
      metadata,
      pool,
      oracle,
      backstop,
      timestamp: Date.now(),
    });

    const snapshot: PoolSnapshot = {
      tracked: trackedPool,
      metadata,
      pool,
      oracle,
      user: undefined,
      backstop,
    };
    return snapshot;
  } catch (error) {
    console.error(
      `[blend] Failed to load pool ${trackedPool.id}:`,
      (error as Error)?.message ?? error,
      '\nRPC endpoint:',
      network.rpc,
      '\nPassphrase:',
      network.passphrase
    );
    return null;
  }
}

async function ensureUserLoaded(
  snapshot: PoolSnapshot,
  walletPublicKey: string | undefined
): Promise<PoolSnapshot> {
  if (!walletPublicKey) {
    return snapshot;
  }

  try {
    const user = await snapshot.pool.loadUser(walletPublicKey);
    return { ...snapshot, user };
  } catch (error) {
    console.warn(
      `[blend] Failed to load user positions for pool ${snapshot.tracked.id}:`,
      (error as Error)?.message ?? error
    );
  }

  return snapshot;
}

async function getTokenMetadata(
  network: Network,
  assetId: string,
  _cache?: Map<string, TokenMetadata> // Legacy parameter, now using global cache
): Promise<TokenMetadata | null> {
  // Check global cache first
  const cached = getCachedValue(tokenMetadataGlobalCache, assetId);
  if (cached) {
    return cached;
  }

  try {
    const metadata = await TokenMetadata.load(network, assetId);
    setCachedValue(tokenMetadataGlobalCache, assetId, metadata);
    return metadata;
  } catch (error) {
    console.warn(
      `[blend] Failed to load token metadata for ${assetId}:`,
      (error as Error)?.message ?? error
    );
    return null;
  }
}

async function getPriceQuote(
  context: LoadContext,
  snapshot: PoolSnapshot,
  reserve: Reserve,
  metadata: TokenMetadata | null,
  _cache?: Map<string, PriceQuote | null> // Legacy parameter, now using global cache
): Promise<PriceQuote | null> {
  const symbol = metadata?.symbol;
  const cacheKey = `${snapshot.tracked.id}:${reserve.assetId}:${symbol ?? ""}`;

  // Check global cache first
  const cached = getCachedValue(priceGlobalCache, cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const oracleId = snapshot.metadata.oracle;
  if (!oracleId) {
    setCachedValue(priceGlobalCache, cacheKey, null);
    return null;
  }

  try {
    let decimals: number;
    if (context.oracleDecimals.has(oracleId)) {
      decimals = context.oracleDecimals.get(oracleId)!;
    } else {
      const decimalResult = await getOracleDecimals(context.network, oracleId);
      decimals = decimalResult.decimals ?? 14;
      context.oracleDecimals.set(oracleId, decimals);
    }

    const priceResponse = await getOraclePrice(
      context.network,
      oracleId,
      reserve.assetId
    );
    const rawPrice = priceResponse.price;

    if (typeof rawPrice !== "bigint") {
      setCachedValue(priceGlobalCache, cacheKey, null);
      return null;
    }

    const usdPrice = Number(rawPrice) / Math.pow(10, decimals);

    if (!Number.isFinite(usdPrice) || usdPrice <= 0) {
      setCachedValue(priceGlobalCache, cacheKey, null);
      return null;
    }

    const quote: PriceQuote = {
      assetId: reserve.assetId,
      symbol,
      usdPrice,
      timestamp: Date.now(),
      source: "blend-oracle",
    };

    setCachedValue(priceGlobalCache, cacheKey, quote);
    return quote;
  } catch (error) {
    console.warn(
      `[blend] Failed to fetch oracle price for ${reserve.assetId}:`,
      (error as Error)?.message ?? error
    );
    setCachedValue(priceGlobalCache, cacheKey, null);
    return null;
  }
}

function computeBlndEmissionApy(
  snapshot: PoolSnapshot,
  reserve: Reserve,
  price: PriceQuote | null
): number {
  const backstop = snapshot.backstop;
  const emissions = reserve.supplyEmissions;

  if (!backstop || !emissions || !price || price.usdPrice <= 0) {
    return 0;
  }

  try {
    const totalSupply = reserve.totalSupply();
    const decimals = reserve.config?.decimals ?? 7;
    const emissionsPerAsset =
      emissions.emissionsPerYearPerToken(totalSupply, decimals);

    if (!Number.isFinite(emissionsPerAsset) || emissionsPerAsset <= 0) {
      return 0;
    }

    const backstopToken = backstop.backstopToken;
    const usdcPerBlnd =
      FixedMath.toFloat(backstopToken.usdc, 7) /
      0.2 /
      (FixedMath.toFloat(backstopToken.blnd, 7) / 0.8);

    if (!Number.isFinite(usdcPerBlnd) || usdcPerBlnd <= 0) {
      return 0;
    }

    const emissionAprDecimal =
      (emissionsPerAsset * usdcPerBlnd) / price.usdPrice;

    if (!Number.isFinite(emissionAprDecimal) || emissionAprDecimal <= 0) {
      return 0;
    }

    return emissionAprDecimal * 100;
  } catch (error) {
    console.warn(
      `[blend] Failed to compute BLND APY for ${reserve.assetId}:`,
      (error as Error)?.message ?? error
    );
    return 0;
  }
}

function computeBorrowBlndEmissionApy(
  snapshot: PoolSnapshot,
  reserve: Reserve,
  price: PriceQuote | null
): number {
  const backstop = snapshot.backstop;
  const emissions = reserve.borrowEmissions;

  if (!backstop || !emissions || !price || price.usdPrice <= 0) {
    return 0;
  }

  try {
    const totalBorrow = reserve.totalLiabilities();
    const decimals = reserve.config?.decimals ?? 7;
    const emissionsPerAsset =
      emissions.emissionsPerYearPerToken(totalBorrow, decimals);

    if (!Number.isFinite(emissionsPerAsset) || emissionsPerAsset <= 0) {
      return 0;
    }

    const backstopToken = backstop.backstopToken;
    const usdcPerBlnd =
      FixedMath.toFloat(backstopToken.usdc, 7) /
      0.2 /
      (FixedMath.toFloat(backstopToken.blnd, 7) / 0.8);

    if (!Number.isFinite(usdcPerBlnd) || usdcPerBlnd <= 0) {
      return 0;
    }

    const emissionAprDecimal =
      (emissionsPerAsset * usdcPerBlnd) / price.usdPrice;

    if (!Number.isFinite(emissionAprDecimal) || emissionAprDecimal <= 0) {
      return 0;
    }

    return emissionAprDecimal * 100;
  } catch (error) {
    console.warn(
      `[blend] Failed to compute borrow BLND APY for ${reserve.assetId}:`,
      (error as Error)?.message ?? error
    );
    return 0;
  }
}

/**
 * Emission breakdown result with supply and borrow separated
 */
interface EmissionBreakdown {
  totalEmissions: number;
  supplyEmissions: number;  // from deposits (bToken)
  borrowEmissions: number;  // from loans (dToken)
  perReserveSupply: Map<string, number>;  // assetId -> supply emissions
  perReserveBorrow: Map<string, number>;  // assetId -> borrow emissions
}

/**
 * Estimate emissions with breakdown by source (supply vs borrow).
 * This replicates the SDK's estimateEmissions logic but returns the breakdown.
 */
function estimateEmissionsWithBreakdown(
  user: PoolUser,
  reserves: Reserve[]
): EmissionBreakdown {
  let supplyEmissions = 0;
  let borrowEmissions = 0;
  const perReserveSupply = new Map<string, number>();
  const perReserveBorrow = new Map<string, number>();

  for (const reserve of reserves) {
    // Borrow emissions (dToken)
    const dTokenId = reserve.getDTokenEmissionIndex();
    const dTokenData = user.emissions.get(dTokenId);
    const dTokenPosition = user.getLiabilityDTokens(reserve);

    if (reserve.borrowEmissions && (dTokenData || dTokenPosition > BigInt(0))) {
      let dTokenAccrual = 0;
      if (dTokenData) {
        dTokenAccrual = dTokenData.estimateAccrual(
          reserve.borrowEmissions,
          reserve.config.decimals,
          dTokenPosition
        );
      } else if (dTokenPosition > BigInt(0)) {
        // User position created before emissions started
        const tempData = new PoolUserEmissionData(BigInt(0), BigInt(0));
        dTokenAccrual = tempData.estimateAccrual(
          reserve.borrowEmissions,
          reserve.config.decimals,
          dTokenPosition
        );
      }
      if (dTokenAccrual > 0) {
        borrowEmissions += dTokenAccrual;
        perReserveBorrow.set(reserve.assetId, dTokenAccrual);
      }
    }

    // Supply emissions (bToken)
    const bTokenId = reserve.getBTokenEmissionIndex();
    const bTokenData = user.emissions.get(bTokenId);
    const bTokenPosition = user.getSupplyBTokens(reserve) + user.getCollateralBTokens(reserve);

    if (reserve.supplyEmissions && (bTokenData || bTokenPosition > BigInt(0))) {
      let bTokenAccrual = 0;
      if (bTokenData) {
        bTokenAccrual = bTokenData.estimateAccrual(
          reserve.supplyEmissions,
          reserve.config.decimals,
          bTokenPosition
        );
      } else if (bTokenPosition > BigInt(0)) {
        // User position created before emissions started
        const tempData = new PoolUserEmissionData(BigInt(0), BigInt(0));
        bTokenAccrual = tempData.estimateAccrual(
          reserve.supplyEmissions,
          reserve.config.decimals,
          bTokenPosition
        );
      }
      if (bTokenAccrual > 0) {
        supplyEmissions += bTokenAccrual;
        perReserveSupply.set(reserve.assetId, bTokenAccrual);
      }
    }
  }

  return {
    totalEmissions: supplyEmissions + borrowEmissions,
    supplyEmissions,
    borrowEmissions,
    perReserveSupply,
    perReserveBorrow,
  };
}

function buildPosition(
  snapshot: PoolSnapshot,
  reserve: Reserve,
  tokenMetadata: TokenMetadata | null,
  price: PriceQuote | null,
  claimableBlnd: number = 0
): BlendReservePosition | null {
  const reserveUser = snapshot.user;
  if (!reserveUser) {
    return null;
  }

  const nonCollateralSupply = reserveUser.getSupplyFloat(reserve);
  const collateralSupply = reserveUser.getCollateralFloat(reserve);
  const totalSupply = nonCollateralSupply + collateralSupply;
  const totalBorrow = reserveUser.getLiabilitiesFloat(reserve);

  if (totalSupply === 0 && totalBorrow === 0) {
    return null;
  }

  const usdMultiplier = price?.usdPrice ?? 0;

  const supplyUsd = totalSupply * usdMultiplier;
  const borrowUsd = totalBorrow * usdMultiplier;
  const collateralUsd = collateralSupply * usdMultiplier;
  const nonCollateralUsd = nonCollateralSupply * usdMultiplier;

  const blndApy = computeBlndEmissionApy(snapshot, reserve, price);
  const borrowBlndApy = computeBorrowBlndEmissionApy(snapshot, reserve, price);

  // Extract current b_rate from SDK (normalized from raw value)
  const bRate = reserve.data?.bRate
    ? Number(reserve.data.bRate) / Math.pow(10, reserve.rateDecimals || 12)
    : 0;

  // Extract current d_rate from SDK (normalized from raw value)
  const dRate = reserve.data?.dRate
    ? Number(reserve.data.dRate) / Math.pow(10, reserve.rateDecimals || 12)
    : 0;

  // Get bTokens (raw token amounts before b_rate conversion)
  const bTokens = bRate > 0 ? totalSupply / bRate : 0;

  // Get dTokens (raw token amounts before d_rate conversion)
  const dTokens = dRate > 0 ? totalBorrow / dRate : 0;

  // Get reserve-level data
  const collateralFactor = reserve.getCollateralFactor();
  const liabilityFactor = reserve.getLiabilityFactor();
  const reserveUtilization = reserve.getUtilizationFloat();
  const reserveTotalSupply = reserve.totalSupplyFloat();
  const reserveTotalBorrow = reserve.totalLiabilitiesFloat();

  return {
    id: `${snapshot.tracked.id}-${reserve.assetId}`,
    poolId: snapshot.tracked.id,
    poolName: resolvePoolName(snapshot.tracked.id, snapshot.metadata.name),
    assetId: reserve.assetId,
    symbol: tokenMetadata?.symbol ?? reserve.assetId.slice(0, 4),
    name: tokenMetadata?.name ?? tokenMetadata?.symbol ?? reserve.assetId,
    price,
    // Supply breakdown
    supplyAmount: totalSupply,
    supplyUsdValue: supplyUsd,
    collateralAmount: collateralSupply,
    collateralUsdValue: collateralUsd,
    nonCollateralAmount: nonCollateralSupply,
    nonCollateralUsdValue: nonCollateralUsd,
    // Borrow
    borrowAmount: totalBorrow,
    borrowUsdValue: borrowUsd,
    // APYs
    supplyApy: reserve.estSupplyApy * 100,
    borrowApy: reserve.estBorrowApy * 100,
    blndApy,
    borrowBlndApy,
    // Token conversion rates
    bRate,
    dRate,
    bTokens,
    dTokens,
    // Reserve-level data
    collateralFactor,
    liabilityFactor,
    reserveUtilization,
    reserveTotalSupply,
    reserveTotalBorrow,
    // Claimable BLND emissions
    claimableBlnd,
  };
}

function aggregateSnapshot(
  positions: BlendReservePosition[],
  backstopPositions: BlendBackstopPosition[],
  poolEstimates: BlendPoolEstimate[],
  netApyOverride: number | null
): BlendWalletSnapshot {
  const totalSupplyUsd = positions.reduce(
    (acc, position) => acc + position.supplyUsdValue,
    0
  );
  const totalBorrowUsd = positions.reduce(
    (acc, position) => acc + position.borrowUsdValue,
    0
  );
  const totalCollateralUsd = positions.reduce(
    (acc, position) => acc + position.collateralUsdValue,
    0
  );
  const totalNonCollateralUsd = positions.reduce(
    (acc, position) => acc + position.nonCollateralUsdValue,
    0
  );

  // Aggregate backstop totals
  const totalBackstopUsd = backstopPositions.reduce(
    (acc, bp) => acc + bp.lpTokensUsd,
    0
  );
  const totalBackstopQ4wUsd = backstopPositions.reduce(
    (acc, bp) => acc + bp.q4wLpTokensUsd,
    0
  );

  // Net position includes backstop (but not Q4W as it's locked)
  const netPositionUsd = totalSupplyUsd - totalBorrowUsd + totalBackstopUsd;
  const totalPositionUsd = totalSupplyUsd + totalBackstopUsd;

  // Weighted Supply APY includes both supply positions and backstop interest APR
  const supplyApyValue = positions.reduce(
    (acc, position) => acc + position.supplyUsdValue * (position.supplyApy || 0),
    0
  );
  const backstopApyValue = backstopPositions.reduce(
    (acc, bp) => acc + bp.lpTokensUsd * (bp.interestApr || 0),
    0
  );
  const weightedSupplyApy =
    totalPositionUsd > 0
      ? (supplyApyValue + backstopApyValue) / totalPositionUsd
      : null;

  const weightedBorrowApy =
    totalBorrowUsd > 0
      ? positions.reduce(
          (acc, position) =>
            acc + position.borrowUsdValue * (position.borrowApy || 0),
          0
        ) / totalBorrowUsd
      : null;

  // Weighted BLND APY includes supply positions, borrow positions, and backstop emissions
  const supplyBlndValue = positions.reduce(
    (acc, position) => acc + position.supplyUsdValue * (position.blndApy || 0),
    0
  );
  const borrowBlndValue = positions.reduce(
    (acc, position) => acc + position.borrowUsdValue * (position.borrowBlndApy || 0),
    0
  );
  const backstopBlndValue = backstopPositions.reduce(
    (acc, bp) => acc + bp.lpTokensUsd * (bp.emissionApy || 0),
    0
  );
  // Total position value earning BLND (supply + borrow + backstop)
  const totalBlndEarningUsd = totalSupplyUsd + totalBorrowUsd + totalBackstopUsd;
  const weightedBlndApy =
    totalBlndEarningUsd > 0
      ? (supplyBlndValue + borrowBlndValue + backstopBlndValue) / totalBlndEarningUsd
      : null;

  // Weighted BLND APY for supply/borrow only (excludes backstop which earns LP, not BLND)
  const totalSupplyBorrowUsd = totalSupplyUsd + totalBorrowUsd;
  const weightedSupplyBorrowBlndApy =
    totalSupplyBorrowUsd > 0
      ? (supplyBlndValue + borrowBlndValue) / totalSupplyBorrowUsd
      : null;

  const computedNetApy =
    weightedSupplyApy !== null && weightedBorrowApy !== null
      ? weightedSupplyApy - weightedBorrowApy
      : weightedSupplyApy ?? null;

  const netApy =
    netApyOverride !== null && !Number.isNaN(netApyOverride)
      ? netApyOverride
      : computedNetApy;

  return {
    positions,
    backstopPositions,
    poolEstimates,
    totalSupplyUsd,
    totalBorrowUsd,
    totalCollateralUsd,
    totalNonCollateralUsd,
    totalBackstopUsd,
    totalBackstopQ4wUsd,
    netPositionUsd,
    weightedSupplyApy,
    weightedBorrowApy,
    netApy,
    weightedBlndApy,
    weightedSupplyBorrowBlndApy,
    totalEmissions: 0, // Will be set by fetchWalletBlendSnapshot
    totalSupplyEmissions: 0, // Will be set by fetchWalletBlendSnapshot
    totalBorrowEmissions: 0, // Will be set by fetchWalletBlendSnapshot
    perPoolEmissions: {}, // Will be set by fetchWalletBlendSnapshot
    perPoolSupplyEmissions: {}, // Will be set by fetchWalletBlendSnapshot
    perPoolBorrowEmissions: {}, // Will be set by fetchWalletBlendSnapshot
    blndPrice: null, // Will be set by fetchWalletBlendSnapshot
    lpTokenPrice: null, // Will be set by fetchWalletBlendSnapshot
    blndPerLpToken: 0, // Will be set by fetchWalletBlendSnapshot
    backstopPoolBlnd: BigInt(0), // Will be set by fetchWalletBlendSnapshot
    backstopPoolShares: BigInt(0), // Will be set by fetchWalletBlendSnapshot
  };
}

interface EstimatesResult {
  netApy: number | null;
  poolEstimates: BlendPoolEstimate[];
}

function computeNetApyFromEstimates(
  snapshots: PoolSnapshot[]
): EstimatesResult {
  let weightedNetApy = 0;
  let totalWeight = 0;
  const poolEstimates: BlendPoolEstimate[] = [];

  for (const snapshot of snapshots) {
    if (!snapshot.user || !snapshot.oracle) {
      continue;
    }

    try {
      const estimate = PositionsEstimate.build(
        snapshot.pool,
        snapshot.oracle,
        snapshot.user.positions
      );

      // Build pool estimate
      poolEstimates.push({
        poolId: snapshot.tracked.id,
        poolName: resolvePoolName(snapshot.tracked.id, snapshot.metadata.name),
        totalBorrowed: estimate.totalBorrowed,
        totalSupplied: estimate.totalSupplied,
        totalEffectiveLiabilities: estimate.totalEffectiveLiabilities,
        totalEffectiveCollateral: estimate.totalEffectiveCollateral,
        borrowCap: estimate.borrowCap,
        borrowLimit: estimate.borrowLimit,
        netApy: estimate.netApy * 100,
        supplyApy: estimate.supplyApy * 100,
        borrowApy: estimate.borrowApy * 100,
      });

      if (estimate.totalSupplied > 0) {
        weightedNetApy += estimate.totalSupplied * (estimate.netApy * 100);
        totalWeight += estimate.totalSupplied;
      }
    } catch (error) {
      console.warn(
        `[blend] Failed to build position estimate for pool ${snapshot.tracked.id}:`,
        (error as Error)?.message ?? error
      );
    }
  }

  return {
    netApy: totalWeight === 0 ? null : weightedNetApy / totalWeight,
    poolEstimates,
  };
}

// Request deduplication wrapper - prevents concurrent duplicate RPC calls
export async function fetchWalletBlendSnapshot(
  walletPublicKey: string | undefined,
  pools: TrackedPool[],
  options?: Partial<Omit<LoadContext, 'pools'>>
): Promise<BlendWalletSnapshot> {
  // Return empty snapshot immediately if no wallet or pools
  if (!pools.length || !walletPublicKey) {
    return {
      positions: [],
      backstopPositions: [],
      poolEstimates: [],
      totalSupplyUsd: 0,
      totalBorrowUsd: 0,
      totalCollateralUsd: 0,
      totalNonCollateralUsd: 0,
      totalBackstopUsd: 0,
      totalBackstopQ4wUsd: 0,
      netPositionUsd: 0,
      weightedSupplyApy: null,
      weightedBorrowApy: null,
      netApy: null,
      weightedBlndApy: null,
      weightedSupplyBorrowBlndApy: null,
      totalEmissions: 0,
      totalSupplyEmissions: 0,
      totalBorrowEmissions: 0,
      perPoolEmissions: {},
      perPoolSupplyEmissions: {},
      perPoolBorrowEmissions: {},
      blndPrice: null,
      lpTokenPrice: null,
      blndPerLpToken: 0,
      backstopPoolBlnd: BigInt(0),
      backstopPoolShares: BigInt(0),
    };
  }

  // Create a cache key for this specific request
  const cacheKey = `${walletPublicKey}:${pools.map(p => p.id).sort().join(',')}`;

  // Check if there's already an in-flight request for this exact data
  const existing = inFlightRequests.get(cacheKey);
  if (existing) {
    return existing;
  }

  // Create and track the new request
  const promise = fetchWalletBlendSnapshotInternal(walletPublicKey, pools, options);
  inFlightRequests.set(cacheKey, promise);

  try {
    return await promise;
  } finally {
    // Clean up after request completes (success or failure)
    inFlightRequests.delete(cacheKey);
  }
}

async function fetchWalletBlendSnapshotInternal(
  walletPublicKey: string,
  pools: TrackedPool[],
  options?: Partial<Omit<LoadContext, 'pools'>>
): Promise<BlendWalletSnapshot> {
  const context: LoadContext = {
    network: options?.network ?? getBlendNetwork(),
    pools,
    oracleDecimals: options?.oracleDecimals ?? new Map<string, number>(),
  };

  if (!context.pools.length) {
    return {
      positions: [],
      backstopPositions: [],
      poolEstimates: [],
      totalSupplyUsd: 0,
      totalBorrowUsd: 0,
      totalCollateralUsd: 0,
      totalNonCollateralUsd: 0,
      totalBackstopUsd: 0,
      totalBackstopQ4wUsd: 0,
      netPositionUsd: 0,
      weightedSupplyApy: null,
      weightedBorrowApy: null,
      netApy: null,
      weightedBlndApy: null,
      weightedSupplyBorrowBlndApy: null,
      totalEmissions: 0,
      totalSupplyEmissions: 0,
      totalBorrowEmissions: 0,
      perPoolEmissions: {},
      perPoolSupplyEmissions: {},
      perPoolBorrowEmissions: {},
      blndPrice: null,
      lpTokenPrice: null,
      blndPerLpToken: 0,
      backstopPoolBlnd: BigInt(0),
      backstopPoolShares: BigInt(0),
    };
  }

  const poolSnapshots = (
    await Promise.all(
      context.pools.map((pool) => loadPoolInstance(pool, context.network))
    )
  ).filter((snapshot): snapshot is PoolSnapshot => snapshot !== null);

  const snapshotsWithUsers = await Promise.all(
    poolSnapshots.map((snapshot) =>
      ensureUserLoaded(snapshot, walletPublicKey)
    )
  );

  const tokenMetadataCache = new Map<string, TokenMetadata>();
  const priceCache = new Map<string, PriceQuote | null>();

  // Calculate total emissions and per-reserve claimable BLND across all pools
  // With breakdown by source: supply (deposits) vs borrow
  let totalEmissions = 0;
  let totalSupplyEmissions = 0;
  let totalBorrowEmissions = 0;
  // Map: poolId -> assetId -> claimable BLND (combined)
  const perReserveEmissions = new Map<string, Map<string, number>>();
  // Map: poolId -> total claimable BLND for that pool
  const perPoolEmissionsMap = new Map<string, number>();
  // Map: poolId -> supply emissions for that pool
  const perPoolSupplyEmissionsMap = new Map<string, number>();
  // Map: poolId -> borrow emissions for that pool
  const perPoolBorrowEmissionsMap = new Map<string, number>();

  for (const snapshot of snapshotsWithUsers) {
    if (!snapshot.user || !snapshot.pool) {
      continue;
    }
    try {
      const reserves = Array.from(snapshot.pool.reserves.values());
      // Use our custom function that returns the breakdown
      const breakdown = estimateEmissionsWithBreakdown(snapshot.user, reserves);

      if (breakdown.totalEmissions > 0) {
        totalEmissions += breakdown.totalEmissions;
        totalSupplyEmissions += breakdown.supplyEmissions;
        totalBorrowEmissions += breakdown.borrowEmissions;

        // Store per-pool totals
        perPoolEmissionsMap.set(snapshot.tracked.id, breakdown.totalEmissions);
        perPoolSupplyEmissionsMap.set(snapshot.tracked.id, breakdown.supplyEmissions);
        perPoolBorrowEmissionsMap.set(snapshot.tracked.id, breakdown.borrowEmissions);

        // Store per-reserve claimable amounts (combined supply + borrow per asset)
        const poolEmissions = new Map<string, number>();
        for (const [assetId, amount] of breakdown.perReserveSupply) {
          poolEmissions.set(assetId, (poolEmissions.get(assetId) ?? 0) + amount);
        }
        for (const [assetId, amount] of breakdown.perReserveBorrow) {
          poolEmissions.set(assetId, (poolEmissions.get(assetId) ?? 0) + amount);
        }
        perReserveEmissions.set(snapshot.tracked.id, poolEmissions);
      }
    } catch (e) {
      // Failed to estimate emissions for pool
    }
  }

  const positionResults: (BlendReservePosition | null)[] = [];

  // Collect all reserve data from all snapshots for parallel fetching
  const allReserveData: Array<{
    snapshot: typeof snapshotsWithUsers[0];
    reserve: Reserve;
    poolEmissions: Map<string, number> | undefined;
  }> = [];

  for (const snapshot of snapshotsWithUsers) {
    if (!snapshot.user) {
      continue;
    }
    const reserves = Array.from(snapshot.pool.reserves.values());
    const poolEmissions = perReserveEmissions.get(snapshot.tracked.id);

    for (const reserve of reserves) {
      allReserveData.push({ snapshot, reserve, poolEmissions });
    }
  }

  // Pre-fetch oracle decimals for all unique oracles (optimization: prevents redundant calls during parallel price fetching)
  const uniqueOracleIds = [...new Set(
    allReserveData
      .map(({ snapshot }) => snapshot.metadata.oracle)
      .filter((oracleId): oracleId is string => !!oracleId)
  )];
  await Promise.all(
    uniqueOracleIds.map(async (oracleId) => {
      if (!context.oracleDecimals.has(oracleId)) {
        try {
          const result = await getOracleDecimals(context.network, oracleId);
          context.oracleDecimals.set(oracleId, result.decimals ?? 14);
        } catch (error) {
          console.warn(`[blend] Failed to pre-fetch oracle decimals for ${oracleId}:`, error);
          context.oracleDecimals.set(oracleId, 14); // Default fallback
        }
      }
    })
  );

  // Fetch all token metadata in parallel
  const tokenMetadataResults = await Promise.all(
    allReserveData.map(({ reserve }) =>
      getTokenMetadata(context.network, reserve.assetId, tokenMetadataCache)
    )
  );

  // Fetch all prices in parallel (now that we have metadata and oracle decimals are cached)
  const priceResults = await Promise.all(
    allReserveData.map(({ snapshot, reserve }, i) =>
      getPriceQuote(context, snapshot, reserve, tokenMetadataResults[i], priceCache)
    )
  );

  // Build all positions (sync, no awaits needed)
  for (let i = 0; i < allReserveData.length; i++) {
    const { snapshot, reserve, poolEmissions } = allReserveData[i];
    const tokenMetadata = tokenMetadataResults[i];
    const price = priceResults[i];
    const claimableBlnd = poolEmissions?.get(reserve.assetId) ?? 0;

    const position = buildPosition(snapshot, reserve, tokenMetadata, price, claimableBlnd);
    if (position) {
      positionResults.push(position);
    }
  }

  const flattenedPositions = positionResults.filter(
    (position): position is BlendReservePosition => !!position
  );

  // Calculate BLND price and LP token price from first available backstop
  let blndPrice: number | null = null;
  let lpTokenPrice: number | null = null;
  let backstopToken: { blndPerLpToken: number; usdcPerLpToken: number; lpTokenPrice: number; blnd: bigint; shares: bigint } | null = null;

  for (const poolSnapshot of snapshotsWithUsers) {
    if (poolSnapshot.backstop?.backstopToken) {
      try {
        const bt = poolSnapshot.backstop.backstopToken;
        const usdcAmount = FixedMath.toFloat(bt.usdc, 7);
        const blndAmount = FixedMath.toFloat(bt.blnd, 7);
        // Backstop is 80% BLND / 20% USDC
        if (blndAmount > 0) {
          blndPrice = (usdcAmount / 0.2) / (blndAmount / 0.8);
          lpTokenPrice = bt.lpTokenPrice;
          backstopToken = {
            blndPerLpToken: bt.blndPerLpToken,
            usdcPerLpToken: bt.usdcPerLpToken,
            lpTokenPrice: bt.lpTokenPrice,
            // Raw values needed for estSingleSidedDeposit calculation
            blnd: bt.blnd,
            shares: bt.shares,
          };
          break;
        }
      } catch {
        // Failed to calculate BLND price - continue
      }
    }
  }

  // Load backstop positions for each pool (parallelized)
  const backstopPositions: BlendBackstopPosition[] = [];

  // Filter to pools with backstop config
  const poolsWithBackstop = snapshotsWithUsers.filter(
    (s) => s.backstop && s.metadata.backstop
  );

  // Step 1: Load all BackstopPoolUser in parallel
  const backstopUserResults = await Promise.all(
    poolsWithBackstop.map(async (poolSnapshot) => {
      try {
        const backstopUser = await BackstopPoolUser.load(
          context.network,
          poolSnapshot.metadata.backstop!,
          poolSnapshot.tracked.id,
          walletPublicKey
        );
        return { poolSnapshot, backstopUser, error: null };
      } catch (error) {
        return { poolSnapshot, backstopUser: null, error };
      }
    })
  );

  // Step 2: Filter to users with actual positions
  const usersWithPositions = backstopUserResults.filter(
    (r) =>
      r.backstopUser &&
      (r.backstopUser.balance.shares !== BigInt(0) ||
        r.backstopUser.balance.totalQ4W !== BigInt(0))
  ) as Array<{
    poolSnapshot: typeof poolsWithBackstop[0];
    backstopUser: Awaited<ReturnType<typeof BackstopPoolUser.load>>;
    error: null;
  }>;

  // Step 3: Load all BackstopPool data in parallel (with caching)
  const backstopPoolResults = await Promise.all(
    usersWithPositions.map(async ({ poolSnapshot }) => {
      const backstopId = poolSnapshot.metadata.backstop!;
      const poolId = poolSnapshot.tracked.id;
      const backstopPool = await loadBackstopPoolCached(
        context.network,
        backstopId,
        poolId,
        poolSnapshot.tracked.version
      );
      return { backstopPool, error: backstopPool ? null : new Error('Failed to load') };
    })
  );

  // Step 4: Build all positions (sync calculations)
  for (let i = 0; i < usersWithPositions.length; i++) {
    const { poolSnapshot, backstopUser } = usersWithPositions[i];
    const { backstopPool, error } = backstopPoolResults[i];

    if (error || !backstopPool) {
      console.warn(
        `[blend] Failed to load backstop pool for ${poolSnapshot.tracked.id}:`,
        error
      );
      continue;
    }

    try {
      const poolId = poolSnapshot.tracked.id;
      const userShares = backstopUser.balance.shares;
      const totalQ4wShares = backstopUser.balance.totalQ4W;

      // Convert shares to LP tokens
      const lpTokens = backstopPool.sharesToBackstopTokensFloat(userShares);
      const q4wLpTokens = backstopPool.sharesToBackstopTokensFloat(totalQ4wShares);
      const unlockedQ4wLpTokens = backstopPool.sharesToBackstopTokensFloat(backstopUser.balance.unlockedQ4W);

      // Calculate USD values
      const tokenPrice = lpTokenPrice ?? 0;
      const lpTokensUsd = lpTokens * tokenPrice;
      const q4wLpTokensUsd = q4wLpTokens * tokenPrice;

      // Calculate BLND/USDC breakdown
      const blndPerLp = backstopToken?.blndPerLpToken ?? 0;
      const usdcPerLp = backstopToken?.usdcPerLpToken ?? 0;
      const blndAmount = lpTokens * blndPerLp;
      const usdcAmount = lpTokens * usdcPerLp;

      // Parse all Q4W chunks with individual amounts and expirations
      // Note: When q4w array is empty but totalQ4W > 0, it means all Q4W has unlocked
      // (the entries are removed from q4w array once unlocked, moved to unlockedQ4W)
      const q4wChunks: Q4WChunk[] = backstopUser.balance.q4w.map(q4wEntry => {
        const chunkShares = q4wEntry.amount;
        const chunkLpTokens = backstopPool.sharesToBackstopTokensFloat(chunkShares);
        const expNum = typeof q4wEntry.exp === 'bigint' ? Number(q4wEntry.exp) : Number(q4wEntry.exp);
        return {
          shares: chunkShares,
          lpTokens: chunkLpTokens,
          lpTokensUsd: chunkLpTokens * tokenPrice,
          expiration: expNum,
        };
      }).sort((a, b) => a.expiration - b.expiration); // Sort by expiration (closest first)

      // Get closest Q4W expiration for backwards compatibility
      const q4wExpiration = q4wChunks.length > 0 && q4wChunks[0].expiration > 0
        ? q4wChunks[0].expiration
        : null;

      // Calculate emission APY for this pool's backstop
      // emissionPerYearPerBackstopToken() returns BLND per LP token per year
      const blndEmissionsPerLpToken = backstopPool.emissionPerYearPerBackstopToken();
      // Convert to APY: (BLND emissions × BLND price) / LP token price × 100
      const emissionValueUsd = blndEmissionsPerLpToken * (blndPrice ?? 0);
      const emissionApy = tokenPrice > 0 ? (emissionValueUsd / tokenPrice) * 100 : 0;

      // Calculate interest APR for backstop using same formula as Blend UI:
      // estBackstopApr = (backstopRate * avgBorrowApy * totalBorrowed) / totalSpotValue
      let interestApr = 0;
      let poolQ4wPercent = 0;

      if (poolSnapshot.oracle && poolSnapshot.backstop?.backstopToken) {
        try {
          // Get pool estimate with avgBorrowApy and totalBorrowed
          const poolEst = PoolEstimate.build(poolSnapshot.pool.reserves, poolSnapshot.oracle);

          // Get backstop pool estimate with totalSpotValue and q4wPercentage
          const backstopPoolEst = BackstopPoolEst.build(
            poolSnapshot.backstop.backstopToken,
            backstopPool.poolBalance
          );

          // backstopRate is stored as fixed-point with 7 decimals
          const backstopRateFloat = FixedMath.toFloat(BigInt(poolSnapshot.metadata.backstopRate), 7);

          // Calculate APR using Blend UI formula (result is already a decimal, multiply by 100 for %)
          if (backstopPoolEst.totalSpotValue > 0) {
            interestApr = (backstopRateFloat * poolEst.avgBorrowApy * poolEst.totalBorrowed) / backstopPoolEst.totalSpotValue * 100;
          }

          // Pool-level Q4W percentage (risk indicator) - already in decimal form, multiply by 100 for %
          poolQ4wPercent = backstopPoolEst.q4wPercentage * 100;
        } catch (e) {
          console.warn(`[blend] Failed to calculate backstop APR for pool ${poolId}:`, e);
        }
      }

      // Get the actual pending BLND for backstop position from SDK
      // Use BackstopPoolUserEst.build() - the same method the Blend UI uses
      // This ensures we get the exact same calculation
      let backstopClaimableBlnd = 0;
      try {
        // Use BackstopPoolUserEst.build() - exactly like the Blend UI does
        // This handles all the edge cases (undefined emissions, index calculations, etc.)
        const backstopUserEst = BackstopPoolUserEst.build(
          poolSnapshot.backstop!,
          backstopPool,
          backstopUser
        );

        backstopClaimableBlnd = backstopUserEst.emissions;
      } catch {
        // Failed to get backstop emissions for pool
      }

      // Simulate the exact LP tokens from emissions via on-chain RPC
      // This replicates what Blend UI does with cometContract.depositTokenInGetLPOut()
      let simulatedEmissionsLp: number | null = null;
      if (backstopClaimableBlnd > 0 && poolSnapshot.backstop) {
        try {
          simulatedEmissionsLp = await simulateCometDeposit(
            poolSnapshot.backstop.backstopToken.id, // comet pool address
            poolSnapshot.backstop.config.blndTkn, // BLND token address
            poolSnapshot.backstop.id, // backstop address (used as "user" in simulation)
            backstopClaimableBlnd // BLND amount to simulate depositing
          );
        } catch (e) {
          console.warn(`[blend] Failed to simulate comet deposit for pool ${poolId}:`, e);
        }
      }

      backstopPositions.push({
        id: `backstop-${poolId}`,
        poolId,
        poolName: resolvePoolName(poolId, poolSnapshot.metadata.name),
        shares: userShares,
        lpTokens,
        lpTokensUsd,
        blndAmount,
        usdcAmount,
        q4wShares: totalQ4wShares,
        q4wLpTokens,
        q4wLpTokensUsd,
        q4wExpiration,
        q4wChunks,
        unlockedQ4wShares: backstopUser.balance.unlockedQ4W,
        unlockedQ4wLpTokens,
        interestApr: Number.isFinite(interestApr) ? interestApr : 0,
        emissionApy: Number.isFinite(emissionApy) ? emissionApy : 0,
        blndEmissionsPerLpToken: Number.isFinite(blndEmissionsPerLpToken) ? blndEmissionsPerLpToken : 0,
        // Yield fields - will be enriched by hook with data from events database
        costBasisLp: 0,
        yieldLp: 0,
        yieldPercent: 0,
        // Pool-level risk indicator
        poolQ4wPercent: Number.isFinite(poolQ4wPercent) ? poolQ4wPercent : 0,
        // Claimable BLND emissions
        claimableBlnd: Number.isFinite(backstopClaimableBlnd) ? backstopClaimableBlnd : 0,
        // Simulated LP tokens from emissions (via on-chain simulation)
        simulatedEmissionsLp,
      });
    } catch (error) {
      console.warn(
        `[blend] Failed to load backstop position for pool ${poolSnapshot.tracked.id}:`,
        (error as Error)?.message ?? error
      );
    }
  }

  const estimatesResult = computeNetApyFromEstimates(snapshotsWithUsers);
  const snapshot = aggregateSnapshot(
    flattenedPositions,
    backstopPositions,
    estimatesResult.poolEstimates,
    estimatesResult.netApy
  );

  // Convert per-pool emissions maps to plain objects for serialization
  const perPoolEmissions: Record<string, number> = {};
  perPoolEmissionsMap.forEach((value, key) => {
    perPoolEmissions[key] = value;
  });

  const perPoolSupplyEmissions: Record<string, number> = {};
  perPoolSupplyEmissionsMap.forEach((value, key) => {
    perPoolSupplyEmissions[key] = value;
  });

  const perPoolBorrowEmissions: Record<string, number> = {};
  perPoolBorrowEmissionsMap.forEach((value, key) => {
    perPoolBorrowEmissions[key] = value;
  });

  // Add total emissions, per-pool emissions, BLND price, and LP token price to snapshot
  return {
    ...snapshot,
    totalEmissions,
    totalSupplyEmissions,
    totalBorrowEmissions,
    perPoolEmissions,
    perPoolSupplyEmissions,
    perPoolBorrowEmissions,
    blndPrice,
    lpTokenPrice,
    blndPerLpToken: backstopToken?.blndPerLpToken ?? 0,
    backstopPoolBlnd: backstopToken?.blnd ?? BigInt(0),
    backstopPoolShares: backstopToken?.shares ?? BigInt(0),
  };
}
