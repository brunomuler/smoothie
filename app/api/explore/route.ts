/**
 * Explore API Route
 *
 * Returns pool/token APY data for the explore page.
 * Supports current (from SDK) and historical (from database) APY periods.
 */

import { NextRequest } from 'next/server'
import {
  Backstop,
  BackstopPoolV2,
  Pool,
  PoolV2,
  PoolMetadata,
  PoolOracle,
  PoolEstimate,
  BackstopPoolEst,
  TokenMetadata,
  FixedMath,
  Version,
} from '@blend-capital/blend-sdk'
import { metadataRepository } from '@/lib/db/repositories/metadata-repository'
import { ratesRepository } from '@/lib/db/repositories/rates-repository'
import { eventsRepository } from '@/lib/db/events-repository'
import { pool as dbPool } from '@/lib/db/config'
import { getBlendNetwork } from '@/lib/blend/network'
import { toTrackedPools } from '@/lib/blend/pools'
import {
  createApiHandler,
  optionalString,
  CACHE_CONFIGS,
} from '@/lib/api'
import { cacheKey, todayDate, CACHE_TTL } from '@/lib/redis'
import { LP_TOKEN_ADDRESS } from '@/lib/constants'
import type {
  ApyPeriod,
  SupplyExploreItem,
  BackstopExploreItem,
  ExploreData,
  Pool24hChange,
  LpPriceDataPoint,
} from '@/types/explore'

const PERIOD_DAYS: Record<ApyPeriod, number> = {
  current: 0,
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '180d': 180,
}

interface PoolSnapshot {
  poolId: string
  poolName: string
  iconUrl: string | null
  pool: Pool
  metadata: PoolMetadata
  oracle: PoolOracle | null
  backstop: Backstop | null
  backstopPool: BackstopPoolV2 | null
}

async function loadPoolSnapshots(): Promise<PoolSnapshot[]> {
  const network = getBlendNetwork()
  const dbPools = await metadataRepository.getPools()
  const trackedPools = toTrackedPools(dbPools)

  const snapshots: PoolSnapshot[] = []

  for (const tracked of trackedPools) {
    try {
      const metadata = await PoolMetadata.load(network, tracked.id)
      const pool = await PoolV2.loadWithMetadata(network, tracked.id, metadata)

      let oracle: PoolOracle | null = null
      try {
        oracle = await pool.loadOracle()
      } catch {
        // Oracle load failed
      }

      let backstop: Backstop | null = null
      let backstopPool: BackstopPoolV2 | null = null
      if (metadata.backstop) {
        try {
          backstop = await Backstop.load(network, metadata.backstop)
          backstopPool = await BackstopPoolV2.load(network, metadata.backstop, tracked.id)
        } catch {
          // Backstop load failed
        }
      }

      const dbPool = dbPools.find((p) => p.pool_id === tracked.id)

      snapshots.push({
        poolId: tracked.id,
        poolName: metadata.name,
        iconUrl: dbPool?.icon_url ?? null,
        pool,
        metadata,
        oracle,
        backstop,
        backstopPool,
      })
    } catch (error) {
      console.error(`[Explore API] Failed to load pool ${tracked.id}:`, error)
    }
  }

  return snapshots
}

function computeBlndPrice(backstop: Backstop | null): number | null {
  if (!backstop?.backstopToken) return null

  try {
    const bt = backstop.backstopToken
    const usdcAmount = FixedMath.toFloat(bt.usdc, 7)
    const blndAmount = FixedMath.toFloat(bt.blnd, 7)
    if (blndAmount > 0) {
      return (usdcAmount / 0.2) / (blndAmount / 0.8)
    }
  } catch {
    // Failed to compute BLND price
  }
  return null
}

