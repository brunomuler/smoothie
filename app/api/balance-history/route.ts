/**
 * Balance History API Route
 * Fetches balance history from database (parsed_events + daily_rates)
 */

import { NextRequest, NextResponse } from 'next/server'
import { eventsRepository } from '@/lib/db/events-repository'

// Track when daily_rates was last refreshed (in-memory cache)
let lastRatesRefresh: number = 0
const RATES_REFRESH_INTERVAL_MS = 15 * 60 * 1000 // 15 minutes

async function ensureFreshRates(): Promise<void> {
  const now = Date.now()
  if (now - lastRatesRefresh > RATES_REFRESH_INTERVAL_MS) {
    try {
      await eventsRepository.refreshDailyRates()
      lastRatesRefresh = now
    } catch {
      // Don't throw - continue with stale data rather than failing
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const user = searchParams.get('user')
    const asset = searchParams.get('asset')
    const daysParam = searchParams.get('days') || '30'
    const days = parseInt(daysParam, 10)

    // Validate required parameters
    if (!user || !asset) {
      return NextResponse.json(
        {
          error: 'Missing required parameters',
          message: 'user and asset parameters are required',
        },
        { status: 400 },
      )
    }

    // Validate days parameter
    if (isNaN(days) || days < 1) {
      return NextResponse.json(
        {
          error: 'Invalid days parameter',
          message: 'days must be a positive number',
        },
        { status: 400 },
      )
    }

    // Ensure daily_rates is fresh (refresh if stale)
    await ensureFreshRates()

    const { history, firstEventDate } = await eventsRepository.getBalanceHistoryFromEvents(
      user,
      asset,
      days,
    )

    const response = {
      user_address: user,
      asset_address: asset,
      days,
      count: history.length,
      history,
      firstEventDate,
      source: 'database',
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600', // 5 min cache
      },
    })
  } catch (error) {
    console.error('[Balance History API] Error:', error)

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
