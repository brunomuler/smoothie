/**
 * Batch Balance History API Route
 * Fetches balance history for multiple assets in a single request.
 * This reduces HTTP overhead compared to making separate requests per asset.
 */

import { NextRequest, NextResponse } from 'next/server'
import { eventsRepository } from '@/lib/db/events-repository'
import { getAnalyticsUserIdFromRequest, captureServerEvent, hashWalletAddress } from '@/lib/analytics-server'
import { resolveWalletAddress } from '@/lib/api'

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
    const assetsParam = searchParams.get('assets') // Comma-separated asset addresses
    const daysParam = searchParams.get('days') || '30'
    const days = parseInt(daysParam, 10)
    const timezone = searchParams.get('timezone') || 'UTC'
    const analyticsUserId = getAnalyticsUserIdFromRequest(request)

    // Validate required parameters
    if (!user || !assetsParam) {
      return NextResponse.json(
        {
          error: 'Missing required parameters',
          message: 'user and assets parameters are required',
        },
        { status: 400 },
      )
    }

    // Resolve demo wallet alias to real address
    const resolvedUser = resolveWalletAddress(user)

    const assets = assetsParam.split(',').filter(a => a.trim())

    if (assets.length === 0) {
      return NextResponse.json(
        {
          error: 'Invalid assets parameter',
          message: 'assets must contain at least one asset address',
        },
        { status: 400 },
      )
    }

    // Limit to prevent abuse
    if (assets.length > 50) {
      return NextResponse.json(
        {
          error: 'Too many assets',
          message: 'Maximum 50 assets per request',
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

    // Fetch all balance histories in parallel
    const results = await Promise.all(
      assets.map(async (asset) => {
        try {
          const { history, firstEventDate } = await eventsRepository.getBalanceHistoryFromEvents(
            resolvedUser,
            asset,
            days,
            timezone,
          )
          return {
            asset_address: asset,
            history,
            firstEventDate,
            error: null,
          }
        } catch (error) {
          return {
            asset_address: asset,
            history: [],
            firstEventDate: null,
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        }
      })
    )

    const hashedAddress = hashWalletAddress(user)
    captureServerEvent(analyticsUserId, {
      event: 'balance_history_batch_fetched',
      properties: {
        wallet_address_hash: hashedAddress,
        days,
        asset_count: assets.length,
      },
      $set: { last_wallet_address_hash: hashedAddress },
    })

    return NextResponse.json({
      user_address: user,
      days,
      results,
      source: 'database',
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600', // 5 min cache
      },
    })
  } catch (error) {
    console.error('[Balance History Batch API] Error:', error)

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
