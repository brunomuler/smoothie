/**
 * Backstop Cost Basis API Route
 * Fetches backstop cost basis (deposited - withdrawn LP tokens) for a user
 */

import { NextRequest, NextResponse } from 'next/server'
import { eventsRepository } from '@/lib/db/events-repository'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const user = searchParams.get('user')
    const poolId = searchParams.get('pool') || undefined

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

    // If pool is specified, get cost basis for that pool only
    // Otherwise, get cost basis for all pools
    if (poolId) {
      const costBasis = await eventsRepository.getBackstopCostBasis(user, poolId)

      return NextResponse.json({
        user_address: user,
        cost_bases: costBasis ? [costBasis] : [],
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      })
    }

    const costBases = await eventsRepository.getAllBackstopCostBases(user)

    console.log('[Backstop Cost Basis API] User:', user)
    console.log('[Backstop Cost Basis API] Cost bases found:', costBases.length)
    console.log('[Backstop Cost Basis API] Data:', JSON.stringify(costBases, null, 2))

    return NextResponse.json({
      user_address: user,
      cost_bases: costBases,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    })
  } catch (error) {
    console.error('[Backstop Cost Basis API] Error:', error)

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
