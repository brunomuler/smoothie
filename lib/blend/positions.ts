import {
  Backstop,
  Pool,
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
  blndApy: number;
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
  poolEstimates: BlendPoolEstimate[]; // Per-pool health/borrow data
  totalSupplyUsd: number;
  totalBorrowUsd: number;
  totalCollateralUsd: number; // Total collateralized supply
  totalNonCollateralUsd: number; // Total non-collateralized supply
  netPositionUsd: number;
  weightedSupplyApy: number | null;
  weightedBorrowApy: number | null;
  netApy: number | null;
  weightedBlndApy: number | null;
  totalEmissions: number; // Total claimable BLND emissions in tokens
  blndPrice: number | null; // BLND price in USDC from backstop
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

  const netPositionUsd = totalSupplyUsd - totalBorrowUsd;

  const weightedSupplyApy =
    totalSupplyUsd > 0
      ? positions.reduce(
          (acc, position) =>
            acc + position.supplyUsdValue * (position.supplyApy || 0),
          0
        ) / totalSupplyUsd
      : null;

  const weightedBorrowApy =
    totalBorrowUsd > 0
      ? positions.reduce(
          (acc, position) =>
            acc + position.borrowUsdValue * (position.borrowApy || 0),
          0
        ) / totalBorrowUsd
      : null;

  const weightedBlndApy =
    totalSupplyUsd > 0
      ? positions.reduce(
          (acc, position) =>
            acc + position.supplyUsdValue * (position.blndApy || 0),
          0
        ) / totalSupplyUsd
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
    poolEstimates,
    totalSupplyUsd,
    totalBorrowUsd,
    totalCollateralUsd,
    totalNonCollateralUsd,
    netPositionUsd,
    weightedSupplyApy,
    weightedBorrowApy,
    netApy,
    weightedBlndApy,
    totalEmissions: 0, // Will be set by fetchWalletBlendSnapshot
    blndPrice: null, // Will be set by fetchWalletBlendSnapshot
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
      poolEstimates: [],
      totalSupplyUsd: 0,
      totalBorrowUsd: 0,
      totalCollateralUsd: 0,
      totalNonCollateralUsd: 0,
      netPositionUsd: 0,
      weightedSupplyApy: null,
      weightedBorrowApy: null,
      netApy: null,
      weightedBlndApy: null,
      totalEmissions: 0,
      blndPrice: null,
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

  const estimatesResult = computeNetApyFromEstimates(snapshotsWithUsers);
  const snapshot = aggregateSnapshot(flattenedPositions, estimatesResult.poolEstimates, estimatesResult.netApy);

  // Calculate BLND price from first available backstop
  let blndPrice: number | null = null;
  for (const poolSnapshot of snapshotsWithUsers) {
    if (poolSnapshot.backstop?.backstopToken) {
      try {
        const backstopToken = poolSnapshot.backstop.backstopToken;
        const usdcAmount = FixedMath.toFloat(backstopToken.usdc, 7);
        const blndAmount = FixedMath.toFloat(backstopToken.blnd, 7);
        // Backstop is 80% BLND / 20% USDC
        if (blndAmount > 0) {
          blndPrice = (usdcAmount / 0.2) / (blndAmount / 0.8);
          break;
        }
      } catch {
        // Failed to calculate BLND price - continue
      }
    }
  }

  // Add total emissions and BLND price to snapshot
  return {
    ...snapshot,
    totalEmissions,
    blndPrice,
  };
}
