/**
 * Backstop Balance History API Route
 * Fetches backstop LP token balance history for a user (all pools combined)
 */

import { NextRequest, NextResponse } from 'next/server'
import { eventsRepository } from '@/lib/db/events-repository'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const user = searchParams.get('user')
    const daysParam = searchParams.get('days') || '365'
    const days = parseInt(daysParam, 10)

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

    // Get all backstop cost bases to find which pools the user has positions in
    const costBases = await eventsRepository.getAllBackstopCostBases(user)

    if (costBases.length === 0) {
      return NextResponse.json({
        user_address: user,
        days,
        history: [],
        firstEventDate: null,
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      })
    }

    // Fetch balance history for each pool
    const historyByPool = await Promise.all(
      costBases.map(cb =>
        eventsRepository.getBackstopUserBalanceHistory(user, cb.pool_address, days)
      )
    )

    // Aggregate history across all pools by date
    const dateMap = new Map<string, { lpTokens: number; pools: { poolAddress: string; lpTokens: number }[] }>()

    historyByPool.forEach((poolHistory, index) => {
      const poolAddress = costBases[index].pool_address

      poolHistory.forEach(point => {
        const existing = dateMap.get(point.date)
        if (existing) {
          existing.lpTokens += point.lp_tokens_value
          existing.pools.push({ poolAddress, lpTokens: point.lp_tokens_value })
        } else {
          dateMap.set(point.date, {
            lpTokens: point.lp_tokens_value,
            pools: [{ poolAddress, lpTokens: point.lp_tokens_value }]
          })
        }
      })
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

    return NextResponse.json({
      user_address: user,
      days,
      count: history.length,
      history,
      firstEventDate,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    })
  } catch (error) {
    console.error('[Backstop Balance History API] Error:', error)

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
