/**
 * Current Token Prices API Route
 *
 * Returns the latest USD prices for all tracked tokens.
 * Maps symbol -> USD price for easy lookup.
 */

import { NextRequest } from "next/server"
import {
  createApiHandler,
  CACHE_CONFIGS,
} from "@/lib/api"
import { pool } from "@/lib/db/config"

interface TokenPriceInfo {
  price: number
  address: string
}

interface TokenPriceMap {
  [symbol: string]: TokenPriceInfo
}

interface CurrentPricesResponse {
  prices: TokenPriceMap
}

export const GET = createApiHandler<CurrentPricesResponse>({
  logPrefix: "[Current Token Prices API]",
  cache: CACHE_CONFIGS.SHORT, // 1 minute cache

  async handler(_request: NextRequest) {
    if (!pool) {
      throw new Error("Database pool not initialized")
    }

    // Query to get latest prices joined with token symbols
    const result = await pool.query(
      `
      WITH latest_prices AS (
        SELECT DISTINCT ON (token_address)
          token_address,
          usd_price,
          price_date
        FROM daily_token_prices
        ORDER BY token_address, price_date DESC
      )
      SELECT
        t.symbol,
        t.asset_address,
        COALESCE(lp.usd_price, 0) as usd_price
      FROM tokens t
      LEFT JOIN latest_prices lp ON t.asset_address = lp.token_address
      WHERE t.symbol IS NOT NULL
      `
    )

    const prices: TokenPriceMap = {}
    for (const row of result.rows) {
      if (row.usd_price > 0) {
        prices[row.symbol] = {
          price: parseFloat(row.usd_price),
          address: row.asset_address,
        }
      }
    }

    return { prices }
  },
})
