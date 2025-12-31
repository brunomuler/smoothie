/**
 * LP Token Price History API Route
 * Fetches daily LP token prices from the database
 */

import { NextRequest } from 'next/server'
import { pool } from '@/lib/db/config'
import {
  createApiHandler,
  optionalInt,
  CACHE_CONFIGS,
} from '@/lib/api'
import { LP_TOKEN_ADDRESS } from '@/lib/constants'

export interface LpPriceDataPoint {
  date: string
  price: number
}

interface LpPriceHistoryResponse {
  token_address: string
  days: number
  count: number
  history: LpPriceDataPoint[]
}

export const GET = createApiHandler<LpPriceHistoryResponse>({
  logPrefix: '[LP Price History API]',
  cache: CACHE_CONFIGS.LONG,

  async handler(_request: NextRequest, { searchParams }) {
    const days = optionalInt(searchParams, 'days', 180, { min: 1 })

    if (!pool) {
      throw new Error('Database not configured')
    }

    // Query daily LP token prices with forward-fill for missing dates
    const result = await pool.query(
      `
      WITH date_range AS (
        SELECT generate_series(
          CURRENT_DATE - $1::integer,
          CURRENT_DATE,
          '1 day'::interval
        )::date AS date
      ),
      available_prices AS (
        SELECT
          price_date,
          usd_price
        FROM daily_token_prices
        WHERE token_address = $2
          AND price_date >= CURRENT_DATE - $1::integer
        ORDER BY price_date DESC
      )
      SELECT
        d.date::text as price_date,
        COALESCE(
          ap.usd_price,
          -- Forward-fill: use most recent price before this date
          (
            SELECT usd_price
            FROM daily_token_prices
            WHERE token_address = $2
              AND price_date <= d.date
            ORDER BY price_date DESC
            LIMIT 1
          )
        ) as price
      FROM date_range d
      LEFT JOIN available_prices ap ON ap.price_date = d.date
      WHERE d.date <= CURRENT_DATE
      ORDER BY d.date ASC
      `,
      [days, LP_TOKEN_ADDRESS]
    )

    const history: LpPriceDataPoint[] = result.rows
      .filter((row) => row.price !== null)
      .map((row) => ({
        date: row.price_date,
        price: parseFloat(row.price) || 0,
      }))

    return {
      token_address: LP_TOKEN_ADDRESS,
      days,
      count: history.length,
      history,
    }
  },
})
