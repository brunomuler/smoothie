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
import { TRACKED_POOLS, type TrackedPool } from "./pools";
import type { PriceQuote } from "@/lib/pricing/types";

export interface BlendReservePosition {
  id: string;
  poolId: string;
  poolName: string;
  assetId: string;
  symbol: string;
  name: string;
  price?: PriceQuote | null;
  supplyAmount: number;
  supplyUsdValue: number;
  borrowAmount: number;
  borrowUsdValue: number;
  supplyApy: number;
  borrowApy: number;
  blndApy: number;
  bRate: number; // Current b_rate from SDK
  bTokens: number; // Total bTokens (supply + collateral)
}

export interface BlendWalletSnapshot {
  positions: BlendReservePosition[];
  totalSupplyUsd: number;
  totalBorrowUsd: number;
  netPositionUsd: number;
  weightedSupplyApy: number | null;
  weightedBorrowApy: number | null;
  netApy: number | null;
  weightedBlndApy: number | null;
  totalEmissions: number; // Total claimable BLND emissions in tokens (7 decimals)
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
  const blndApy = computeBlndEmissionApy(snapshot, reserve, price);

  // Extract current b_rate from SDK (normalized from raw value)
  const bRate = reserve.data?.bRate
    ? Number(reserve.data.bRate) / Math.pow(10, reserve.rateDecimals || 12)
    : 0;

  // Get bTokens (raw token amounts before b_rate conversion)
  // Calculate by dividing the float amounts by b_rate to get bTokens
  const bTokens = bRate > 0 ? totalSupply / bRate : 0;

  return {
    id: `${snapshot.tracked.id}-${reserve.assetId}`,
    poolId: snapshot.tracked.id,
    poolName: snapshot.metadata.name,
    assetId: reserve.assetId,
    symbol: tokenMetadata?.symbol ?? reserve.assetId.slice(0, 4),
    name: tokenMetadata?.name ?? tokenMetadata?.symbol ?? reserve.assetId,
    price,
    supplyAmount: totalSupply,
    supplyUsdValue: supplyUsd,
    borrowAmount: totalBorrow,
    borrowUsdValue: borrowUsd,
    supplyApy: reserve.estSupplyApy * 100,
    borrowApy: reserve.estBorrowApy * 100,
    blndApy,
    bRate,
    bTokens,
  };
}

function aggregateSnapshot(
  positions: BlendReservePosition[],
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
    totalSupplyUsd,
    totalBorrowUsd,
    netPositionUsd,
    weightedSupplyApy,
    weightedBorrowApy,
    netApy,
    weightedBlndApy,
    totalEmissions: 0, // Will be set by fetchWalletBlendSnapshot
  };
}

function computeNetApyFromEstimates(
  snapshots: PoolSnapshot[]
): number | null {
  let weightedNetApy = 0;
  let totalWeight = 0;

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

  if (totalWeight === 0) {
    return null;
  }

  return weightedNetApy / totalWeight;
}

export async function fetchWalletBlendSnapshot(
  walletPublicKey: string | undefined,
  options?: Partial<LoadContext>
): Promise<BlendWalletSnapshot> {
  const context: LoadContext = {
    network: options?.network ?? getBlendNetwork(),
    pools: options?.pools ?? TRACKED_POOLS,
    oracleDecimals: options?.oracleDecimals ?? new Map<string, number>(),
  };

  if (!context.pools.length || !walletPublicKey) {
    return {
      positions: [],
      totalSupplyUsd: 0,
      totalBorrowUsd: 0,
      netPositionUsd: 0,
      weightedSupplyApy: null,
      weightedBorrowApy: null,
      netApy: null,
      weightedBlndApy: null,
      totalEmissions: 0,
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
      // Use estimateEmissions if available (V1) or getEmissionEstimateV2 (V2)
      let emissions = 0;
      if (typeof snapshot.user.estimateEmissions === 'function') {
        const result = snapshot.user.estimateEmissions(
          Array.from(snapshot.pool.reserves.values())
        );
        emissions = typeof result === 'object' && result !== null && 'emissions' in result
          ? Number(result.emissions) / 1e7 // Convert from stroops to tokens
          : 0;
      } else if (typeof (snapshot.user as any).getEmissionEstimateV2 === 'function') {
        const estimates = (snapshot.user as any).getEmissionEstimateV2();
        if (estimates instanceof Map) {
          for (const [, emissionData] of estimates.entries()) {
            if (emissionData && typeof emissionData === 'object' && 'accrued' in emissionData) {
              const accrued = emissionData.accrued;
              emissions += typeof accrued === 'bigint' ? Number(accrued) / 1e7 : Number(accrued) / 1e7;
            }
          }
        }
      }
      totalEmissions += emissions;
    } catch (error) {
      console.warn(`[blend] Failed to calculate emissions for pool ${snapshot.tracked.id}:`, error);
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

  const netApyEstimate = computeNetApyFromEstimates(snapshotsWithUsers);
  const snapshot = aggregateSnapshot(flattenedPositions, netApyEstimate);
  
  // Add total emissions to snapshot
  return {
    ...snapshot,
    totalEmissions,
  };
}
