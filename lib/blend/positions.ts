import {
  Backstop,
  BackstopPoolUser,
  BackstopPoolV1,
  BackstopPoolV2,
  BackstopPoolEst,
  Pool,
  PoolEstimate,
  PoolMetadata,
  PoolOracle,
  PoolV1,
  PoolV2,
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
import type { PriceQuote } from "@/lib/pricing/types";

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
  q4wShares: bigint; // Shares queued for withdrawal
  q4wLpTokens: number; // LP tokens value of queued shares
  q4wLpTokensUsd: number; // USD value of queued shares
  q4wExpiration: number | null; // Unix timestamp when Q4W unlocks
  unlockedQ4wShares: bigint; // Shares ready to withdraw (past expiration)
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
  totalEmissions: number; // Total claimable BLND emissions in tokens
  blndPrice: number | null; // BLND price in USDC from backstop
  lpTokenPrice: number | null; // LP token price in USD from backstop
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

const backstopCache = new Map<string, Backstop | null>();
const tokenMetadataGlobalCache = new Map<string, CacheEntry<TokenMetadata>>();
const priceGlobalCache = new Map<string, CacheEntry<PriceQuote | null>>();

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

async function loadPoolInstance(
  trackedPool: TrackedPool,
  network: Network
): Promise<PoolSnapshot | null> {
  try {
    const metadata = await PoolMetadata.load(network, trackedPool.id);
    const pool: Pool =
      trackedPool.version === Version.V2
        ? await PoolV2.loadWithMetadata(network, trackedPool.id, metadata)
        : await PoolV1.loadWithMetadata(network, trackedPool.id, metadata);

    let oracle: PoolOracle | null = null;
    try {
      oracle = await pool.loadOracle();
    } catch (oracleError) {
      console.warn(
        `[blend] Failed to load oracle for pool ${trackedPool.id}:`,
        (oracleError as Error)?.message ?? oracleError
      );
    }

    const backstop = await loadBackstop(network, metadata.backstop);

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

function buildPosition(
  snapshot: PoolSnapshot,
  reserve: Reserve,
  tokenMetadata: TokenMetadata | null,
  price: PriceQuote | null
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
    poolName: snapshot.metadata.name,
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

  // Weighted BLND APY includes both supply positions and backstop emissions
  const supplyBlndValue = positions.reduce(
    (acc, position) => acc + position.supplyUsdValue * (position.blndApy || 0),
    0
  );
  const backstopBlndValue = backstopPositions.reduce(
    (acc, bp) => acc + bp.lpTokensUsd * (bp.emissionApy || 0),
    0
  );
  const weightedBlndApy =
    totalPositionUsd > 0
      ? (supplyBlndValue + backstopBlndValue) / totalPositionUsd
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
    totalEmissions: 0, // Will be set by fetchWalletBlendSnapshot
    blndPrice: null, // Will be set by fetchWalletBlendSnapshot
    lpTokenPrice: null, // Will be set by fetchWalletBlendSnapshot
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
        poolName: snapshot.metadata.name,
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

export async function fetchWalletBlendSnapshot(
  walletPublicKey: string | undefined,
  pools: TrackedPool[],
  options?: Partial<Omit<LoadContext, 'pools'>>
): Promise<BlendWalletSnapshot> {
  const context: LoadContext = {
    network: options?.network ?? getBlendNetwork(),
    pools,
    oracleDecimals: options?.oracleDecimals ?? new Map<string, number>(),
  };

  if (!context.pools.length || !walletPublicKey) {
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
      totalEmissions: 0,
      blndPrice: null,
      lpTokenPrice: null,
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

  // Calculate total emissions across all pools
  let totalEmissions = 0;
  for (const snapshot of snapshotsWithUsers) {
    if (!snapshot.user || !snapshot.pool) {
      continue;
    }
    try {
      // estimateEmissions returns { emissions: number, claimedTokens: number[] }
      // The emissions value is already a float (converted via FixedMath.toFloat in the SDK)
      const result = snapshot.user.estimateEmissions(
        Array.from(snapshot.pool.reserves.values())
      );
      if (result && typeof result.emissions === 'number' && result.emissions > 0) {
        totalEmissions += result.emissions;
      }
    } catch {
      // Failed to calculate emissions - continue without them
    }
  }

  const positionResults: (BlendReservePosition | null)[] = [];

  for (const snapshot of snapshotsWithUsers) {
    if (!snapshot.user) {
      continue;
    }

    const reserves = Array.from(snapshot.pool.reserves.values());
    for (const reserve of reserves) {
      const tokenMetadata = await getTokenMetadata(
        context.network,
        reserve.assetId,
        tokenMetadataCache
      );
      const price = await getPriceQuote(
        context,
        snapshot,
        reserve,
        tokenMetadata,
        priceCache
      );

      const position = buildPosition(
        snapshot,
        reserve,
        tokenMetadata,
        price
      );
      if (position) {
        positionResults.push(position);
      }
    }
  }

  const flattenedPositions = positionResults.filter(
    (position): position is BlendReservePosition => !!position
  );

  // Calculate BLND price and LP token price from first available backstop
  let blndPrice: number | null = null;
  let lpTokenPrice: number | null = null;
  let backstopToken: { blndPerLpToken: number; usdcPerLpToken: number; lpTokenPrice: number } | null = null;

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
          };
          break;
        }
      } catch {
        // Failed to calculate BLND price - continue
      }
    }
  }

  // Load backstop positions for each pool
  const backstopPositions: BlendBackstopPosition[] = [];

  for (const poolSnapshot of snapshotsWithUsers) {
    if (!poolSnapshot.backstop || !poolSnapshot.metadata.backstop) {
      continue;
    }

    try {
      const backstopId = poolSnapshot.metadata.backstop;
      const poolId = poolSnapshot.tracked.id;

      // Load user's backstop position for this pool
      const backstopUser = await BackstopPoolUser.load(
        context.network,
        backstopId,
        poolId,
        walletPublicKey
      );

      // Skip if user has no backstop position in this pool
      const userShares = backstopUser.balance.shares;
      const totalQ4wShares = backstopUser.balance.totalQ4W;

      if (userShares === BigInt(0) && totalQ4wShares === BigInt(0)) {
        continue;
      }

      // Load the backstop pool data to get shares-to-tokens conversion
      let backstopPool: BackstopPoolV1 | BackstopPoolV2;
      if (poolSnapshot.tracked.version === Version.V2) {
        backstopPool = await BackstopPoolV2.load(context.network, backstopId, poolId);
      } else {
        backstopPool = await BackstopPoolV1.load(context.network, backstopId, poolId);
      }

      // Convert shares to LP tokens
      const lpTokens = backstopPool.sharesToBackstopTokensFloat(userShares);
      const q4wLpTokens = backstopPool.sharesToBackstopTokensFloat(totalQ4wShares);

      // Calculate USD values
      const tokenPrice = lpTokenPrice ?? 0;
      const lpTokensUsd = lpTokens * tokenPrice;
      const q4wLpTokensUsd = q4wLpTokens * tokenPrice;

      // Calculate BLND/USDC breakdown
      const blndPerLp = backstopToken?.blndPerLpToken ?? 0;
      const usdcPerLp = backstopToken?.usdcPerLpToken ?? 0;
      const blndAmount = lpTokens * blndPerLp;
      const usdcAmount = lpTokens * usdcPerLp;

      // Get Q4W expiration (use the first one if multiple exist)
      const q4wExpiration = backstopUser.balance.q4w.length > 0
        ? Number(backstopUser.balance.q4w[0].exp)
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

      backstopPositions.push({
        id: `backstop-${poolId}`,
        poolId,
        poolName: poolSnapshot.metadata.name,
        shares: userShares,
        lpTokens,
        lpTokensUsd,
        blndAmount,
        usdcAmount,
        q4wShares: totalQ4wShares,
        q4wLpTokens,
        q4wLpTokensUsd,
        q4wExpiration,
        unlockedQ4wShares: backstopUser.balance.unlockedQ4W,
        interestApr: Number.isFinite(interestApr) ? interestApr : 0,
        emissionApy: Number.isFinite(emissionApy) ? emissionApy : 0,
        blndEmissionsPerLpToken: Number.isFinite(blndEmissionsPerLpToken) ? blndEmissionsPerLpToken : 0,
        // Yield fields - will be enriched by hook with data from events database
        costBasisLp: 0,
        yieldLp: 0,
        yieldPercent: 0,
        // Pool-level risk indicator
        poolQ4wPercent: Number.isFinite(poolQ4wPercent) ? poolQ4wPercent : 0,
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

  // Add total emissions, BLND price, and LP token price to snapshot
  return {
    ...snapshot,
    totalEmissions,
    blndPrice,
    lpTokenPrice,
  };
}
