import { pool } from './config'
import { UserBalance, UserAction, Pool, Token, DailyRate } from './types'

export class EventsRepository {
  /**
   * Get user action history from parsed_events
   */
  async getUserActions(
    userAddress: string,
    options: {
      limit?: number
      offset?: number
      actionTypes?: string[]
      poolId?: string
      assetAddress?: string
      startDate?: string
      endDate?: string
    } = {}
  ): Promise<UserAction[]> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    const { limit = 50, offset = 0, actionTypes, poolId, assetAddress, startDate, endDate } = options

    // Include events where user is either the main user OR the filler (liquidator)
    let whereClause = 'WHERE (user_address = $1 OR filler_address = $1)'
    const params: (string | number | string[])[] = [userAddress]
    let paramIndex = 2

    if (actionTypes && actionTypes.length > 0) {
      whereClause += ` AND action_type = ANY($${paramIndex})`
      params.push(actionTypes)
      paramIndex++
    }

    if (poolId) {
      whereClause += ` AND pool_id = $${paramIndex}`
      params.push(poolId)
      paramIndex++
    }

    if (assetAddress) {
      // For auction events, also match lot_asset or bid_asset
      whereClause += ` AND (asset_address = $${paramIndex} OR lot_asset = $${paramIndex} OR bid_asset = $${paramIndex})`
      params.push(assetAddress)
      paramIndex++
    }

    if (startDate) {
      whereClause += ` AND ledger_closed_at >= $${paramIndex}::date`
      params.push(startDate)
      paramIndex++
    }

    if (endDate) {
      whereClause += ` AND ledger_closed_at < ($${paramIndex}::date + interval '1 day')`
      params.push(endDate)
      paramIndex++
    }

    params.push(limit, offset)

    const result = await pool.query(
      `
      SELECT
        id,
        pool_id,
        pool_name,
        pool_short_name,
        transaction_hash,
        ledger_sequence,
        to_char(ledger_closed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ledger_closed_at,
        action_type,
        asset_address,
        asset_symbol,
        asset_name,
        asset_decimals,
        user_address,
        amount_underlying,
        amount_tokens,
        implied_rate,
        rate_type,
        claim_amount,
        auction_type,
        filler_address,
        liquidation_percent,
        lot_asset,
        lot_amount,
        bid_asset,
        bid_amount,
        lot_asset_symbol,
        bid_asset_symbol
      FROM user_action_history
      ${whereClause}
      ORDER BY ledger_closed_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `,
      params
    )

