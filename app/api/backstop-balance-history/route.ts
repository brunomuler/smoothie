/**
 * Backstop Balance History API Route
 * Fetches backstop LP token balance history for a user (all pools combined)
 */

import { NextRequest } from 'next/server'
import { eventsRepository } from '@/lib/db/events-repository'
import {
  createApiHandler,
  requireString,
  optionalInt,
  getTimezone,
  CACHE_CONFIGS,
  resolveWalletAddress,
} from '@/lib/api'
import { cacheKey, todayDate, CACHE_TTL } from '@/lib/redis'

interface BackstopBalanceHistoryResponse {
  user_address: string
  days: number
  count?: number
  history: Array<{
    date: string
    lp_tokens: number
    pools: Array<{ poolAddress: string; lpTokens: number }>
  }>
  firstEventDate: string | null
}

export const GET = createApiHandler<BackstopBalanceHistoryResponse>({
  logPrefix: '[Backstop Balance History API]',
  cache: CACHE_CONFIGS.MEDIUM,

  redisCache: {
    ttl: CACHE_TTL.MEDIUM, // 5 minutes
    getKey: (request) => {
      const params = request.nextUrl.searchParams
      return cacheKey(
        'backstop-balance-history',
        params.get('user') || '',
        params.get('days') || '365',
        todayDate() // Rotate cache daily
      )
    },
  },

  analytics: {
    event: 'backstop_balance_history_fetched',
    getUserAddress: (request) => request.nextUrl.searchParams.get('user') || undefined,
    getProperties: (result) => ({
      days: result.days,
      pool_count: result.history.length > 0 ? result.history[0].pools.length : 0,
      data_points: result.count || result.history.length,
    }),
  },

  async handler(_request: NextRequest, { searchParams }) {
    const user = resolveWalletAddress(requireString(searchParams, 'user'))
    const days = optionalInt(searchParams, 'days', 365, { min: 1 })
    const timezone = getTimezone(searchParams)

    // Get all backstop cost bases to find which pools the user has positions in
    const costBases = await eventsRepository.getAllBackstopCostBases(user)

    if (costBases.length === 0) {
      return {
        user_address: user,
        days,
        history: [],
        firstEventDate: null,
      }
    }

    // Fetch balance history for all pools in a single query
    const poolAddresses = costBases.map(cb => cb.pool_address)
    const allHistory = await eventsRepository.getBackstopUserBalanceHistoryMultiplePools(
      user,
      poolAddresses,
      days,
      timezone
    )

    // Aggregate history across all pools by date
    const dateMap = new Map<string, { lpTokens: number; pools: { poolAddress: string; lpTokens: number }[] }>()

    allHistory.forEach(point => {
      const existing = dateMap.get(point.date)
      if (existing) {
        existing.lpTokens += point.lp_tokens_value
        existing.pools.push({ poolAddress: point.pool_address, lpTokens: point.lp_tokens_value })
      } else {
        dateMap.set(point.date, {
          lpTokens: point.lp_tokens_value,
          pools: [{ poolAddress: point.pool_address, lpTokens: point.lp_tokens_value }]
        })
      }
    })

    // Convert to sorted array
    const history = Array.from(dateMap.entries())
      .map(([date, data]) => ({
        date,
        lp_tokens: data.lpTokens,
        pools: data.pools,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // Find first event date
    const firstEventDate = costBases.reduce((earliest, cb) => {
      if (!cb.first_deposit_date) return earliest
      if (!earliest) return cb.first_deposit_date
      return cb.first_deposit_date < earliest ? cb.first_deposit_date : earliest
    }, null as string | null)

    return {
      user_address: user,
      days,
      count: history.length,
      history,
      firstEventDate,
    }
  },
})
