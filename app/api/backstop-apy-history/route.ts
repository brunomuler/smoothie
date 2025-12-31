/**
 * Backstop APY History API Route
 * Fetches daily share rates and calculates historical APY from rate changes
 */

import { NextRequest } from 'next/server'
import { eventsRepository } from '@/lib/db/events-repository'
import {
  createApiHandler,
  requireString,
  optionalInt,
  CACHE_CONFIGS,
} from '@/lib/api'

export interface BackstopApyDataPoint {
  date: string
  apy: number
}

interface BackstopApyHistoryResponse {
  pool_id: string
  days: number
  count: number
  history: BackstopApyDataPoint[]
}

/**
 * Calculate APY from consecutive share_rate values
 * APY = ((share_rate_today / share_rate_yesterday) ^ 365 - 1) * 100
 */
function calculateApyFromShareRates(
  rates: { rate_date: string; share_rate: number }[]
): BackstopApyDataPoint[] {
  // Sort by date ascending
  const sorted = [...rates].sort(
    (a, b) => new Date(a.rate_date).getTime() - new Date(b.rate_date).getTime()
  )

  const result: BackstopApyDataPoint[] = []
  let lastApy = 0

  for (let i = 1; i < sorted.length; i++) {
    const prevRate = sorted[i - 1].share_rate
    const currRate = sorted[i].share_rate

    if (prevRate && currRate && prevRate > 0) {
      const dailyReturn = currRate / prevRate
      // Annualize: (1 + daily_return) ^ 365 - 1
      const apy = (Math.pow(dailyReturn, 365) - 1) * 100
      lastApy = apy
      result.push({
        date: sorted[i].rate_date,
        apy: Math.max(0, apy), // APY shouldn't be negative
      })
    } else {
      // Carry forward previous APY if data is missing
      result.push({
        date: sorted[i].rate_date,
        apy: lastApy,
      })
    }
  }

  return result
}

export const GET = createApiHandler<BackstopApyHistoryResponse>({
  logPrefix: '[Backstop APY History API]',
  cache: CACHE_CONFIGS.LONG,

  async handler(_request: NextRequest, { searchParams }) {
    const poolId = requireString(searchParams, 'pool')
    const days = optionalInt(searchParams, 'days', 180, { min: 1 })

    // Fetch daily share rates - add 1 extra day to calculate first day's APY
    const rates = await eventsRepository.getBackstopDailyRates(poolId, days + 1)

    // Calculate APY from share_rate changes
    const apyHistory = calculateApyFromShareRates(rates)

    return {
      pool_id: poolId,
      days,
      count: apyHistory.length,
      history: apyHistory,
    }
  },
})
