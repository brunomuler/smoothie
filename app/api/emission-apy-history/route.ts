import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/config'

export interface EmissionApyDataPoint {
  date: string
  apy: number
}

export interface EmissionApyHistoryResponse {
  history: EmissionApyDataPoint[]
  avg30d: number
}

/**
 * GET /api/emission-apy-history
 *
 * Fetches historical BLND emission APY from daily_emission_apy table.
 *
 * Query params:
 * - pool: Pool address (required)
 * - type: APY type - 'backstop' or 'lending_supply' (required)
 * - asset: Asset address (required for lending_supply type)
 * - days: Number of days of history (default: 30)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const poolAddress = searchParams.get('pool')
  const apyType = searchParams.get('type') as 'backstop' | 'lending_supply' | null
  const assetAddress = searchParams.get('asset')
  const days = parseInt(searchParams.get('days') || '30', 10)

  if (!poolAddress) {
    return NextResponse.json(
      { error: 'Missing required parameter: pool' },
      { status: 400 }
    )
  }

  if (!apyType || !['backstop', 'lending_supply'].includes(apyType)) {
    return NextResponse.json(
      { error: 'Missing or invalid parameter: type (must be backstop or lending_supply)' },
      { status: 400 }
    )
  }

  if (apyType === 'lending_supply' && !assetAddress) {
    return NextResponse.json(
      { error: 'Missing required parameter: asset (required for lending_supply type)' },
      { status: 400 }
    )
  }

  if (!pool) {
    return NextResponse.json(
      { error: 'Database connection not available' },
      { status: 500 }
    )
  }

  try {
    let query: string
    let params: (string | number)[]

    if (apyType === 'backstop') {
      query = `
        SELECT date, apy FROM (
          SELECT DISTINCT ON (rate_date)
            rate_date::text as date,
            emission_apy as apy
          FROM daily_emission_apy
          WHERE pool_address = $1
            AND apy_type = 'backstop'
            AND rate_date >= CURRENT_DATE - $2::integer
            AND emission_apy IS NOT NULL
          ORDER BY rate_date, emission_apy DESC NULLS LAST
        ) sub
        ORDER BY date ASC
      `
      params = [poolAddress, days]
    } else {
      query = `
        SELECT date, apy FROM (
          SELECT DISTINCT ON (rate_date)
            rate_date::text as date,
            emission_apy as apy
          FROM daily_emission_apy
          WHERE pool_address = $1
            AND apy_type = 'lending_supply'
            AND asset_address = $2
            AND rate_date >= CURRENT_DATE - $3::integer
            AND emission_apy IS NOT NULL
          ORDER BY rate_date, emission_apy DESC NULLS LAST
        ) sub
        ORDER BY date ASC
      `
      params = [poolAddress, assetAddress!, days]
    }

    const result = await pool.query(query, params)

    const history: EmissionApyDataPoint[] = result.rows.map(row => ({
      date: row.date,
      apy: parseFloat(row.apy) || 0,
    }))

    // Calculate 30-day average
    const avg30d = history.length > 0
      ? history.reduce((sum, d) => sum + d.apy, 0) / history.length
      : 0

    return NextResponse.json({
      history,
      avg30d,
    } as EmissionApyHistoryResponse, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    })
  } catch (error) {
    console.error('[Emission APY History API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch emission APY history' },
      { status: 500 }
    )
  }
}
