/**
 * Explore API Route
 * Provides aggregate analytics and filtering capabilities across all users
 */

import { NextRequest, NextResponse } from 'next/server'
import { exploreRepository } from '@/lib/db/explore-repository'
import { ActionType } from '@/lib/db/types'
import {
  ExploreQueryType,
  ExploreFilters,
  ExploreResponse,
  TimeRangePreset,
} from '@/types/explore'

// Valid action types for filtering
const VALID_ACTION_TYPES: ActionType[] = [
  'supply',
  'withdraw',
  'supply_collateral',
  'withdraw_collateral',
  'borrow',
  'repay',
  'claim',
  'liquidate',
]

// Convert time range preset to start/end dates
function getDateRangeFromPreset(preset: TimeRangePreset): { startDate: string; endDate: string } {
  const now = new Date()
  const endDate = now.toISOString()
  let startDate: Date

  switch (preset) {
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      break
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      break
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      break
    case '1y':
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
      break
    case 'all':
    default:
      startDate = new Date('2020-01-01') // Far enough back
      break
  }

  return { startDate: startDate.toISOString(), endDate }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Parse query parameters
    const query = (searchParams.get('query') || 'aggregates') as ExploreQueryType
    const assetAddress = searchParams.get('asset') || undefined
    const poolId = searchParams.get('pool') || undefined
    const minAmount = searchParams.get('minAmount')
      ? parseFloat(searchParams.get('minAmount')!)
      : undefined
    const minCount = searchParams.get('minCount')
      ? parseInt(searchParams.get('minCount')!, 10)
      : undefined
    const inUsd = searchParams.get('inUsd') === 'true'
    const eventTypesParam = searchParams.get('eventTypes')
    const eventTypes = eventTypesParam
      ? (eventTypesParam.split(',').filter((t) => VALID_ACTION_TYPES.includes(t as ActionType)) as ActionType[])
      : undefined
    const timeRange = searchParams.get('timeRange') as TimeRangePreset | null
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined
    const orderBy = (searchParams.get('orderBy') || 'amount') as 'amount' | 'count' | 'date'
    const orderDir = (searchParams.get('orderDir') || 'desc') as 'asc' | 'desc'
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 100)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0)

    // Determine date range
    let dateRange: { startDate?: string; endDate?: string } = {}
    if (timeRange) {
      dateRange = getDateRangeFromPreset(timeRange)
    } else if (startDate || endDate) {
      dateRange = { startDate, endDate }
    }

    // Build filters object
    const filters: ExploreFilters = {
      query,
      assetAddress,
      poolId,
      minAmount,
      minCount,
      inUsd,
      eventTypes,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      orderBy,
      orderDir,
      limit,
      offset,
    }

    console.log(`[Explore API] Query: ${query}, Filters:`, filters)

    // Get aggregate metrics (always included)
    const aggregates = await exploreRepository.getAggregateMetrics({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      poolId,
      assetAddress,
    })

    let response: ExploreResponse

    switch (query) {
      case 'deposits': {
        if (!assetAddress) {
          return NextResponse.json(
            { error: 'Missing required parameter', message: 'asset parameter is required for deposits query' },
            { status: 400 }
          )
        }
        if (minAmount === undefined) {
          return NextResponse.json(
            { error: 'Missing required parameter', message: 'minAmount parameter is required for deposits query' },
            { status: 400 }
          )
        }

        const { results, totalCount } = await exploreRepository.getAccountsByMinDeposit({
          assetAddress,
          minAmount,
          inUsd,
          limit,
          offset,
          orderDir,
        })

        response = {
          query: 'deposits',
          filters,
          count: results.length,
          totalCount,
          results,
          aggregates,
        }
        break
      }

      case 'events': {
        if (minCount === undefined) {
          return NextResponse.json(
            { error: 'Missing required parameter', message: 'minCount parameter is required for events query' },
            { status: 400 }
          )
        }

        const { results, totalCount } = await exploreRepository.getAccountsByEventCount({
          assetAddress,
          eventTypes: eventTypes || ['supply', 'supply_collateral'],
          minCount,
          limit,
          offset,
          orderDir,
        })

        response = {
          query: 'events',
          filters,
          count: results.length,
          totalCount,
          results,
          aggregates,
        }
        break
      }

      case 'balance': {
        if (!assetAddress) {
          return NextResponse.json(
            { error: 'Missing required parameter', message: 'asset parameter is required for balance query' },
            { status: 400 }
          )
        }
        if (minAmount === undefined) {
          return NextResponse.json(
            { error: 'Missing required parameter', message: 'minAmount parameter is required for balance query' },
            { status: 400 }
          )
        }

        const { results, totalCount } = await exploreRepository.getAccountsByBalance({
          assetAddress,
          minBalance: minAmount,
          inUsd,
          limit,
          offset,
          orderDir,
        })

        response = {
          query: 'balance',
          filters,
          count: results.length,
          totalCount,
          results,
          aggregates,
        }
        break
      }

      case 'top-depositors': {
        if (!poolId) {
          return NextResponse.json(
            { error: 'Missing required parameter', message: 'pool parameter is required for top-depositors query' },
            { status: 400 }
          )
        }

        const results = await exploreRepository.getTopDepositorsByPool({
          poolId,
          assetAddress,
          limit,
        })

        response = {
          query: 'top-depositors',
          filters,
          count: results.length,
          results,
          aggregates,
        }
        break
      }

      case 'aggregates':
      default: {
        const volumeByToken = await exploreRepository.getVolumeByToken({
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          limit: 20,
        })

        response = {
          query: 'aggregates',
          filters,
          aggregates,
          volumeByToken,
        }
        break
      }
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    })
  } catch (error) {
    console.error('[Explore API] Error:', error)

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
