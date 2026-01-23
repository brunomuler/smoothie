/**
 * Rates Repository
 *
 * Handles daily rates queries and materialized view refresh.
 */

import { BaseRepository } from './base-repository'
import type { DailyRate } from '../types'

export class RatesRepository extends BaseRepository {
  /**
   * Get daily rates for an asset
   */
  async getDailyRates(
    assetAddress: string,
    poolId?: string,
    days: number = 30
  ): Promise<DailyRate[]> {
    let whereClause = 'WHERE asset_address = $1 AND rate_date >= CURRENT_DATE - $2::integer'
    const params: (string | number)[] = [assetAddress, days]

    if (poolId) {
      whereClause += ' AND pool_id = $3'
      params.push(poolId)
    }

    const rows = await this.query<{
      pool_id: string
      asset_address: string
      rate_date: string
      b_rate: string | null
      d_rate: string | null
      rate_timestamp: string
      ledger_sequence: number
    }>(
      `
      SELECT
        pool_id,
        asset_address,
        rate_date::text,
        b_rate,
        d_rate,
        rate_timestamp::text,
        ledger_sequence
      FROM daily_rates
      ${whereClause}
      ORDER BY rate_date DESC
      `,
      params
    )

    return rows.map((row) => ({
      pool_id: row.pool_id,
      asset_address: row.asset_address,
      rate_date: row.rate_date,
      b_rate: row.b_rate ? parseFloat(row.b_rate) : null,
      d_rate: row.d_rate ? parseFloat(row.d_rate) : null,
      rate_timestamp: row.rate_timestamp,
      ledger_sequence: row.ledger_sequence,
    }))
  }

  /**
   * Refresh the daily_rates materialized view
   */
  async refreshDailyRates(): Promise<void> {
    await this.pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY daily_rates')
  }

  /**
   * Get period APY for all pool/asset combinations
   * Calculates APY from start and end b_rate values over the period
   */
  async getPeriodApyAll(
    days: number
  ): Promise<Array<{ pool_id: string; asset_address: string; apy: number | null }>> {
    const rows = await this.query<{
      pool_id: string
      asset_address: string
      apy: string | null
    }>(
      `
      WITH period_bounds AS (
        SELECT
          pool_id,
          asset_address,
          FIRST_VALUE(b_rate) OVER (
            PARTITION BY pool_id, asset_address
            ORDER BY rate_date ASC
          ) as start_rate,
          LAST_VALUE(b_rate) OVER (
            PARTITION BY pool_id, asset_address
            ORDER BY rate_date ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
          ) as end_rate,
          FIRST_VALUE(rate_date) OVER (
            PARTITION BY pool_id, asset_address
            ORDER BY rate_date ASC
          ) as start_date,
          LAST_VALUE(rate_date) OVER (
            PARTITION BY pool_id, asset_address
            ORDER BY rate_date ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
          ) as end_date
        FROM daily_rates
        WHERE rate_date >= CURRENT_DATE - $1::integer
          AND rate_date < CURRENT_DATE  -- Exclude incomplete current day
          AND b_rate IS NOT NULL
      )
      SELECT DISTINCT
        pool_id,
        asset_address,
        CASE
          WHEN start_rate > 0 AND end_rate > 0 AND end_date > start_date
          THEN (POWER(end_rate / start_rate, 365.0 / (end_date - start_date)) - 1) * 100
          ELSE NULL
        END as apy
      FROM period_bounds
      `,
      [days]
    )

    return rows.map((row) => ({
      pool_id: row.pool_id,
      asset_address: row.asset_address,
      apy: row.apy ? parseFloat(row.apy) : null,
    }))
  }
}

// Export singleton instance
export const ratesRepository = new RatesRepository()
