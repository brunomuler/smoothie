/**
 * User Actions API Route
 * Fetches user action history from the database (parsed_events)
 */

import { NextRequest } from 'next/server'
import { eventsRepository } from '@/lib/db/events-repository'
import {
  createApiHandler,
  requireString,
  optionalString,
  optionalInt,
  parseList,
  CACHE_CONFIGS,
  resolveWalletAddress,
} from '@/lib/api'
import { cacheKey, todayDate, CACHE_TTL } from '@/lib/redis'

interface UserActionsResponse {
  user_address: string
  count: number
  limit: number
  offset: number
  actions: unknown[]
}

export const GET = createApiHandler<UserActionsResponse>({
  logPrefix: '[User Actions API]',
  cache: CACHE_CONFIGS.SHORT,

  redisCache: {
    ttl: CACHE_TTL.MEDIUM, // 5 minutes - user actions don't change frequently
    getKey: (request) => {
      const params = request.nextUrl.searchParams
      return cacheKey(
        'user-actions',
        params.get('user') || '',
        params.get('limit') || '50',
        params.get('offset') || '0',
        params.get('pool') || '',
        params.get('asset') || '',
        params.get('actionTypes') || '',
        params.get('startDate') || '',
        params.get('endDate') || '',
        todayDate() // Rotate cache daily for new actions
      )
    },
  },

  analytics: {
    event: 'user_actions_fetched',
    getUserAddress: (request) => request.nextUrl.searchParams.get('user') || undefined,
    getProperties: (result, userAddress) => ({
      action_count: result.count,
      has_filters: result.count !== result.actions.length,
    }),
  },

  async handler(_request: NextRequest, { searchParams }) {
    const user = resolveWalletAddress(requireString(searchParams, 'user'))
    const limit = optionalInt(searchParams, 'limit', 50, { min: 1, max: 1000 })
    const offset = optionalInt(searchParams, 'offset', 0, { min: 0 })
    const poolId = optionalString(searchParams, 'pool')
    const assetAddress = optionalString(searchParams, 'asset')
    const actionTypes = parseList(searchParams, 'actionTypes')
    const startDate = optionalString(searchParams, 'startDate')
    const endDate = optionalString(searchParams, 'endDate')

    const actions = await eventsRepository.getUserActions(user, {
      limit,
      offset,
      actionTypes,
      poolId,
      assetAddress,
      startDate,
      endDate,
    })

    return {
      user_address: user,
      count: actions.length,
      limit,
      offset,
      actions,
    }
  },
})
