/**
 * Metadata API Route
 * Fetches pools and tokens metadata from the database
 */

import { NextRequest, NextResponse } from 'next/server'
import { eventsRepository } from '@/lib/db/events-repository'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type') // 'pools', 'tokens', or 'all' (default)

    console.log(`[Metadata API] Fetching metadata type=${type || 'all'}`)

    let pools = null
    let tokens = null

    if (type === 'pools' || type === 'all' || !type) {
      pools = await eventsRepository.getPools()
    }

    if (type === 'tokens' || type === 'all' || !type) {
      tokens = await eventsRepository.getTokens()
    }

    const response: Record<string, unknown> = {}

    if (pools !== null) {
      response.pools = pools
    }

    if (tokens !== null) {
      response.tokens = tokens
    }

    return NextResponse.json(response, {
      headers: {
        // Cache metadata for 1 hour - it rarely changes
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    })
  } catch (error) {
    console.error('[Metadata API] Error:', error)

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
