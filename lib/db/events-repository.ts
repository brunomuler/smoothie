import { pool } from './config'
import { UserBalance, UserAction, Pool, Token, DailyRate, BackstopPoolState, BackstopUserBalance, BackstopCostBasis, BackstopYield } from './types'

export class EventsRepository {
  /**
   * Get user action history from parsed_events and backstop_events
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

    // Separate backstop action types from regular action types
    const backstopActionTypes = ['backstop_deposit', 'backstop_withdraw', 'backstop_queue_withdrawal', 'backstop_dequeue_withdrawal', 'backstop_claim']
    const regularActionTypes = actionTypes?.filter(t => !backstopActionTypes.includes(t))
    const requestedBackstopTypes = actionTypes?.filter(t => backstopActionTypes.includes(t))

    // If specific action types requested and none are regular, skip regular query
    const includeRegular = !actionTypes || (regularActionTypes && regularActionTypes.length > 0)
    // If specific action types requested and none are backstop, skip backstop query
    const includeBackstop = !actionTypes || (requestedBackstopTypes && requestedBackstopTypes.length > 0)

    // Build queries
    const queries: string[] = []
    const params: (string | number | string[])[] = [userAddress]
    let paramIndex = 2

    // Regular events query
    if (includeRegular) {
      let regularWhere = 'WHERE (user_address = $1 OR filler_address = $1)'

      if (regularActionTypes && regularActionTypes.length > 0) {
        regularWhere += ` AND action_type = ANY($${paramIndex})`
        params.push(regularActionTypes)
        paramIndex++
      }

      if (poolId) {
        regularWhere += ` AND pool_id = $${paramIndex}`
        params.push(poolId)
        paramIndex++
      }

      if (assetAddress) {
        regularWhere += ` AND (asset_address = $${paramIndex} OR lot_asset = $${paramIndex} OR bid_asset = $${paramIndex})`
        params.push(assetAddress)
        paramIndex++
      }

      if (startDate) {
        regularWhere += ` AND ledger_closed_at >= $${paramIndex}::date`
        params.push(startDate)
        paramIndex++
      }

      if (endDate) {
        regularWhere += ` AND ledger_closed_at < ($${paramIndex}::date + interval '1 day')`
        params.push(endDate)
        paramIndex++
      }

      queries.push(`
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
          bid_asset_symbol,
          NULL::numeric AS lp_tokens,
          NULL::numeric AS shares,
          NULL::bigint AS q4w_expiration
        FROM user_action_history
        ${regularWhere}
      `)
    }

    // Backstop events query
    if (includeBackstop) {
      let backstopWhere = 'WHERE b.user_address = $1'

      // Filter by requested backstop action types (converting from prefixed to DB format)
      if (requestedBackstopTypes && requestedBackstopTypes.length > 0) {
        const dbBackstopTypes = requestedBackstopTypes.map(t => t.replace('backstop_', ''))
        backstopWhere += ` AND b.action_type = ANY($${paramIndex})`
        params.push(dbBackstopTypes)
        paramIndex++
      }

      if (poolId) {
        backstopWhere += ` AND b.pool_address = $${paramIndex}`
        params.push(poolId)
        paramIndex++
      }

      if (startDate) {
        backstopWhere += ` AND b.ledger_closed_at >= $${paramIndex}::date`
        params.push(startDate)
        paramIndex++
      }

      if (endDate) {
        backstopWhere += ` AND b.ledger_closed_at < ($${paramIndex}::date + interval '1 day')`
        params.push(endDate)
        paramIndex++
      }

      // For queue_withdrawal and dequeue_withdrawal, we need to calculate LP tokens from shares
      // using the pool's share rate at that point in time.
      // Use the rate from the most recent deposit/withdraw event (more accurate than aggregation).
      // For claim events, get the pool_address from the sibling deposit event in the same transaction.
      // Filter out deposit events that are part of a claim (auto-compound) - they share the same tx hash.
      queries.push(`
        SELECT
          b.id,
          COALESCE(b.pool_address, sibling_deposit.pool_address) AS pool_id,
          p.name AS pool_name,
          p.short_name AS pool_short_name,
          b.transaction_hash,
          b.ledger_sequence,
          to_char(b.ledger_closed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ledger_closed_at,
          CASE b.action_type
            WHEN 'deposit' THEN 'backstop_deposit'
            WHEN 'withdraw' THEN 'backstop_withdraw'
            WHEN 'queue_withdrawal' THEN 'backstop_queue_withdrawal'
            WHEN 'dequeue_withdrawal' THEN 'backstop_dequeue_withdrawal'
            WHEN 'claim' THEN 'backstop_claim'
            ELSE 'backstop_' || b.action_type
          END AS action_type,
          NULL AS asset_address,
          'BLND-USDC LP' AS asset_symbol,
          'Backstop LP Token' AS asset_name,
          7 AS asset_decimals,
          b.user_address,
          NULL AS amount_underlying,
          NULL AS amount_tokens,
          NULL AS implied_rate,
          NULL AS rate_type,
          NULL AS claim_amount,
          NULL AS auction_type,
          NULL AS filler_address,
          NULL AS liquidation_percent,
          NULL AS lot_asset,
          NULL AS lot_amount,
          NULL AS bid_asset,
          NULL AS bid_amount,
          NULL AS lot_asset_symbol,
          NULL AS bid_asset_symbol,
          -- Calculate LP tokens from shares for queue_withdrawal/dequeue_withdrawal
          -- Use rate from the most recent deposit/withdraw event (lp_tokens/shares) for accuracy
          -- This avoids rounding errors that accumulate when aggregating all events
          CASE
            WHEN b.lp_tokens IS NOT NULL THEN b.lp_tokens
            WHEN b.shares IS NOT NULL AND b.action_type IN ('queue_withdrawal', 'dequeue_withdrawal') THEN
              (b.shares::numeric * COALESCE((
                SELECT lp_tokens::numeric / NULLIF(shares::numeric, 0)
                FROM backstop_events be
                WHERE be.pool_address = b.pool_address
                  AND be.action_type IN ('deposit', 'withdraw')
                  AND be.lp_tokens IS NOT NULL
                  AND be.shares IS NOT NULL
                  AND be.shares > 0
                  AND be.ledger_sequence <= b.ledger_sequence
                ORDER BY be.ledger_sequence DESC, be.id DESC
                LIMIT 1
              ), 1))::bigint
            ELSE NULL
          END AS lp_tokens,
          b.shares,
          b.q4w_exp AS q4w_expiration
        FROM backstop_events b
        -- For claim events, get pool_address from the sibling deposit event in the same transaction
        LEFT JOIN LATERAL (
          SELECT pool_address
          FROM backstop_events
          WHERE transaction_hash = b.transaction_hash
            AND action_type = 'deposit'
            AND pool_address IS NOT NULL
            AND pool_address != ''
          LIMIT 1
        ) sibling_deposit ON b.action_type = 'claim' AND (b.pool_address IS NULL OR b.pool_address = '')
        LEFT JOIN pools p ON COALESCE(b.pool_address, sibling_deposit.pool_address) = p.pool_id
        ${backstopWhere}
      `)
    }

    // If no queries, return empty
    if (queries.length === 0) {
      return []
    }

    params.push(limit, offset)

    const fullQuery = `
      ${queries.join(' UNION ALL ')}
      ORDER BY ledger_closed_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `

    const result = await pool.query(fullQuery, params)

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
      asset_icon_url: null, // Icons resolved client-side from ASSET_LOGO_MAP
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
      // Backstop-specific fields
      lp_tokens: row.lp_tokens ? parseFloat(row.lp_tokens) : null,
      shares: row.shares ? parseFloat(row.shares) : null,
      q4w_expiration: row.q4w_expiration ? parseInt(row.q4w_expiration) : null,
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
    days: number = 30,
    timezone: string = 'UTC'
  ): Promise<{ history: UserBalance[]; firstEventDate: string | null }> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    // First, get the earliest event date for this user/asset (including auction events)
    // Convert timestamps to user's timezone before extracting date
    const firstEventResult = await pool.query(
      `
      SELECT MIN((ledger_closed_at AT TIME ZONE 'UTC' AT TIME ZONE $3)::date)::text AS first_event_date
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
      [userAddress, assetAddress, timezone]
    )
    const firstEventDate = firstEventResult.rows[0]?.first_event_date || null

    // Main query: compute daily positions from events and join with daily rates
    const result = await pool.query(
      `
      WITH date_range AS (
        SELECT generate_series(
          GREATEST(
            (CURRENT_TIMESTAMP AT TIME ZONE $4)::date - $3::integer,
            (SELECT MIN((ledger_closed_at AT TIME ZONE 'UTC' AT TIME ZONE $4)::date) FROM parsed_events
             WHERE (user_address = $1 AND asset_address = $2)
                OR (user_address = $1 AND action_type = 'fill_auction' AND (lot_asset = $2 OR bid_asset = $2))
                OR (filler_address = $1 AND action_type = 'fill_auction' AND (lot_asset = $2 OR bid_asset = $2)))
          ),
          (CURRENT_TIMESTAMP AT TIME ZONE $4)::date,
          '1 day'::interval
        )::date AS date
      ),
      -- Get all events for this user/asset ordered by time (including auction events)
      user_events AS (
        -- Regular events (supply, withdraw, borrow, repay, etc.)
        SELECT
          pool_id,
          (ledger_closed_at AT TIME ZONE 'UTC' AT TIME ZONE $4)::date AS event_date,
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
          (ledger_closed_at AT TIME ZONE 'UTC' AT TIME ZONE $4)::date AS event_date,
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
          (ledger_closed_at AT TIME ZONE 'UTC' AT TIME ZONE $4)::date AS event_date,
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
          (ledger_closed_at AT TIME ZONE 'UTC' AT TIME ZONE $4)::date AS event_date,
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
      [userAddress, assetAddress, days, timezone]
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

  // ============================================
  // BACKSTOP FUNCTIONS
  // ============================================

  /**
   * Get backstop pool state at a specific date by aggregating events.
   * This derives the share rate (LP tokens per share) from historical events.
   */
  async getBackstopPoolStateAtDate(
    poolAddress: string,
    targetDate: string
  ): Promise<BackstopPoolState | null> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    const result = await pool.query(
      `
      SELECT
        pool_address,
        SUM(CASE
          WHEN action_type IN ('deposit', 'donate') THEN lp_tokens::numeric
          WHEN action_type = 'gulp_emissions' THEN COALESCE(emissions_shares::numeric, 0)
          WHEN action_type IN ('withdraw', 'draw') THEN -lp_tokens::numeric
          ELSE 0
        END) as total_lp_tokens,
        SUM(CASE
          WHEN action_type = 'deposit' THEN shares::numeric
          WHEN action_type = 'withdraw' THEN -shares::numeric
          ELSE 0
        END) as total_shares
      FROM backstop_events
      WHERE pool_address = $1
        AND ledger_closed_at <= ($2::date + interval '1 day')
      GROUP BY pool_address
      `,
      [poolAddress, targetDate]
    )

    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]
    const totalLpTokens = parseFloat(row.total_lp_tokens) / 1e7 || 0
    const totalShares = parseFloat(row.total_shares) / 1e7 || 0
    const shareRate = totalShares > 0 ? totalLpTokens / totalShares : 0

    return {
      pool_address: row.pool_address,
      total_lp_tokens: totalLpTokens,
      total_shares: totalShares,
      share_rate: shareRate,
      as_of_date: targetDate,
    }
  }

  /**
   * Get backstop user balance history - user's LP token value over time.
   * Computes cumulative shares at each event date and converts to LP tokens using pool rate.
   */
  async getBackstopUserBalanceHistory(
    userAddress: string,
    poolAddress: string,
    days: number = 30
  ): Promise<BackstopUserBalance[]> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    // This query:
    // 1. Gets user's cumulative shares at each date they had activity
    // 2. Gets pool's share rate at each date
    // 3. Calculates LP token value = shares × rate
    const result = await pool.query(
      `
      WITH date_range AS (
        SELECT generate_series(
          GREATEST(
            CURRENT_DATE - $3::integer,
            (SELECT MIN(ledger_closed_at::date) FROM backstop_events
             WHERE user_address = $1 AND pool_address = $2)
          ),
          CURRENT_DATE,
          '1 day'::interval
        )::date AS date
      ),
      -- User's cumulative shares over time
      user_events AS (
        SELECT
          ledger_closed_at::date AS event_date,
          SUM(CASE
            WHEN action_type = 'deposit' THEN shares::numeric
            WHEN action_type = 'withdraw' THEN -shares::numeric
            ELSE 0
          END) AS shares_change
        FROM backstop_events
        WHERE user_address = $1
          AND pool_address = $2
        GROUP BY ledger_closed_at::date
      ),
      user_cumulative AS (
        SELECT
          event_date,
          SUM(shares_change) OVER (ORDER BY event_date) AS cumulative_shares
        FROM user_events
      ),
      -- Pool's total LP tokens and shares over time (for rate calculation)
      pool_events AS (
        SELECT
          ledger_closed_at::date AS event_date,
          SUM(CASE
            WHEN action_type IN ('deposit', 'donate') THEN lp_tokens::numeric
            WHEN action_type = 'gulp_emissions' THEN COALESCE(emissions_shares::numeric, 0)
            WHEN action_type IN ('withdraw', 'draw') THEN -lp_tokens::numeric
            ELSE 0
          END) AS lp_change,
          SUM(CASE
            WHEN action_type = 'deposit' THEN shares::numeric
            WHEN action_type = 'withdraw' THEN -shares::numeric
            ELSE 0
          END) AS shares_change
        FROM backstop_events
        WHERE pool_address = $2
        GROUP BY ledger_closed_at::date
      ),
      pool_cumulative AS (
        SELECT
          event_date,
          SUM(lp_change) OVER (ORDER BY event_date) AS total_lp_tokens,
          SUM(shares_change) OVER (ORDER BY event_date) AS total_shares
        FROM pool_events
      )
      SELECT
        d.date::text,
        COALESCE(uc.cumulative_shares, 0) / 1e7 AS cumulative_shares,
        COALESCE(pc.total_lp_tokens, 0) / 1e7 AS pool_lp_tokens,
        COALESCE(pc.total_shares, 0) / 1e7 AS pool_shares,
        CASE
          WHEN COALESCE(pc.total_shares, 0) > 0
          THEN (COALESCE(uc.cumulative_shares, 0) / 1e7) *
               (COALESCE(pc.total_lp_tokens, 0) / COALESCE(pc.total_shares, 1))
          ELSE 0
        END AS lp_tokens_value
      FROM date_range d
      LEFT JOIN LATERAL (
        SELECT cumulative_shares
        FROM user_cumulative
        WHERE event_date <= d.date
        ORDER BY event_date DESC
        LIMIT 1
      ) uc ON true
      LEFT JOIN LATERAL (
        SELECT total_lp_tokens, total_shares
        FROM pool_cumulative
        WHERE event_date <= d.date
        ORDER BY event_date DESC
        LIMIT 1
      ) pc ON true
      WHERE COALESCE(uc.cumulative_shares, 0) > 0
      ORDER BY d.date DESC
      `,
      [userAddress, poolAddress, days]
    )

    return result.rows.map((row) => ({
      date: row.date,
      cumulative_shares: parseFloat(row.cumulative_shares) || 0,
      lp_tokens_value: parseFloat(row.lp_tokens_value) || 0,
      pool_address: poolAddress,
    }))
  }

  /**
   * Get backstop cost basis for a user - net LP tokens deposited.
   * Cost basis = total deposited LP tokens - total withdrawn LP tokens
   */
  async getBackstopCostBasis(
    userAddress: string,
    poolAddress: string
  ): Promise<BackstopCostBasis | null> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    const result = await pool.query(
      `
      SELECT
        pool_address,
        $1 AS user_address,
        COALESCE(SUM(CASE WHEN action_type = 'deposit' THEN lp_tokens::numeric ELSE 0 END), 0) / 1e7 AS total_deposited_lp,
        COALESCE(SUM(CASE WHEN action_type = 'withdraw' THEN lp_tokens::numeric ELSE 0 END), 0) / 1e7 AS total_withdrawn_lp,
        MIN(CASE WHEN action_type = 'deposit' THEN ledger_closed_at END)::text AS first_deposit_date,
        MAX(ledger_closed_at)::text AS last_activity_date
      FROM backstop_events
      WHERE user_address = $1
        AND pool_address = $2
      GROUP BY pool_address
      `,
      [userAddress, poolAddress]
    )

    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]
    const totalDeposited = parseFloat(row.total_deposited_lp) || 0
    const totalWithdrawn = parseFloat(row.total_withdrawn_lp) || 0

    return {
      pool_address: row.pool_address,
      user_address: row.user_address,
      total_deposited_lp: totalDeposited,
      total_withdrawn_lp: totalWithdrawn,
      cost_basis_lp: totalDeposited - totalWithdrawn,
      first_deposit_date: row.first_deposit_date,
      last_activity_date: row.last_activity_date,
    }
  }

  /**
   * Get backstop yield for a user.
   * Requires current LP token value (from SDK) to compare against cost basis.
   */
  async getBackstopYield(
    userAddress: string,
    poolAddress: string,
    currentLpTokens: number
  ): Promise<BackstopYield | null> {
    const costBasis = await this.getBackstopCostBasis(userAddress, poolAddress)

    if (!costBasis) {
      return null
    }

    const yieldLp = currentLpTokens - costBasis.cost_basis_lp
    const yieldPercent = costBasis.cost_basis_lp > 0
      ? (yieldLp / costBasis.cost_basis_lp) * 100
      : 0

    return {
      pool_address: poolAddress,
      user_address: userAddress,
      cost_basis_lp: costBasis.cost_basis_lp,
      current_lp_tokens: currentLpTokens,
      yield_lp: yieldLp,
      yield_percent: yieldPercent,
    }
  }

  /**
   * Get backstop cost basis for all pools a user has positions in.
   */
  async getAllBackstopCostBases(userAddress: string): Promise<BackstopCostBasis[]> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    // First, check if there are any backstop events for this user
    const countResult = await pool.query(
      `SELECT COUNT(*) as count, array_agg(DISTINCT pool_address) as pools
       FROM backstop_events WHERE user_address = $1`,
      [userAddress]
    )
    console.log('[DB getAllBackstopCostBases] User:', userAddress)
    console.log('[DB getAllBackstopCostBases] Events count:', countResult.rows[0]?.count)
    console.log('[DB getAllBackstopCostBases] Pools with events:', countResult.rows[0]?.pools)

    const result = await pool.query(
      `
      SELECT
        pool_address,
        $1 AS user_address,
        COALESCE(SUM(CASE WHEN action_type = 'deposit' THEN lp_tokens::numeric ELSE 0 END), 0) / 1e7 AS total_deposited_lp,
        COALESCE(SUM(CASE WHEN action_type = 'withdraw' THEN lp_tokens::numeric ELSE 0 END), 0) / 1e7 AS total_withdrawn_lp,
        MIN(CASE WHEN action_type = 'deposit' THEN ledger_closed_at END)::text AS first_deposit_date,
        MAX(ledger_closed_at)::text AS last_activity_date
      FROM backstop_events
      WHERE user_address = $1
      GROUP BY pool_address
      `,
      [userAddress]
    )

    console.log('[DB getAllBackstopCostBases] Query result rows:', result.rows.length)
    console.log('[DB getAllBackstopCostBases] Raw rows:', JSON.stringify(result.rows, null, 2))

    return result.rows.map((row) => {
      const totalDeposited = parseFloat(row.total_deposited_lp) || 0
      const totalWithdrawn = parseFloat(row.total_withdrawn_lp) || 0

      return {
        pool_address: row.pool_address,
        user_address: row.user_address,
        total_deposited_lp: totalDeposited,
        total_withdrawn_lp: totalWithdrawn,
        cost_basis_lp: totalDeposited - totalWithdrawn,
        first_deposit_date: row.first_deposit_date,
        last_activity_date: row.last_activity_date,
      }
    })
  }
  /**
   * Get total claimed emissions (LP tokens) per pool for a user.
   * These are from 'gulp_emissions' events which represent BLND emissions claimed and auto-compounded to LP.
   */
  async getClaimedEmissionsPerPool(userAddress: string): Promise<Array<{
    pool_address: string;
    total_claimed_lp: number;  // Total LP tokens received from claiming emissions
    claim_count: number;       // Number of claim events
    last_claim_date: string | null;
  }>> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    const result = await pool.query(
      `
      SELECT
        pool_address,
        COALESCE(SUM(COALESCE(emissions_shares, lp_tokens)::numeric), 0) / 1e7 AS total_claimed_lp,
        COUNT(*) AS claim_count,
        MAX(ledger_closed_at)::text AS last_claim_date
      FROM backstop_events
      WHERE user_address = $1
        AND action_type = 'gulp_emissions'
      GROUP BY pool_address
      `,
      [userAddress]
    )

    return result.rows.map((row) => ({
      pool_address: row.pool_address,
      total_claimed_lp: parseFloat(row.total_claimed_lp) || 0,
      claim_count: parseInt(row.claim_count, 10) || 0,
      last_claim_date: row.last_claim_date,
    }))
  }

  /**
   * Get total claimed BLND from pool claims for a user.
   * This queries the user_action_history view for 'claim' actions.
   * Note: claim_amount is computed in the view from amount_underlying for claim actions.
   */
  async getClaimedBlndFromPools(userAddress: string): Promise<Array<{
    pool_id: string;
    total_claimed_blnd: number;  // Total BLND claimed from this pool
    claim_count: number;
    last_claim_date: string | null;
  }>> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    const result = await pool.query(
      `
      SELECT
        pool_id,
        COALESCE(SUM(claim_amount::numeric), 0) / 1e7 AS total_claimed_blnd,
        COUNT(*) AS claim_count,
        MAX(ledger_closed_at)::text AS last_claim_date
      FROM user_action_history
      WHERE user_address = $1
        AND action_type = 'claim'
        AND claim_amount IS NOT NULL
        AND claim_amount > 0
      GROUP BY pool_id
      `,
      [userAddress]
    )

    return result.rows.map((row) => ({
      pool_id: row.pool_id,
      total_claimed_blnd: parseFloat(row.total_claimed_blnd) || 0,
      claim_count: parseInt(row.claim_count, 10) || 0,
      last_claim_date: row.last_claim_date,
    }))
  }
}

export const eventsRepository = new EventsRepository()
