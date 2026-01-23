/**
 * APY History API Route
 * Fetches daily b_rates and calculates historical APY from rate changes
 */

import { NextRequest } from 'next/server'
import { eventsRepository } from '@/lib/db/events-repository'
import {
  createApiHandler,
  requireString,
  optionalInt,
  CACHE_CONFIGS,
} from '@/lib/api'
import { cacheKey, todayDate, CACHE_TTL } from '@/lib/redis'

export interface ApyDataPoint {
  date: string
  apy: number
}

interface ApyHistoryResponse {
  pool_id: string
  asset_address: string
  days: number
  count: number
  history: ApyDataPoint[]
}

/**
 * Calculate APY from consecutive b_rate values
 * APY = ((b_rate_today / b_rate_yesterday) ^ 365 - 1) * 100
 *
 * Handles gaps in trading activity by detecting forward-filled data (null rate_timestamp)
 * and spreading the accumulated interest over the actual elapsed days.
 */
function calculateApyFromRates(
  rates: { rate_date: string; b_rate: number | null; rate_timestamp: string | null }[]
): ApyDataPoint[] {
  // Sort by date ascending
  const sorted = [...rates].sort(
    (a, b) => new Date(a.rate_date).getTime() - new Date(b.rate_date).getTime()
  )

  const result: ApyDataPoint[] = []
  let lastRealEventIndex = 0 // Track the last row with actual on-chain data
  let pendingDaysStartIndex = -1 // Track start of forward-filled days

  // Find first row with real data to use as baseline
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].rate_timestamp !== null && sorted[i].b_rate !== null) {
      lastRealEventIndex = i
      break
    }
  }

  for (let i = 1; i < sorted.length; i++) {
    const currRate = sorted[i].b_rate
    const currHasRealData = sorted[i].rate_timestamp !== null

    if (currHasRealData && currRate !== null) {
      // This row has actual on-chain data
      const prevRate = sorted[lastRealEventIndex].b_rate

      let apy = 0
      if (prevRate && prevRate > 0) {
        // Calculate actual days elapsed since last real event
        const prevDate = new Date(sorted[lastRealEventIndex].rate_date)
        const currDate = new Date(sorted[i].rate_date)
        const daysElapsed = Math.max(
          1,
          Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24))
        )

        // Calculate daily return spread over actual elapsed days
        const totalReturn = currRate / prevRate
        const dailyReturn = Math.pow(totalReturn, 1 / daysElapsed)
        apy = Math.max(0, (Math.pow(dailyReturn, 365) - 1) * 100)
      }

      // Retroactively update any pending forward-filled days with this APY
      if (pendingDaysStartIndex >= 0) {
        for (let j = pendingDaysStartIndex; j < result.length; j++) {
          result[j].apy = apy
        }
        pendingDaysStartIndex = -1
      }

      // Add current day
      result.push({
        date: sorted[i].rate_date,
        apy: apy,
      })

      lastRealEventIndex = i
    } else {
      // Forward-filled day - mark as pending, will be updated when next real data arrives
      if (pendingDaysStartIndex < 0) {
        pendingDaysStartIndex = result.length
      }
      // Temporarily use 0 for pending days (will be updated retroactively)
      result.push({
        date: sorted[i].rate_date,
        apy: 0,
      })
    }
  }

  // If there are trailing pending days (no real data after them), use the last calculated APY
  // by looking at the last real data point's APY
  if (pendingDaysStartIndex >= 0 && result.length > 0) {
    // Find the last non-zero APY before the pending section
    let lastKnownApy = 0
    for (let j = pendingDaysStartIndex - 1; j >= 0; j--) {
      if (result[j].apy > 0) {
        lastKnownApy = result[j].apy
        break
      }
    }
    for (let j = pendingDaysStartIndex; j < result.length; j++) {
      result[j].apy = lastKnownApy
    }
  }

  return result
}

export const GET = createApiHandler<ApyHistoryResponse>({
  logPrefix: '[APY History API]',
  cache: CACHE_CONFIGS.LONG,

  redisCache: {
    ttl: CACHE_TTL.VERY_LONG, // 1 hour - historical data only changes once per day
    getKey: (request) => {
      const params = request.nextUrl.searchParams
      return cacheKey(
        'apy-history',
        params.get('pool') || '',
        params.get('asset') || '',
        params.get('days') || '180',
        todayDate()
      )
    },
  },

  async handler(_request: NextRequest, { searchParams }) {
    const poolId = requireString(searchParams, 'pool')
    const asset = requireString(searchParams, 'asset')
    const days = optionalInt(searchParams, 'days', 180, { min: 1 })

    // Fetch daily rates - add 1 extra day to calculate first day's APY
    const rates = await eventsRepository.getDailyRates(asset, poolId, days + 1)

    // Calculate APY from b_rate changes
    const apyHistory = calculateApyFromRates(rates)

    return {
      pool_id: poolId,
      asset_address: asset,
      days,
      count: apyHistory.length,
      history: apyHistory,
    }
  },
})