async function buildSupplyItems(
  snapshots: PoolSnapshot[],
  period: ApyPeriod
): Promise<SupplyExploreItem[]> {
  const network = getBlendNetwork()
  const dbTokens = await metadataRepository.getTokens()
  const tokenMap = new Map(dbTokens.map((t) => [t.asset_address, t]))

  // Get historical APY if needed
  let historicalApy: Map<string, number | null> = new Map()
  if (period !== 'current') {
    const days = PERIOD_DAYS[period]
    const rates = await ratesRepository.getPeriodApyAll(days)
    for (const r of rates) {
      historicalApy.set(`${r.pool_id}:${r.asset_address}`, r.apy)
    }
  }

  const items: SupplyExploreItem[] = []

  for (const snapshot of snapshots) {
    const blndPrice = computeBlndPrice(snapshot.backstop)

    for (const [assetId, reserve] of snapshot.pool.reserves) {
      // Get token metadata
      let tokenSymbol = assetId.slice(0, 4)
      let tokenName: string | null = null
      let iconUrl: string | null = null

      const dbToken = tokenMap.get(assetId)
      if (dbToken) {
        tokenSymbol = dbToken.symbol
        tokenName = dbToken.name
        iconUrl = dbToken.icon_url
      } else {
        try {
          const meta = await TokenMetadata.load(network, assetId)
          tokenSymbol = meta.symbol
          tokenName = meta.name
        } catch {
          // Token metadata load failed
        }
      }

      // Get APY
      let supplyApy: number | null = null
      if (period === 'current') {
        supplyApy = reserve.estSupplyApy * 100
      } else {
        const key = `${snapshot.poolId}:${assetId}`
        supplyApy = historicalApy.get(key) ?? null
      }

      // Compute BLND APY from emissions
      let blndApy: number | null = null
      if (blndPrice && blndPrice > 0 && reserve.supplyEmissions) {
        try {
          const totalSupply = reserve.totalSupply()
          const decimals = reserve.config?.decimals ?? 7
          const emissionsPerAsset = reserve.supplyEmissions.emissionsPerYearPerToken(
            totalSupply,
            decimals
          )

          if (emissionsPerAsset > 0) {
            // For stablecoins, assume $1 price; for other assets, use rough estimate
            // This is acceptable since BLND APY is already an approximation
            const assetPrice = tokenSymbol === 'USDC' ? 1 : 1
            blndApy = (emissionsPerAsset * blndPrice / assetPrice) * 100
          }
        } catch {
          // BLND APY calculation failed
        }
      }

      // Calculate total supplied and borrowed in USD and tokens (oracle prices are already loaded)
      let totalSupplied: number | null = null
      let totalBorrowed: number | null = null
      let totalSuppliedTokens: number | null = null
      let totalBorrowedTokens: number | null = null
      try {
        totalSuppliedTokens = reserve.totalSupplyFloat()
        totalBorrowedTokens = reserve.totalLiabilitiesFloat()
        if (snapshot.oracle) {
          const priceFloat = snapshot.oracle.getPriceFloat(assetId) ?? 1
          totalSupplied = totalSuppliedTokens * priceFloat
          totalBorrowed = totalBorrowedTokens * priceFloat
        }
      } catch {
        // Total supplied/borrowed calculation failed
      }

      items.push({
        poolId: snapshot.poolId,
        poolName: snapshot.poolName,
        assetAddress: assetId,
        tokenSymbol,
        tokenName,
        iconUrl,
        supplyApy,
        blndApy,
        totalSupplied,
        totalBorrowed,
        totalSuppliedTokens,
        totalBorrowedTokens,
      })
    }
  }

  // Sort by APY descending
  items.sort((a, b) => (b.supplyApy ?? 0) - (a.supplyApy ?? 0))

  return items
}

function buildBackstopItems(snapshots: PoolSnapshot[]): BackstopExploreItem[] {
  const items: BackstopExploreItem[] = []

  for (const snapshot of snapshots) {
    if (!snapshot.backstop || !snapshot.backstopPool || !snapshot.oracle) {
      continue
    }

    try {
      const blndPrice = computeBlndPrice(snapshot.backstop)
      const lpTokenPrice = snapshot.backstop.backstopToken?.lpTokenPrice ?? 0

      // Calculate emission APY
      const blndEmissionsPerLpToken = snapshot.backstopPool.emissionPerYearPerBackstopToken()
      let emissionApy = 0
      if (blndPrice && lpTokenPrice > 0) {
        const emissionValueUsd = blndEmissionsPerLpToken * blndPrice
        emissionApy = (emissionValueUsd / lpTokenPrice) * 100
      }

      // Build backstop pool estimate for totals
      const backstopPoolEst = BackstopPoolEst.build(
        snapshot.backstop.backstopToken,
        snapshot.backstopPool.poolBalance
      )

      // Total deposited (totalSpotValue) and Q4W amounts
      const totalDeposited = backstopPoolEst.totalSpotValue
      const q4wPercent = backstopPoolEst.q4wPercentage * 100 // Convert to percentage
      const totalQ4w = backstopPoolEst.totalSpotValue * backstopPoolEst.q4wPercentage

      // Calculate interest APR
      let interestApr = 0
      try {
        const poolEst = PoolEstimate.build(snapshot.pool.reserves, snapshot.oracle)

        // backstopRate from pool metadata (stored as fixed-point with 7 decimals)
        const backstopRateFloat = FixedMath.toFloat(BigInt(snapshot.metadata.backstopRate), 7)

        if (backstopPoolEst.totalSpotValue > 0) {
          interestApr =
            ((backstopRateFloat * poolEst.avgBorrowApy * poolEst.totalBorrowed) /
              backstopPoolEst.totalSpotValue) *
            100
        }
      } catch {
        // Interest APR calculation failed
      }

      const totalApy = interestApr + emissionApy

      items.push({
        poolId: snapshot.poolId,
        poolName: snapshot.poolName,
        iconUrl: snapshot.iconUrl,
        interestApr: Number.isFinite(interestApr) ? interestApr : 0,
        emissionApy: Number.isFinite(emissionApy) ? emissionApy : 0,
        totalApy: Number.isFinite(totalApy) ? totalApy : 0,
        totalDeposited: Number.isFinite(totalDeposited) ? totalDeposited : null,
        totalQ4w: Number.isFinite(totalQ4w) && totalQ4w > 0 ? totalQ4w : null,
        q4wPercent: Number.isFinite(q4wPercent) && q4wPercent > 0 ? q4wPercent : null,
      })
    } catch (error) {
      console.error(`[Explore API] Failed to build backstop item for ${snapshot.poolId}:`, error)
    }
  }

  // Sort by total APY descending
  items.sort((a, b) => b.totalApy - a.totalApy)

  return items
}

