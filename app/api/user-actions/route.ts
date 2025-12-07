/**
 * User Actions API Route
 * Fetches user action history from the database (parsed_events)
 */

import { NextRequest, NextResponse } from 'next/server'
import { eventsRepository } from '@/lib/db/events-repository'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const user = searchParams.get('user')
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const poolId = searchParams.get('pool') || undefined
    const assetAddress = searchParams.get('asset') || undefined
    const actionTypesParam = searchParams.get('actionTypes')
    const actionTypes = actionTypesParam ? actionTypesParam.split(',') : undefined

    // Validate required parameters
    if (!user) {
      return NextResponse.json(
        {
          error: 'Missing required parameter',
          message: 'user parameter is required',
        },
        { status: 400 },
      )
    }

    // Validate limit
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json(
        {
          error: 'Invalid limit parameter',
          message: 'limit must be between 1 and 100',
        },
        { status: 400 },
      )
    }

    console.log(
      `[User Actions API] Fetching actions for user=${user}, limit=${limit}, offset=${offset}`,
    )

    const actions = await eventsRepository.getUserActions(user, {
      limit,
      offset,
      actionTypes,
      poolId,
      assetAddress,
    })

    const response = {
      user_address: user,
      count: actions.length,
      limit,
      offset,
      actions,
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120', // 1 min cache
      },
    })
  } catch (error) {
    console.error('[User Actions API] Error:', error)

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