    return result.rows.map((row) => ({
      id: row.id,
      pool_id: row.pool_id,
      pool_name: row.pool_name,
      pool_short_name: row.pool_short_name,
      transaction_hash: row.transaction_hash,
      ledger_sequence: row.ledger_sequence,
      ledger_closed_at: row.ledger_closed_at,
      action_type: row.action_type,
      asset_address: row.asset_address,
      asset_symbol: row.asset_symbol,
      asset_name: row.asset_name,
      asset_decimals: row.asset_decimals ? parseInt(row.asset_decimals) : null,
      user_address: row.user_address,
      amount_underlying: row.amount_underlying ? parseFloat(row.amount_underlying) : null,
      amount_tokens: row.amount_tokens ? parseFloat(row.amount_tokens) : null,
      implied_rate: row.implied_rate ? parseFloat(row.implied_rate) : null,
      rate_type: row.rate_type,
      claim_amount: row.claim_amount ? parseFloat(row.claim_amount) : null,
      // Auction-specific fields
      auction_type: row.auction_type != null ? parseInt(row.auction_type) : null,
      filler_address: row.filler_address,
      liquidation_percent: row.liquidation_percent != null ? parseInt(row.liquidation_percent) : null,
      lot_asset: row.lot_asset,
      lot_amount: row.lot_amount ? parseFloat(row.lot_amount) : null,
      bid_asset: row.bid_asset,
      bid_amount: row.bid_amount ? parseFloat(row.bid_amount) : null,
      lot_asset_symbol: row.lot_asset_symbol,
      bid_asset_symbol: row.bid_asset_symbol,
    }))
  }

  /**
   * Get balance history from events - computes running positions and applies daily rates
   * This replaces Dune for historical balance data
   * Updated: 2025-12-08 - Added support for fill_auction events (liquidations)
   */
  async getBalanceHistoryFromEvents(
    userAddress: string,
    assetAddress: string,
    days: number = 30
  ): Promise<{ history: UserBalance[]; firstEventDate: string | null }> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    // First, get the earliest event date for this user/asset (including auction events)
    const firstEventResult = await pool.query(
      `
      SELECT MIN(DATE(ledger_closed_at))::text AS first_event_date
      FROM parsed_events
      WHERE (
        -- Regular events for this user/asset
        (user_address = $1 AND asset_address = $2)
        OR
        -- Auction events where user is liquidated and this asset is lot or bid
        (user_address = $1 AND action_type = 'fill_auction' AND (lot_asset = $2 OR bid_asset = $2))
        OR
        -- Auction events where user is liquidator and this asset is lot or bid
        (filler_address = $1 AND action_type = 'fill_auction' AND (lot_asset = $2 OR bid_asset = $2))
      )
      `,
      [userAddress, assetAddress]
    )
    const firstEventDate = firstEventResult.rows[0]?.first_event_date || null

    // Main query: compute daily positions from events and join with daily rates
    const result = await pool.query(
      `
      WITH date_range AS (
        SELECT generate_series(
          GREATEST(
            CURRENT_DATE - $3::integer,
            (SELECT MIN(DATE(ledger_closed_at)) FROM parsed_events
             WHERE (user_address = $1 AND asset_address = $2)
                OR (user_address = $1 AND action_type = 'fill_auction' AND (lot_asset = $2 OR bid_asset = $2))
                OR (filler_address = $1 AND action_type = 'fill_auction' AND (lot_asset = $2 OR bid_asset = $2)))
          ),
          CURRENT_DATE,
          '1 day'::interval
        )::date AS date
      ),
      -- Get all events for this user/asset ordered by time (including auction events)
      user_events AS (
        -- Regular events (supply, withdraw, borrow, repay, etc.)
        SELECT
          pool_id,
          DATE(ledger_closed_at) AS event_date,
          ledger_closed_at,
          ledger_sequence,
          action_type,
          amount_underlying,
          amount_tokens,
          implied_rate,
          NULL::bigint AS lot_amount,
          NULL::bigint AS bid_amount,
          NULL::text AS lot_asset,
          NULL::text AS bid_asset,
          NULL::text AS filler_address,
          'regular' AS event_source
        FROM parsed_events
        WHERE user_address = $1
          AND asset_address = $2
          AND action_type NOT IN ('new_auction', 'fill_auction', 'delete_auction')

        UNION ALL

        -- Liquidation auctions (type 0): new_auction is tracked for display purposes only
        -- No balance changes happen at auction creation, just when filled
        SELECT
          pool_id,
          DATE(ledger_closed_at) AS event_date,
          ledger_closed_at,
          ledger_sequence,
          action_type,
          NULL AS amount_underlying,
          NULL AS amount_tokens,
          NULL AS implied_rate,
          lot_amount,
          bid_amount,
          lot_asset,
          bid_asset,
          NULL::text AS filler_address,
          'liquidated_new' AS event_source
        FROM parsed_events
        WHERE user_address = $1
          AND action_type = 'new_auction'
          AND auction_type = 0  -- Liquidation auctions
          AND (lot_asset = $2 OR bid_asset = $2)

        UNION ALL

        -- Liquidation auctions (type 0): fill_auction is when balances change
        -- User loses BOTH collateral (lot) AND debt (bid) when auction is FILLED
        SELECT
          pool_id,
          DATE(ledger_closed_at) AS event_date,
          ledger_closed_at,
          ledger_sequence,
          action_type,
          NULL AS amount_underlying,
          NULL AS amount_tokens,
          NULL AS implied_rate,
          lot_amount,
          bid_amount,
          lot_asset,
          bid_asset,
          filler_address,
          'liquidated_fill' AS event_source
        FROM parsed_events
        WHERE user_address = $1
          AND action_type = 'fill_auction'
          AND auction_type = 0  -- Liquidation auctions
          AND (lot_asset = $2 OR bid_asset = $2)

        UNION ALL

        -- Auction events where user is LIQUIDATOR (gains collateral and debt at fill time)
        SELECT
          pool_id,
          DATE(ledger_closed_at) AS event_date,
          ledger_closed_at,
          ledger_sequence,
          action_type,
          NULL AS amount_underlying,
          NULL AS amount_tokens,
          NULL AS implied_rate,
          lot_amount,
          bid_amount,
          lot_asset,
          bid_asset,
          filler_address,
          'liquidator' AS event_source
        FROM parsed_events
        WHERE filler_address = $1
          AND action_type = 'fill_auction'
          AND auction_type = 0  -- Liquidation auctions
          AND (lot_asset = $2 OR bid_asset = $2)

        ORDER BY ledger_closed_at, ledger_sequence
      ),
      -- Calculate cumulative positions per pool up to each event
      event_positions AS (
        SELECT
          pool_id,
          event_date,
          ledger_closed_at,
          ledger_sequence,
          action_type,
          event_source,
          amount_underlying,
          amount_tokens,
          implied_rate,
          lot_amount,
          bid_amount,
          lot_asset,
          bid_asset,
          -- Cumulative supply tokens (supply/withdraw) - convert from stroops (7 decimals)
          SUM(CASE
            WHEN action_type = 'supply' THEN amount_tokens / 10000000.0
            WHEN action_type = 'withdraw' THEN -amount_tokens / 10000000.0
            ELSE 0
          END) OVER (PARTITION BY pool_id ORDER BY ledger_closed_at, ledger_sequence) AS supply_btokens,
          -- Cumulative collateral tokens (supply_collateral/withdraw_collateral + auction lot)
          SUM(CASE
            WHEN action_type = 'supply_collateral' THEN amount_tokens / 10000000.0
            WHEN action_type = 'withdraw_collateral' THEN -amount_tokens / 10000000.0
            -- Liquidated user LOSES collateral (lot) at fill_auction time
            WHEN event_source = 'liquidated_fill' AND lot_asset = $2
              THEN -lot_amount / 10000000.0
            -- Liquidator GAINS collateral (lot) at fill_auction time
            WHEN event_source = 'liquidator' AND lot_asset = $2
              THEN lot_amount / 10000000.0
            ELSE 0
          END) OVER (PARTITION BY pool_id ORDER BY ledger_closed_at, ledger_sequence) AS collateral_btokens,
          -- Cumulative debt tokens (borrow/repay + auction bid)
          SUM(CASE
            WHEN action_type = 'borrow' THEN amount_tokens / 10000000.0
            WHEN action_type = 'repay' THEN -amount_tokens / 10000000.0
            -- Liquidated user LOSES debt (bid) at fill_auction time
            WHEN event_source = 'liquidated_fill' AND bid_asset = $2
              THEN -bid_amount / 10000000.0
            -- Liquidator GAINS debt (bid) at fill_auction time
            WHEN event_source = 'liquidator' AND bid_asset = $2
              THEN bid_amount / 10000000.0
            ELSE 0
          END) OVER (PARTITION BY pool_id ORDER BY ledger_closed_at, ledger_sequence) AS liabilities_dtokens,
          -- Cumulative deposits (for cost basis tracking) - convert from stroops (7 decimals)
          SUM(CASE
            WHEN action_type IN ('supply', 'supply_collateral') THEN amount_underlying / 10000000.0
            -- Liquidator gaining collateral: add lot as "deposit" for cost basis
            WHEN event_source = 'liquidator' AND lot_asset = $2
              THEN lot_amount / 10000000.0
            ELSE 0
          END) OVER (PARTITION BY pool_id ORDER BY ledger_closed_at, ledger_sequence) AS total_deposits,
          -- Cumulative withdrawals - convert from stroops (7 decimals)
          SUM(CASE
            WHEN action_type IN ('withdraw', 'withdraw_collateral') THEN amount_underlying / 10000000.0
            -- Liquidated user losing collateral: add lot as "withdrawal" for cost basis at fill_auction
            WHEN event_source = 'liquidated_fill' AND lot_asset = $2
              THEN lot_amount / 10000000.0
            ELSE 0
          END) OVER (PARTITION BY pool_id ORDER BY ledger_closed_at, ledger_sequence) AS total_withdrawals,
          -- Cumulative borrows (for interest tracking) - convert from stroops (7 decimals)
          SUM(CASE
            WHEN action_type = 'borrow' THEN amount_underlying / 10000000.0
            -- Liquidator gaining debt: add bid as "borrow" for interest tracking
            WHEN event_source = 'liquidator' AND bid_asset = $2
              THEN bid_amount / 10000000.0
            ELSE 0
          END) OVER (PARTITION BY pool_id ORDER BY ledger_closed_at, ledger_sequence) AS total_borrows,
          -- Cumulative repays - convert from stroops (7 decimals)
          SUM(CASE
            WHEN action_type = 'repay' THEN amount_underlying / 10000000.0
            -- Liquidated user losing debt: add bid as "repay" for interest tracking at fill_auction
            WHEN event_source = 'liquidated_fill' AND bid_asset = $2
              THEN bid_amount / 10000000.0
            ELSE 0
          END) OVER (PARTITION BY pool_id ORDER BY ledger_closed_at, ledger_sequence) AS total_repays
        FROM user_events
      ),
      -- Get last position of each day per pool
      daily_positions AS (
        SELECT DISTINCT ON (pool_id, event_date)
          pool_id,
          event_date,
          ledger_sequence,
          supply_btokens,
          collateral_btokens,
          liabilities_dtokens,
          total_deposits,
          total_withdrawals,
          total_borrows,
          total_repays
        FROM event_positions
        ORDER BY pool_id, event_date, ledger_closed_at DESC, ledger_sequence DESC
      ),
      -- Get all pools this user has positions in
      user_pools AS (
        SELECT DISTINCT pool_id FROM daily_positions
      ),
      -- Cross join dates with pools
      date_pool_grid AS (
        SELECT d.date, p.pool_id
        FROM date_range d
        CROSS JOIN user_pools p
      )
      SELECT
        dpg.pool_id,
        $1 AS user_address,
        $2 AS asset_address,
        dpg.date::text AS snapshot_date,
        COALESCE(pos.ledger_sequence, 0) AS ledger_sequence,
        COALESCE(pos.supply_btokens, 0) AS supply_btokens,
        COALESCE(pos.collateral_btokens, 0) AS collateral_btokens,
        COALESCE(pos.liabilities_dtokens, 0) AS liabilities_dtokens,
        COALESCE(pos.total_deposits, 0) AS total_deposits,
        COALESCE(pos.total_withdrawals, 0) AS total_withdrawals,
        COALESCE(pos.total_borrows, 0) AS total_borrows,
        COALESCE(pos.total_repays, 0) AS total_repays,
        -- Cost basis = deposits - withdrawals, but never negative (clamp at 0)
        GREATEST(0, COALESCE(pos.total_deposits, 0) - COALESCE(pos.total_withdrawals, 0)) AS cost_basis,
        -- Borrow cost basis = borrows - repays (original amount borrowed)
        GREATEST(0, COALESCE(pos.total_borrows, 0) - COALESCE(pos.total_repays, 0)) AS borrow_cost_basis,
        rates.b_rate,
        rates.d_rate
      FROM date_pool_grid dpg
      -- Get position as of this date (latest position on or before this date)
      LEFT JOIN LATERAL (
        SELECT *
        FROM daily_positions
        WHERE pool_id = dpg.pool_id
          AND event_date <= dpg.date
        ORDER BY event_date DESC
        LIMIT 1
      ) pos ON true
      -- Get rates for this date (or most recent before)
      LEFT JOIN LATERAL (
        SELECT b_rate, d_rate
        FROM daily_rates
        WHERE pool_id = dpg.pool_id
          AND asset_address = $2
          AND rate_date <= dpg.date
        ORDER BY rate_date DESC
        LIMIT 1
      ) rates ON true
      ORDER BY dpg.date DESC, dpg.pool_id
      `,
      [userAddress, assetAddress, days]
    )

    const history: UserBalance[] = result.rows.map((row) => {
      const supply_btokens = parseFloat(row.supply_btokens) || 0
      const collateral_btokens = parseFloat(row.collateral_btokens) || 0
      const liabilities_dtokens = parseFloat(row.liabilities_dtokens) || 0
      const cost_basis = parseFloat(row.cost_basis) || 0
      const borrow_cost_basis = parseFloat(row.borrow_cost_basis) || 0
      const b_rate = row.b_rate ? parseFloat(row.b_rate) : 1.0
      const d_rate = row.d_rate ? parseFloat(row.d_rate) : 1.0 // Fallback to 1.0 if no d_rate (before first borrow)

      const supply_balance = supply_btokens * b_rate
      const collateral_balance = collateral_btokens * b_rate
      const debt_balance = liabilities_dtokens * d_rate
      const net_balance = supply_balance + collateral_balance - debt_balance

      // Calculate yield as difference between current value and cost basis
      const total_asset_value = supply_balance + collateral_balance
      const total_yield = total_asset_value - cost_basis

      // Calculate interest accrued on debt (how much debt grew from original borrow)
      const total_interest_accrued = debt_balance - borrow_cost_basis

      return {
        pool_id: row.pool_id,
        user_address: row.user_address,
        asset_address: row.asset_address,
        snapshot_date: row.snapshot_date,
        snapshot_timestamp: row.snapshot_date,
        ledger_sequence: row.ledger_sequence,
        supply_balance,
        collateral_balance,
        debt_balance,
        net_balance,
        supply_btokens,
        collateral_btokens,
        liabilities_dtokens,
        entry_hash: null,
        ledger_entry_change: null,
        b_rate,
        d_rate,
        total_cost_basis: cost_basis,
        total_yield,
        borrow_cost_basis,
        total_interest_accrued,
      }
    })

    return { history, firstEventDate }
  }

  /**
   * Get all pools metadata
   */
  async getPools(): Promise<Pool[]> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    const result = await pool.query(
      `
      SELECT pool_id, name, short_name, description, icon_url, website_url, is_active, version
      FROM pools
      WHERE is_active = true
      ORDER BY name
      `
    )

    return result.rows.map((row) => ({
      ...row,
      version: parseInt(row.version, 10),
    }))
  }

  /**
   * Get all tokens metadata
   */
  async getTokens(): Promise<Token[]> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    const result = await pool.query(
      `
      SELECT asset_address, symbol, name, decimals, icon_url, coingecko_id, is_native
      FROM tokens
      ORDER BY symbol
      `
    )

    return result.rows.map((row) => ({
      ...row,
      decimals: parseInt(row.decimals),
    }))
  }

  /**
   * Get a single token by address
   */
  async getToken(assetAddress: string): Promise<Token | null> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    const result = await pool.query(
      `
      SELECT asset_address, symbol, name, decimals, icon_url, coingecko_id, is_native
      FROM tokens
      WHERE asset_address = $1
      `,
      [assetAddress]
    )

    if (result.rows.length === 0) return null

    return {
      ...result.rows[0],
      decimals: parseInt(result.rows[0].decimals),
    }
  }

  /**
   * Get a single pool by ID
   */
  async getPool(poolId: string): Promise<Pool | null> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    const result = await pool.query(
      `
      SELECT pool_id, name, short_name, description, icon_url, website_url, is_active
      FROM pools
      WHERE pool_id = $1
      `,
      [poolId]
    )

    return result.rows[0] || null
  }

  /**
   * Get daily rates for an asset
   */
  async getDailyRates(
    assetAddress: string,
    poolId?: string,
    days: number = 30
  ): Promise<DailyRate[]> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    let whereClause = 'WHERE asset_address = $1 AND rate_date >= CURRENT_DATE - $2::integer'
    const params: (string | number)[] = [assetAddress, days]

    if (poolId) {
      whereClause += ' AND pool_id = $3'
      params.push(poolId)
    }

    const result = await pool.query(
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

    return result.rows.map((row) => ({
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
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY daily_rates')
  }
}

export const eventsRepository = new EventsRepository()