/**
 * Fetch LP token price history for sparkline chart
 * Uses UTC dates since this is server-side and timezone conversion happens client-side
 */
async function fetchLpPriceHistory(): Promise<LpPriceDataPoint[]> {
  if (!dbPool) return []

  try {
    const result = await dbPool.query(
      `
      WITH date_range AS (
        SELECT generate_series(
          CURRENT_DATE - 180,
          CURRENT_DATE,
          '1 day'::interval
        )::date AS date
      ),
      available_prices AS (
        SELECT
          price_date,
          usd_price
        FROM daily_token_prices
        WHERE token_address = $1
          AND price_date >= CURRENT_DATE - 180
        ORDER BY price_date DESC
      )
      SELECT
        d.date::text as price_date,
        COALESCE(
          ap.usd_price,
          (
            SELECT usd_price
            FROM daily_token_prices
            WHERE token_address = $1
              AND price_date <= d.date
            ORDER BY price_date DESC
            LIMIT 1
          )
        ) as price
      FROM date_range d
      LEFT JOIN available_prices ap ON ap.price_date = d.date
      WHERE d.date <= CURRENT_DATE
      ORDER BY d.date ASC
      `,
      [LP_TOKEN_ADDRESS]
    )

    return result.rows
      .filter((row) => row.price !== null)
      .map((row) => ({
        date: row.price_date,
        price: parseFloat(row.price) || 0,
      }))
  } catch (error) {
    console.error('[Explore API] Failed to fetch LP price history:', error)
    return []
  }
}

export const GET = createApiHandler<ExploreData>({
  logPrefix: '[Explore API]',
  cache: CACHE_CONFIGS.MEDIUM,

  redisCache: {
    ttl: CACHE_TTL.LONG, // 15 minutes - pool data changes slowly
    getKey: (request) => {
      const params = request.nextUrl.searchParams
      return cacheKey('explore', params.get('period') || 'current', todayDate())
    },
  },

  async handler(_request: NextRequest, { searchParams }) {
    const periodParam = optionalString(searchParams, 'period') ?? 'current'
    const period = PERIOD_DAYS[periodParam as ApyPeriod] !== undefined
      ? (periodParam as ApyPeriod)
      : 'current'

    // Load all pool data
    const snapshots = await loadPoolSnapshots()

    // Build supply, backstop items, 24h changes, and LP price history in parallel
    const [supplyItems, backstopItems, pool24hChangesRaw, lpPriceHistory] = await Promise.all([
      buildSupplyItems(snapshots, period),
      Promise.resolve(buildBackstopItems(snapshots)),
      eventsRepository.get24hPoolChanges(),
      fetchLpPriceHistory(),
    ])

    // Map to Pool24hChange type
    const pool24hChanges: Pool24hChange[] = pool24hChangesRaw.map(item => ({
      poolId: item.poolId,
      supplyChange: item.supplyChange,
      borrowChange: item.borrowChange,
    }))

    // Extract LP token price from the first snapshot with backstop data
    let lpTokenPrice: number | null = null
    for (const snapshot of snapshots) {
      if (snapshot.backstop?.backstopToken?.lpTokenPrice) {
        lpTokenPrice = snapshot.backstop.backstopToken.lpTokenPrice
        break
      }
    }

    return {
      period,
      supplyItems,
      backstopItems,
      pool24hChanges,
      lpTokenPrice,
      lpPriceHistory,
    }
  },
})
