import { pool } from './config'
import { UserBalance, UserAction, Pool, Token, DailyRate, BackstopPoolState, BackstopUserBalance, BackstopCostBasis, BackstopYield } from './types'
import { LP_TOKEN_ADDRESS } from '@/lib/constants'

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
    // NOTE: ledger_closed_at is stored as "timestamp without time zone" but contains UTC values.
    // We must use double AT TIME ZONE: first interpret as UTC, then convert to user's timezone.
    // Single AT TIME ZONE would incorrectly interpret the UTC value as already being in the target timezone.
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
      // Clamp to 0 minimum to prevent small negative values from precision mismatches
      // (b_rate at end of day may differ slightly from implied rate at deposit time)
      const total_asset_value = supply_balance + collateral_balance
      const total_yield = Math.max(0, total_asset_value - cost_basis)

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
      SELECT asset_address, symbol, name, decimals, icon_url, coingecko_id, is_native, pegged_currency
      FROM tokens
      ORDER BY symbol
      `
    )

    return result.rows.map((row) => ({
      ...row,
      decimals: parseInt(row.decimals),
      pegged_currency: row.pegged_currency || null,
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
      SELECT asset_address, symbol, name, decimals, icon_url, coingecko_id, is_native, pegged_currency
      FROM tokens
      WHERE asset_address = $1
      `,
      [assetAddress]
    )

    if (result.rows.length === 0) return null

    return {
      ...result.rows[0],
      decimals: parseInt(result.rows[0].decimals),
      pegged_currency: result.rows[0].pegged_currency || null,
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
        -- LP token flow for MAIN pool (excluding emissions):
        -- NOTE: gulp_emissions and claim are EXCLUDED because:
        --   - gulp_emissions only has emissions_shares (BLND units), NOT lp_tokens
        --   - Using emissions_shares inflates pool LP by ~70% (wrong units!)
        --   - claim LP tokens come from emissions pool, not main LP pool
        SUM(CASE
          WHEN action_type IN ('deposit', 'donate') THEN lp_tokens::numeric
          WHEN action_type IN ('withdraw', 'draw') THEN -COALESCE(lp_tokens::numeric, 0)
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
   * Get daily backstop share rates for APY calculation.
   * Returns daily share_rate (LP tokens per share) values which can be used
   * to calculate APY from rate of change, similar to how pool APY uses b_rate.
   */
  async getBackstopDailyRates(
    poolAddress: string,
    days: number = 180
  ): Promise<Array<{ rate_date: string; share_rate: number }>> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    // This query generates daily share rates by:
    // 1. Creating a date range for the requested period
    // 2. Computing cumulative LP tokens and shares up to each date
    // 3. Calculating share_rate = total_lp_tokens / total_shares
    const result = await pool.query(
      `
      WITH date_range AS (
        SELECT generate_series(
          GREATEST(
            CURRENT_DATE - $2::integer,
            (SELECT MIN(ledger_closed_at::date) FROM backstop_events WHERE pool_address = $1)
          ),
          CURRENT_DATE,
          '1 day'::interval
        )::date AS date
      ),
      -- Cumulative pool state by date
      pool_cumulative AS (
        SELECT
          ledger_closed_at::date AS event_date,
          SUM(CASE
            WHEN action_type IN ('deposit', 'donate') THEN lp_tokens::numeric
            WHEN action_type IN ('withdraw', 'draw') THEN -COALESCE(lp_tokens::numeric, 0)
            ELSE 0
          END) OVER (ORDER BY ledger_closed_at::date) / 1e7 as cumulative_lp_tokens,
          SUM(CASE
            WHEN action_type = 'deposit' THEN shares::numeric
            WHEN action_type = 'withdraw' THEN -shares::numeric
            ELSE 0
          END) OVER (ORDER BY ledger_closed_at::date) / 1e7 as cumulative_shares
        FROM backstop_events
        WHERE pool_address = $1
      ),
      -- Get the last state for each date
      daily_state AS (
        SELECT DISTINCT ON (event_date)
          event_date,
          cumulative_lp_tokens,
          cumulative_shares
        FROM pool_cumulative
        ORDER BY event_date DESC, cumulative_lp_tokens DESC
      )
      SELECT
        d.date::text as rate_date,
        COALESCE(
          CASE
            WHEN ds.cumulative_shares > 0 THEN ds.cumulative_lp_tokens / ds.cumulative_shares
            ELSE NULL
          END,
          -- Forward-fill: use most recent rate if no data for this date
          (
            SELECT cumulative_lp_tokens / NULLIF(cumulative_shares, 0)
            FROM daily_state
            WHERE event_date <= d.date
            ORDER BY event_date DESC
            LIMIT 1
          )
        ) as share_rate
      FROM date_range d
      LEFT JOIN daily_state ds ON ds.event_date = d.date
      WHERE d.date <= CURRENT_DATE
      ORDER BY d.date ASC
      `,
      [poolAddress, days]
    )

    return result.rows
      .filter((row) => row.share_rate !== null)
      .map((row) => ({
        rate_date: row.rate_date,
        share_rate: parseFloat(row.share_rate) || 0,
      }))
  }

  /**
   * Get backstop user balance history - user's LP token value over time.
   * Computes cumulative shares at each event date and converts to LP tokens using pool rate.
   */
  async getBackstopUserBalanceHistory(
    userAddress: string,
    poolAddress: string,
    days: number = 30,
    timezone: string = 'UTC'
  ): Promise<BackstopUserBalance[]> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    // This query:
    // 1. Gets user's cumulative shares at each date they had activity
    // 2. Gets pool's share rate at each date
    // 3. Calculates LP token value = shares × rate
    // NOTE: All timestamps are converted to user's timezone before extracting date
    // to ensure consistency with regular balance history data
    const result = await pool.query(
      `
      WITH date_range AS (
        SELECT generate_series(
          GREATEST(
            (CURRENT_TIMESTAMP AT TIME ZONE $4)::date - $3::integer,
            (SELECT MIN((ledger_closed_at AT TIME ZONE $4)::date) FROM backstop_events
             WHERE user_address = $1 AND pool_address = $2)
          ),
          (CURRENT_TIMESTAMP AT TIME ZONE $4)::date,
          '1 day'::interval
        )::date AS date
      ),
      -- User's cumulative shares over time
      user_events AS (
        SELECT
          (ledger_closed_at AT TIME ZONE $4)::date AS event_date,
          SUM(CASE
            WHEN action_type = 'deposit' THEN shares::numeric
            WHEN action_type = 'withdraw' THEN -shares::numeric
            ELSE 0
          END) AS shares_change
        FROM backstop_events
        WHERE user_address = $1
          AND pool_address = $2
        GROUP BY (ledger_closed_at AT TIME ZONE $4)::date
      ),
      user_cumulative AS (
        SELECT
          event_date,
          SUM(shares_change) OVER (ORDER BY event_date) AS cumulative_shares
        FROM user_events
      ),
      -- Pool's total LP tokens and shares over time (for rate calculation)
      -- LP token flow for MAIN pool (excluding emissions):
      --   deposit/donate: LP tokens enter the pool
      --   withdraw/draw: LP tokens leave the pool
      -- NOTE: gulp_emissions and claim are EXCLUDED because:
      --   - gulp_emissions only has emissions_shares (BLND units), NOT lp_tokens
      --   - Using emissions_shares inflates pool LP by ~70% (wrong units!)
      --   - claim LP tokens come from emissions pool, not main LP pool
      --   - SDK calculates user value directly from on-chain state, not shares × rate
      pool_events AS (
        SELECT
          (ledger_closed_at AT TIME ZONE $4)::date AS event_date,
          SUM(CASE
            WHEN action_type IN ('deposit', 'donate') THEN lp_tokens::numeric
            WHEN action_type IN ('withdraw', 'draw') THEN -COALESCE(lp_tokens::numeric, 0)
            ELSE 0
          END) AS lp_change,
          SUM(CASE
            WHEN action_type = 'deposit' THEN shares::numeric
            WHEN action_type = 'withdraw' THEN -shares::numeric
            ELSE 0
          END) AS shares_change
        FROM backstop_events
        WHERE pool_address = $2
        GROUP BY (ledger_closed_at AT TIME ZONE $4)::date
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
      [userAddress, poolAddress, days, timezone]
    )

    return result.rows.map((row) => ({
      date: row.date,
      cumulative_shares: parseFloat(row.cumulative_shares) || 0,
      lp_tokens_value: parseFloat(row.lp_tokens_value) || 0,
      pool_address: poolAddress,
    }))
  }

  /**
   * Get backstop balance history for multiple pools in a single query.
   * This is more efficient than calling getBackstopUserBalanceHistory multiple times.
   */
  async getBackstopUserBalanceHistoryMultiplePools(
    userAddress: string,
    poolAddresses: string[],
    days: number = 30,
    timezone: string = 'UTC'
  ): Promise<BackstopUserBalance[]> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    if (poolAddresses.length === 0) {
      return []
    }

    // This query handles multiple pools by including pool_address in the grouping
    // and computing per-pool share rates
    const result = await pool.query(
      `
      WITH date_range AS (
        SELECT generate_series(
          GREATEST(
            (CURRENT_TIMESTAMP AT TIME ZONE $4)::date - $3::integer,
            (SELECT MIN((ledger_closed_at AT TIME ZONE $4)::date) FROM backstop_events
             WHERE user_address = $1 AND pool_address = ANY($2))
          ),
          (CURRENT_TIMESTAMP AT TIME ZONE $4)::date,
          '1 day'::interval
        )::date AS date
      ),
      -- Get all pools from the input array
      pools AS (
        SELECT unnest($2::text[]) AS pool_address
      ),
      -- User's cumulative shares over time per pool
      user_events AS (
        SELECT
          pool_address,
          (ledger_closed_at AT TIME ZONE $4)::date AS event_date,
          SUM(CASE
            WHEN action_type = 'deposit' THEN shares::numeric
            WHEN action_type = 'withdraw' THEN -shares::numeric
            ELSE 0
          END) AS shares_change
        FROM backstop_events
        WHERE user_address = $1
          AND pool_address = ANY($2)
        GROUP BY pool_address, (ledger_closed_at AT TIME ZONE $4)::date
      ),
      user_cumulative AS (
        SELECT
          pool_address,
          event_date,
          SUM(shares_change) OVER (PARTITION BY pool_address ORDER BY event_date) AS cumulative_shares
        FROM user_events
      ),
      -- Pool's total LP tokens and shares over time per pool
      pool_events AS (
        SELECT
          pool_address,
          (ledger_closed_at AT TIME ZONE $4)::date AS event_date,
          SUM(CASE
            WHEN action_type IN ('deposit', 'donate') THEN lp_tokens::numeric
            WHEN action_type IN ('withdraw', 'draw') THEN -COALESCE(lp_tokens::numeric, 0)
            ELSE 0
          END) AS lp_change,
          SUM(CASE
            WHEN action_type = 'deposit' THEN shares::numeric
            WHEN action_type = 'withdraw' THEN -shares::numeric
            ELSE 0
          END) AS shares_change
        FROM backstop_events
        WHERE pool_address = ANY($2)
        GROUP BY pool_address, (ledger_closed_at AT TIME ZONE $4)::date
      ),
      pool_cumulative AS (
        SELECT
          pool_address,
          event_date,
          SUM(lp_change) OVER (PARTITION BY pool_address ORDER BY event_date) AS total_lp_tokens,
          SUM(shares_change) OVER (PARTITION BY pool_address ORDER BY event_date) AS total_shares
        FROM pool_events
      )
      SELECT
        p.pool_address,
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
      CROSS JOIN pools p
      LEFT JOIN LATERAL (
        SELECT cumulative_shares
        FROM user_cumulative uc_inner
        WHERE uc_inner.pool_address = p.pool_address
          AND uc_inner.event_date <= d.date
        ORDER BY uc_inner.event_date DESC
        LIMIT 1
      ) uc ON true
      LEFT JOIN LATERAL (
        SELECT total_lp_tokens, total_shares
        FROM pool_cumulative pc_inner
        WHERE pc_inner.pool_address = p.pool_address
          AND pc_inner.event_date <= d.date
        ORDER BY pc_inner.event_date DESC
        LIMIT 1
      ) pc ON true
      WHERE COALESCE(uc.cumulative_shares, 0) > 0
      ORDER BY p.pool_address, d.date DESC
      `,
      [userAddress, poolAddresses, days, timezone]
    )

    return result.rows.map((row) => ({
      date: row.date,
      cumulative_shares: parseFloat(row.cumulative_shares) || 0,
      lp_tokens_value: parseFloat(row.lp_tokens_value) || 0,
      pool_address: row.pool_address,
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
   * These are from 'claim' events (most common) and 'gulp_emissions' events.
   * Both represent BLND emissions claimed and auto-compounded to LP tokens.
   *
   * For 'claim' events, the pool_address may be empty - we get it from the sibling 'deposit' event
   * in the same transaction (the deposit is the auto-compound of the claimed LP).
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
      WITH claim_events AS (
        -- Get claim events with pool_address from sibling deposit if needed
        SELECT
          COALESCE(
            NULLIF(b.pool_address, ''),
            (SELECT pool_address FROM backstop_events
             WHERE transaction_hash = b.transaction_hash
               AND action_type = 'deposit'
               AND pool_address IS NOT NULL
               AND pool_address != ''
             LIMIT 1)
          ) AS pool_address,
          COALESCE(b.emissions_shares, b.lp_tokens)::numeric AS claimed_lp,
          b.ledger_closed_at
        FROM backstop_events b
        WHERE b.user_address = $1
          AND b.action_type IN ('claim', 'gulp_emissions')
      )
      SELECT
        pool_address,
        COALESCE(SUM(claimed_lp), 0) / 1e7 AS total_claimed_lp,
        COUNT(*) AS claim_count,
        MAX(ledger_closed_at)::text AS last_claim_date
      FROM claim_events
      WHERE pool_address IS NOT NULL
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

  // ============================================
  // HISTORICAL PRICE FUNCTIONS
  // ============================================

  /**
   * Get deposit and withdrawal events with historical prices for yield calculation.
   * Returns events with prices from daily_token_prices table.
   * Uses forward-fill for missing prices, falls back to provided SDK price.
   *
   * @param startDate - Optional: filter events on or after this date (YYYY-MM-DD)
   * @param endDate - Optional: filter events strictly before this date (YYYY-MM-DD)
   */
  async getDepositEventsWithPrices(
    userAddress: string,
    assetAddress: string,
    poolId?: string,
    sdkPrice: number = 0,
    startDate?: string,
    endDate?: string,
    timezone: string = 'UTC'
  ): Promise<{
    deposits: Array<{
      date: string
      tokens: number
      priceAtDeposit: number
      usdValue: number
      poolId: string
      priceSource: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback'
    }>
    withdrawals: Array<{
      date: string
      tokens: number
      priceAtWithdrawal: number
      usdValue: number
      poolId: string
      priceSource: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback'
    }>
  }> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    // Query all supply/withdraw events with their historical prices
    // Uses LEFT JOIN LATERAL to get the price at or before the event date (forward-fill)
    let whereClause = 'WHERE pe.user_address = $1 AND pe.asset_address = $2'
    const params: (string | number)[] = [userAddress, assetAddress]
    let paramIndex = 3

    if (poolId) {
      whereClause += ` AND pe.pool_id = $${paramIndex}`
      params.push(poolId)
      paramIndex++
    }

    // Add timezone parameter
    const tzParamIndex = paramIndex
    params.push(timezone)
    paramIndex++

    if (startDate) {
      whereClause += ` AND (pe.ledger_closed_at AT TIME ZONE 'UTC' AT TIME ZONE $${tzParamIndex})::date >= $${paramIndex}::date`
      params.push(startDate)
      paramIndex++
    }

    if (endDate) {
      whereClause += ` AND (pe.ledger_closed_at AT TIME ZONE 'UTC' AT TIME ZONE $${tzParamIndex})::date < $${paramIndex}::date`
      params.push(endDate)
      paramIndex++
    }

    const result = await pool.query(
      `
      WITH events AS (
        SELECT
          pe.pool_id,
          pe.action_type,
          (pe.ledger_closed_at AT TIME ZONE 'UTC' AT TIME ZONE $${tzParamIndex})::date::text AS event_date,
          pe.amount_underlying / 1e7 AS tokens
        FROM parsed_events pe
        ${whereClause}
          AND pe.action_type IN ('supply', 'supply_collateral', 'withdraw', 'withdraw_collateral')
        ORDER BY pe.ledger_closed_at
      )
      SELECT
        e.pool_id,
        e.action_type,
        e.event_date,
        e.tokens,
        COALESCE(price_data.usd_price, NULL) AS price,
        price_data.price_date AS price_source_date
      FROM events e
      LEFT JOIN LATERAL (
        SELECT usd_price, price_date::text
        FROM daily_token_prices
        WHERE token_address = $2
          AND price_date <= e.event_date::date
        ORDER BY price_date DESC
        LIMIT 1
      ) price_data ON true
      ORDER BY e.event_date
      `,
      params
    )

    const deposits: Array<{
      date: string
      tokens: number
      priceAtDeposit: number
      usdValue: number
      poolId: string
      priceSource: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback'
    }> = []

    const withdrawals: Array<{
      date: string
      tokens: number
      priceAtWithdrawal: number
      usdValue: number
      poolId: string
      priceSource: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback'
    }> = []

    for (const row of result.rows) {
      const tokens = parseFloat(row.tokens) || 0
      let price = row.price ? parseFloat(row.price) : sdkPrice
      let priceSource: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback'

      if (row.price !== null) {
        // We have a price from DB
        if (row.price_source_date === row.event_date) {
          priceSource = 'daily_token_prices'
        } else {
          priceSource = 'forward_fill'
        }
      } else {
        // No DB price, use SDK fallback
        price = sdkPrice
        priceSource = 'sdk_fallback'
      }

      const usdValue = tokens * price

      if (row.action_type === 'supply' || row.action_type === 'supply_collateral') {
        deposits.push({
          date: row.event_date,
          tokens,
          priceAtDeposit: price,
          usdValue,
          poolId: row.pool_id,
          priceSource,
        })
      } else {
        withdrawals.push({
          date: row.event_date,
          tokens,
          priceAtWithdrawal: price,
          usdValue,
          poolId: row.pool_id,
          priceSource,
        })
      }
    }

    return { deposits, withdrawals }
  }

  /**
   * Get historical prices for a date range (for bar chart).
   * Returns prices for each date in the range.
   */
  async getHistoricalPricesForDateRange(
    tokenAddress: string,
    startDate: string,
    endDate: string,
    sdkPrice: number = 0
  ): Promise<Map<string, { price: number; source: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback' }>> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    // Get all prices up to endDate for forward-fill capability
    const result = await pool.query(
      `
      SELECT
        price_date::text,
        usd_price
      FROM daily_token_prices
      WHERE token_address = $1
        AND price_date <= $2::date
      ORDER BY price_date DESC
      `,
      [tokenAddress, endDate]
    )

    // Build price lookup map
    const dbPrices = new Map<string, number>()
    for (const row of result.rows) {
      dbPrices.set(row.price_date, parseFloat(row.usd_price))
    }

    // Generate all dates in range using string-based iteration
    // This avoids timezone issues with Date object manipulation
    const prices = new Map<string, { price: number; source: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback' }>()

    // Parse start and end dates as components
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number)
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number)
    const endDateObj = new Date(endYear, endMonth - 1, endDay)

    // Iterate through dates using local date arithmetic
    let currentDate = new Date(startYear, startMonth - 1, startDay)
    while (currentDate <= endDateObj) {
      const year = currentDate.getFullYear()
      const month = String(currentDate.getMonth() + 1).padStart(2, '0')
      const day = String(currentDate.getDate()).padStart(2, '0')
      const dateStr = `${year}-${month}-${day}`

      // Check exact match
      if (dbPrices.has(dateStr)) {
        prices.set(dateStr, { price: dbPrices.get(dateStr)!, source: 'daily_token_prices' })
      } else {
        // Forward-fill: find most recent price before this date
        let forwardFillPrice: number | null = null
        for (const [priceDate, price] of dbPrices) {
          if (priceDate <= dateStr) {
            forwardFillPrice = price
            break // dbPrices is ordered DESC, so first match is most recent
          }
        }

        if (forwardFillPrice !== null) {
          prices.set(dateStr, { price: forwardFillPrice, source: 'forward_fill' })
        } else {
          prices.set(dateStr, { price: sdkPrice, source: 'sdk_fallback' })
        }
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1)
    }

    return prices
  }

  /**
   * Get backstop deposit/withdrawal events with historical LP prices.
   */
  async getBackstopEventsWithPrices(
    userAddress: string,
    poolAddress?: string,
    sdkLpPrice: number = 0
  ): Promise<{
    deposits: Array<{
      date: string
      lpTokens: number
      priceAtDeposit: number
      usdValue: number
      poolAddress: string
      priceSource: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback'
    }>
    withdrawals: Array<{
      date: string
      lpTokens: number
      priceAtWithdrawal: number
      usdValue: number
      poolAddress: string
      priceSource: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback'
    }>
  }> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    let whereClause = 'WHERE b.user_address = $1'
    const params: string[] = [userAddress]

    if (poolAddress) {
      whereClause += ' AND b.pool_address = $2'
      params.push(poolAddress)
    }

    const result = await pool.query(
      `
      WITH events AS (
        SELECT
          b.pool_address,
          b.action_type,
          (b.ledger_closed_at AT TIME ZONE 'UTC')::date::text AS event_date,
          b.lp_tokens::numeric / 1e7 AS lp_tokens
        FROM backstop_events b
        ${whereClause}
          AND b.action_type IN ('deposit', 'withdraw')
          AND b.lp_tokens IS NOT NULL
        ORDER BY b.ledger_closed_at
      )
      SELECT
        e.pool_address,
        e.action_type,
        e.event_date,
        e.lp_tokens,
        COALESCE(price_data.usd_price, NULL) AS price,
        price_data.price_date AS price_source_date
      FROM events e
      LEFT JOIN LATERAL (
        SELECT usd_price, price_date::text
        FROM daily_token_prices
        WHERE token_address = '${LP_TOKEN_ADDRESS}'
          AND price_date <= e.event_date::date
        ORDER BY price_date DESC
        LIMIT 1
      ) price_data ON true
      ORDER BY e.event_date
      `,
      params
    )

    const deposits: Array<{
      date: string
      lpTokens: number
      priceAtDeposit: number
      usdValue: number
      poolAddress: string
      priceSource: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback'
    }> = []

    const withdrawals: Array<{
      date: string
      lpTokens: number
      priceAtWithdrawal: number
      usdValue: number
      poolAddress: string
      priceSource: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback'
    }> = []

    for (const row of result.rows) {
      const lpTokens = parseFloat(row.lp_tokens) || 0
      let price = row.price ? parseFloat(row.price) : sdkLpPrice
      let priceSource: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback'

      if (row.price !== null) {
        if (row.price_source_date === row.event_date) {
          priceSource = 'daily_token_prices'
        } else {
          priceSource = 'forward_fill'
        }
      } else {
        price = sdkLpPrice
        priceSource = 'sdk_fallback'
      }

      const usdValue = lpTokens * price

      if (row.action_type === 'deposit') {
        deposits.push({
          date: row.event_date,
          lpTokens,
          priceAtDeposit: price,
          usdValue,
          poolAddress: row.pool_address,
          priceSource,
        })
      } else {
        withdrawals.push({
          date: row.event_date,
          lpTokens,
          priceAtWithdrawal: price,
          usdValue,
          poolAddress: row.pool_address,
          priceSource,
        })
      }
    }

    return { deposits, withdrawals }
  }

  /**
   * Get BLND claim events with historical BLND prices.
   */
  async getBlndClaimsWithPrices(
    userAddress: string,
    sdkBlndPrice: number = 0
  ): Promise<Array<{
    date: string
    blndAmount: number
    priceAtClaim: number
    usdValueAtClaim: number
    poolId: string
    priceSource: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback'
  }>> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    // BLND token address
    const BLND_TOKEN_ADDRESS = 'CD25MNVTZDL4Y3XBCPCJXGXATV5WUHHOWMYFF4YBEGU5FCPGMYTVG5JY'

    const result = await pool.query(
      `
      WITH claims AS (
        SELECT
          pool_id,
          (ledger_closed_at AT TIME ZONE 'UTC')::date::text AS claim_date,
          claim_amount::numeric / 1e7 AS blnd_amount
        FROM user_action_history
        WHERE user_address = $1
          AND action_type = 'claim'
          AND claim_amount IS NOT NULL
          AND claim_amount > 0
        ORDER BY ledger_closed_at
      )
      SELECT
        c.pool_id,
        c.claim_date,
        c.blnd_amount,
        COALESCE(price_data.usd_price, NULL) AS price,
        price_data.price_date AS price_source_date
      FROM claims c
      LEFT JOIN LATERAL (
        SELECT usd_price, price_date::text
        FROM daily_token_prices
        WHERE token_address = '${BLND_TOKEN_ADDRESS}'
          AND price_date <= c.claim_date::date
        ORDER BY price_date DESC
        LIMIT 1
      ) price_data ON true
      ORDER BY c.claim_date
      `,
      [userAddress]
    )

    return result.rows.map((row) => {
      const blndAmount = parseFloat(row.blnd_amount) || 0
      let price = row.price ? parseFloat(row.price) : sdkBlndPrice
      let priceSource: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback'

      if (row.price !== null) {
        if (row.price_source_date === row.claim_date) {
          priceSource = 'daily_token_prices'
        } else {
          priceSource = 'forward_fill'
        }
      } else {
        price = sdkBlndPrice
        priceSource = 'sdk_fallback'
      }

      return {
        date: row.claim_date,
        blndAmount,
        priceAtClaim: price,
        usdValueAtClaim: blndAmount * price,
        poolId: row.pool_id,
        priceSource,
      }
    })
  }

  /**
   * Get historical prices for multiple token/date combinations in a single query.
   * Returns a Map of tokenAddress -> Map of date -> { price, source }
   * Uses forward-fill (most recent price on or before each date).
   */
  async getHistoricalPricesForMultipleTokensAndDates(
    requests: Array<{ tokenAddress: string; targetDate: string }>,
    sdkPrices: Map<string, number>
  ): Promise<Map<string, Map<string, { price: number; source: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback' }>>> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    const result = new Map<string, Map<string, { price: number; source: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback' }>>()

    if (requests.length === 0) {
      return result
    }

    // Group requests by token address
    const requestsByToken = new Map<string, string[]>()
    for (const req of requests) {
      if (!requestsByToken.has(req.tokenAddress)) {
        requestsByToken.set(req.tokenAddress, [])
      }
      requestsByToken.get(req.tokenAddress)!.push(req.targetDate)
    }

    // Get unique token addresses and all unique dates
    const tokenAddresses = Array.from(requestsByToken.keys())
    const allDates = [...new Set(requests.map(r => r.targetDate))].sort()

    // Fetch all relevant prices in a single query using LATERAL join for forward-fill
    const queryResult = await pool.query(
      `
      WITH tokens AS (
        SELECT unnest($1::text[]) AS token_address
      ),
      dates AS (
        SELECT unnest($2::text[])::date AS target_date
      ),
      token_date_pairs AS (
        SELECT t.token_address, d.target_date
        FROM tokens t
        CROSS JOIN dates d
      )
      SELECT
        td.token_address,
        td.target_date::text,
        p.usd_price,
        p.price_date::text AS actual_price_date
      FROM token_date_pairs td
      LEFT JOIN LATERAL (
        SELECT usd_price, price_date
        FROM daily_token_prices
        WHERE token_address = td.token_address
          AND price_date <= td.target_date
        ORDER BY price_date DESC
        LIMIT 1
      ) p ON true
      `,
      [tokenAddresses, allDates]
    )

    // Process results
    for (const row of queryResult.rows) {
      const tokenAddress = row.token_address
      const targetDate = row.target_date

      if (!result.has(tokenAddress)) {
        result.set(tokenAddress, new Map())
      }

      const tokenPrices = result.get(tokenAddress)!

      if (row.usd_price !== null) {
        const price = parseFloat(row.usd_price)
        const source = row.actual_price_date === targetDate ? 'daily_token_prices' : 'forward_fill'
        tokenPrices.set(targetDate, { price, source })
      } else {
        // Fallback to SDK price
        const sdkPrice = sdkPrices.get(tokenAddress) || 0
        tokenPrices.set(targetDate, { price: sdkPrice, source: 'sdk_fallback' })
      }
    }

    return result
  }

  /**
   * Get historical price for a token at a specific date.
   * Uses forward-fill (most recent price on or before the date).
   */
  async getHistoricalPriceAtDate(
    tokenAddress: string,
    targetDate: string,
    sdkPrice: number = 0
  ): Promise<{ price: number; source: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback' }> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    const result = await pool.query(
      `
      SELECT usd_price, price_date::text
      FROM daily_token_prices
      WHERE token_address = $1
        AND price_date <= $2::date
      ORDER BY price_date DESC
      LIMIT 1
      `,
      [tokenAddress, targetDate]
    )

    if (result.rows.length === 0) {
      return { price: sdkPrice, source: 'sdk_fallback' }
    }

    const row = result.rows[0]
    const price = parseFloat(row.usd_price)
    const source = row.price_date === targetDate ? 'daily_token_prices' : 'forward_fill'

    return { price, source }
  }

  // ============================================
  // REALIZED YIELD FUNCTIONS
  // ============================================

  /**
   * Get realized yield data for a user.
   * Realized yield = Total withdrawn (at historical prices) - Total deposited (at historical prices)
   *
   * This calculates actual profits that have left the protocol, not paper gains.
   */
  async getRealizedYieldData(
    userAddress: string,
    sdkPrices: Map<string, number> = new Map()
  ): Promise<{
    // Summary
    totalDepositedUsd: number
    totalWithdrawnUsd: number
    realizedPnl: number

    // Breakdown by source
    pools: {
      deposited: number
      withdrawn: number
      realized: number
    }
    backstop: {
      deposited: number
      withdrawn: number
      realized: number
    }
    emissions: {
      blndClaimed: number
      lpClaimed: number
      usdValue: number
    }

    // Metadata
    firstActivityDate: string | null
    lastActivityDate: string | null

    // Transaction list for detailed view
    transactions: Array<{
      date: string
      type: 'deposit' | 'withdraw' | 'claim'
      source: 'pool' | 'backstop'
      asset: string
      assetAddress: string | null
      amount: number
      priceUsd: number
      valueUsd: number
      txHash: string
      poolId: string
      poolName: string | null
    }>
  }> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    const LP_TOKEN_ADDRESS = 'CDMHROXQ75GEMEJ4LJCT4TUFKY7PH5Z7V5RCVS4KKGU2CQLQRN35DKFT'
    const BLND_TOKEN_ADDRESS = 'CD25MNVTZDL4Y3XBCPCJXGXATV5WUHHOWMYFF4YBEGU5FCPGMYTVG5JY'

    // Get pool deposits/withdrawals with historical prices
    const poolEventsResult = await pool.query(
      `
      WITH events AS (
        SELECT
          pe.pool_id,
          p.name AS pool_name,
          pe.transaction_hash,
          pe.action_type,
          (pe.ledger_closed_at AT TIME ZONE 'UTC')::date::text AS event_date,
          pe.ledger_closed_at,
          pe.asset_address,
          t.symbol AS asset_symbol,
          pe.amount_underlying / 1e7 AS tokens
        FROM parsed_events pe
        LEFT JOIN pools p ON pe.pool_id = p.pool_id
        LEFT JOIN tokens t ON pe.asset_address = t.asset_address
        WHERE pe.user_address = $1
          AND pe.action_type IN ('supply', 'supply_collateral', 'withdraw', 'withdraw_collateral')
        ORDER BY pe.ledger_closed_at
      )
      SELECT
        e.pool_id,
        e.pool_name,
        e.transaction_hash,
        e.action_type,
        e.event_date,
        e.ledger_closed_at,
        e.asset_address,
        e.asset_symbol,
        e.tokens,
        COALESCE(price_data.usd_price, NULL) AS price,
        price_data.price_date AS price_source_date
      FROM events e
      LEFT JOIN LATERAL (
        SELECT usd_price, price_date::text
        FROM daily_token_prices
        WHERE token_address = e.asset_address
          AND price_date <= e.event_date::date
        ORDER BY price_date DESC
        LIMIT 1
      ) price_data ON true
      ORDER BY e.ledger_closed_at
      `,
      [userAddress]
    )

    // Get backstop deposits/withdrawals with historical LP prices
    const backstopEventsResult = await pool.query(
      `
      WITH events AS (
        SELECT
          b.pool_address,
          p.name AS pool_name,
          b.transaction_hash,
          b.action_type,
          (b.ledger_closed_at AT TIME ZONE 'UTC')::date::text AS event_date,
          b.ledger_closed_at,
          b.lp_tokens::numeric / 1e7 AS lp_tokens
        FROM backstop_events b
        LEFT JOIN pools p ON b.pool_address = p.pool_id
        WHERE b.user_address = $1
          AND b.action_type IN ('deposit', 'withdraw')
          AND b.lp_tokens IS NOT NULL
        ORDER BY b.ledger_closed_at
      )
      SELECT
        e.pool_address,
        e.pool_name,
        e.transaction_hash,
        e.action_type,
        e.event_date,
        e.ledger_closed_at,
        e.lp_tokens,
        COALESCE(price_data.usd_price, NULL) AS price,
        price_data.price_date AS price_source_date
      FROM events e
      LEFT JOIN LATERAL (
        SELECT usd_price, price_date::text
        FROM daily_token_prices
        WHERE token_address = $2
          AND price_date <= e.event_date::date
        ORDER BY price_date DESC
        LIMIT 1
      ) price_data ON true
      ORDER BY e.ledger_closed_at
      `,
      [userAddress, LP_TOKEN_ADDRESS]
    )

    // Get BLND claims from pools with historical prices
    // Note: claim amount is stored in amount_underlying for claim actions (not claim_amount, which is a computed column in the view)
    const blndClaimsResult = await pool.query(
      `
      WITH claims AS (
        SELECT
          pe.pool_id,
          p.name AS pool_name,
          pe.transaction_hash,
          (pe.ledger_closed_at AT TIME ZONE 'UTC')::date::text AS claim_date,
          pe.ledger_closed_at,
          pe.amount_underlying::numeric / 1e7 AS blnd_amount
        FROM parsed_events pe
        LEFT JOIN pools p ON pe.pool_id = p.pool_id
        WHERE pe.user_address = $1
          AND pe.action_type = 'claim'
          AND pe.amount_underlying IS NOT NULL
          AND pe.amount_underlying > 0
        ORDER BY pe.ledger_closed_at
      )
      SELECT
        c.pool_id,
        c.pool_name,
        c.transaction_hash,
        c.claim_date,
        c.ledger_closed_at,
        c.blnd_amount,
        COALESCE(price_data.usd_price, NULL) AS price,
        price_data.price_date AS price_source_date
      FROM claims c
      LEFT JOIN LATERAL (
        SELECT usd_price, price_date::text
        FROM daily_token_prices
        WHERE token_address = $2
          AND price_date <= c.claim_date::date
        ORDER BY price_date DESC
        LIMIT 1
      ) price_data ON true
      ORDER BY c.ledger_closed_at
      `,
      [userAddress, BLND_TOKEN_ADDRESS]
    )

    // Get backstop LP claims (emissions auto-compounded)
    const backstopClaimsResult = await pool.query(
      `
      WITH claim_events AS (
        SELECT
          COALESCE(
            NULLIF(b.pool_address, ''),
            (SELECT pool_address FROM backstop_events
             WHERE transaction_hash = b.transaction_hash
               AND action_type = 'deposit'
               AND pool_address IS NOT NULL
               AND pool_address != ''
             LIMIT 1)
          ) AS pool_address,
          b.transaction_hash,
          (b.ledger_closed_at AT TIME ZONE 'UTC')::date::text AS claim_date,
          b.ledger_closed_at,
          COALESCE(b.lp_tokens, b.emissions_shares)::numeric / 1e7 AS lp_tokens
        FROM backstop_events b
        WHERE b.user_address = $1
          AND b.action_type = 'claim'
      )
      SELECT
        c.pool_address,
        p.name AS pool_name,
        c.transaction_hash,
        c.claim_date,
        c.ledger_closed_at,
        c.lp_tokens,
        COALESCE(price_data.usd_price, NULL) AS price,
        price_data.price_date AS price_source_date
      FROM claim_events c
      LEFT JOIN pools p ON c.pool_address = p.pool_id
      LEFT JOIN LATERAL (
        SELECT usd_price, price_date::text
        FROM daily_token_prices
        WHERE token_address = $2
          AND price_date <= c.claim_date::date
        ORDER BY price_date DESC
        LIMIT 1
      ) price_data ON true
      WHERE c.pool_address IS NOT NULL
      ORDER BY c.ledger_closed_at
      `,
      [userAddress, LP_TOKEN_ADDRESS]
    )

    // Process pool events
    let poolDeposited = 0
    let poolWithdrawn = 0
    const transactions: Array<{
      date: string
      type: 'deposit' | 'withdraw' | 'claim'
      source: 'pool' | 'backstop'
      asset: string
      assetAddress: string | null
      amount: number
      priceUsd: number
      valueUsd: number
      txHash: string
      poolId: string
      poolName: string | null
    }> = []

    for (const row of poolEventsResult.rows) {
      const tokens = parseFloat(row.tokens) || 0
      const price = row.price ? parseFloat(row.price) : (sdkPrices.get(row.asset_address) || 0)
      const usdValue = tokens * price
      const isDeposit = row.action_type === 'supply' || row.action_type === 'supply_collateral'

      if (isDeposit) {
        poolDeposited += usdValue
      } else {
        poolWithdrawn += usdValue
      }

      transactions.push({
        date: row.event_date,
        type: isDeposit ? 'deposit' : 'withdraw',
        source: 'pool',
        asset: row.asset_symbol || 'Unknown',
        assetAddress: row.asset_address,
        amount: tokens,
        priceUsd: price,
        valueUsd: usdValue,
        txHash: row.transaction_hash,
        poolId: row.pool_id,
        poolName: row.pool_name,
      })
    }

    // Process backstop events
    let backstopDeposited = 0
    let backstopWithdrawn = 0
    const sdkLpPrice = sdkPrices.get(LP_TOKEN_ADDRESS) || 0

    for (const row of backstopEventsResult.rows) {
      const lpTokens = parseFloat(row.lp_tokens) || 0
      const price = row.price ? parseFloat(row.price) : sdkLpPrice
      const usdValue = lpTokens * price

      if (row.action_type === 'deposit') {
        backstopDeposited += usdValue
      } else {
        backstopWithdrawn += usdValue
      }

      transactions.push({
        date: row.event_date,
        type: row.action_type === 'deposit' ? 'deposit' : 'withdraw',
        source: 'backstop',
        asset: 'BLND-USDC LP',
        assetAddress: LP_TOKEN_ADDRESS,
        amount: lpTokens,
        priceUsd: price,
        valueUsd: usdValue,
        txHash: row.transaction_hash,
        poolId: row.pool_address,
        poolName: row.pool_name,
      })
    }

    // Process BLND claims (count as withdrawals/yield received)
    let blndClaimed = 0
    let blndClaimsUsd = 0
    const sdkBlndPrice = sdkPrices.get(BLND_TOKEN_ADDRESS) || 0

    for (const row of blndClaimsResult.rows) {
      const blndAmount = parseFloat(row.blnd_amount) || 0
      const price = row.price ? parseFloat(row.price) : sdkBlndPrice
      const usdValue = blndAmount * price

      blndClaimed += blndAmount
      blndClaimsUsd += usdValue

      transactions.push({
        date: row.claim_date,
        type: 'claim',
        source: 'pool',
        asset: 'BLND',
        assetAddress: BLND_TOKEN_ADDRESS,
        amount: blndAmount,
        priceUsd: price,
        valueUsd: usdValue,
        txHash: row.transaction_hash,
        poolId: row.pool_id,
        poolName: row.pool_name,
      })
    }

    // Process backstop LP claims
    let lpClaimed = 0
    let lpClaimsUsd = 0

    for (const row of backstopClaimsResult.rows) {
      const lpTokens = parseFloat(row.lp_tokens) || 0
      const price = row.price ? parseFloat(row.price) : sdkLpPrice
      const usdValue = lpTokens * price

      lpClaimed += lpTokens
      lpClaimsUsd += usdValue

      transactions.push({
        date: row.claim_date,
        type: 'claim',
        source: 'backstop',
        asset: 'BLND-USDC LP',
        assetAddress: LP_TOKEN_ADDRESS,
        amount: lpTokens,
        priceUsd: price,
        valueUsd: usdValue,
        txHash: row.transaction_hash,
        poolId: row.pool_address,
        poolName: row.pool_name,
      })
    }

    // Sort transactions by date
    transactions.sort((a, b) => a.date.localeCompare(b.date))

    // Calculate totals
    // For realized P&L: withdrawals + claims - deposits
    const totalDepositedUsd = poolDeposited + backstopDeposited
    const totalWithdrawnUsd = poolWithdrawn + backstopWithdrawn + blndClaimsUsd + lpClaimsUsd
    const realizedPnl = totalWithdrawnUsd - totalDepositedUsd

    // Get first and last activity dates
    const allDates = transactions.map(t => t.date).filter(Boolean)
    const firstActivityDate = allDates.length > 0 ? allDates[0] : null
    const lastActivityDate = allDates.length > 0 ? allDates[allDates.length - 1] : null

    return {
      totalDepositedUsd,
      totalWithdrawnUsd,
      realizedPnl,
      pools: {
        deposited: poolDeposited,
        withdrawn: poolWithdrawn,
        realized: poolWithdrawn - poolDeposited,
      },
      backstop: {
        deposited: backstopDeposited,
        withdrawn: backstopWithdrawn,
        realized: backstopWithdrawn - backstopDeposited,
      },
      emissions: {
        blndClaimed,
        lpClaimed,
        usdValue: blndClaimsUsd + lpClaimsUsd,
      },
      firstActivityDate,
      lastActivityDate,
      transactions,
    }
  }

  /**
   * Batch version of getDepositEventsWithPrices - fetches events for multiple pool-asset pairs in a single query
   * This eliminates the N+1 query pattern when calculating cost basis for multiple positions
   */
  async getDepositEventsWithPricesBatch(
    userAddress: string,
    poolAssetPairs: Array<{ poolId: string; assetAddress: string }>,
    sdkPrices: Record<string, number> = {},
    timezone: string = 'UTC'
  ): Promise<Map<string, {
    deposits: Array<{
      date: string
      tokens: number
      priceAtDeposit: number
      usdValue: number
      poolId: string
      priceSource: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback'
    }>
    withdrawals: Array<{
      date: string
      tokens: number
      priceAtWithdrawal: number
      usdValue: number
      poolId: string
      priceSource: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback'
    }>
  }>> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    if (poolAssetPairs.length === 0) {
      return new Map()
    }

    // Get unique asset addresses for the price lookup
    const uniqueAssets = [...new Set(poolAssetPairs.map(p => p.assetAddress))]

    // Build WHERE clause for all pool-asset combinations
    // Using (pool_id, asset_address) IN (VALUES ...) for efficient filtering
    const pairValues = poolAssetPairs
      .map((_, i) => `($${3 + i * 2}, $${4 + i * 2})`)
      .join(', ')

    const params: (string | number)[] = [userAddress, timezone]
    poolAssetPairs.forEach(pair => {
      params.push(pair.poolId, pair.assetAddress)
    })

    const result = await pool.query(
      `
      WITH events AS (
        SELECT
          pe.pool_id,
          pe.asset_address,
          pe.action_type,
          (pe.ledger_closed_at AT TIME ZONE 'UTC' AT TIME ZONE $2)::date::text AS event_date,
          pe.amount_underlying / 1e7 AS tokens
        FROM parsed_events pe
        WHERE pe.user_address = $1
          AND pe.action_type IN ('supply', 'supply_collateral', 'withdraw', 'withdraw_collateral')
          AND (pe.pool_id, pe.asset_address) IN (VALUES ${pairValues})
        ORDER BY pe.ledger_closed_at
      )
      SELECT
        e.pool_id,
        e.asset_address,
        e.action_type,
        e.event_date,
        e.tokens,
        COALESCE(price_data.usd_price, NULL) AS price,
        price_data.price_date AS price_source_date
      FROM events e
      LEFT JOIN LATERAL (
        SELECT usd_price, price_date::text
        FROM daily_token_prices
        WHERE token_address = e.asset_address
          AND price_date <= e.event_date::date
        ORDER BY price_date DESC
        LIMIT 1
      ) price_data ON true
      ORDER BY e.pool_id, e.asset_address, e.event_date
      `,
      params
    )

    // Build result map keyed by compositeKey (poolId-assetAddress)
    const resultMap = new Map<string, {
      deposits: Array<{
        date: string
        tokens: number
        priceAtDeposit: number
        usdValue: number
        poolId: string
        priceSource: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback'
      }>
      withdrawals: Array<{
        date: string
        tokens: number
        priceAtWithdrawal: number
        usdValue: number
        poolId: string
        priceSource: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback'
      }>
    }>()

    // Initialize empty arrays for all pairs
    for (const pair of poolAssetPairs) {
      const compositeKey = `${pair.poolId}-${pair.assetAddress}`
      resultMap.set(compositeKey, { deposits: [], withdrawals: [] })
    }

    // Process all rows
    for (const row of result.rows) {
      const compositeKey = `${row.pool_id}-${row.asset_address}`
      const entry = resultMap.get(compositeKey)
      if (!entry) continue

      const tokens = parseFloat(row.tokens) || 0
      const sdkPrice = sdkPrices[row.asset_address] || 0
      let price = row.price ? parseFloat(row.price) : sdkPrice
      let priceSource: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback'

      if (row.price !== null) {
        if (row.price_source_date === row.event_date) {
          priceSource = 'daily_token_prices'
        } else {
          priceSource = 'forward_fill'
        }
      } else {
        price = sdkPrice
        priceSource = 'sdk_fallback'
      }

      const usdValue = tokens * price

      if (row.action_type === 'supply' || row.action_type === 'supply_collateral') {
        entry.deposits.push({
          date: row.event_date,
          tokens,
          priceAtDeposit: price,
          usdValue,
          poolId: row.pool_id,
          priceSource,
        })
      } else {
        entry.withdrawals.push({
          date: row.event_date,
          tokens,
          priceAtWithdrawal: price,
          usdValue,
          poolId: row.pool_id,
          priceSource,
        })
      }
    }

    return resultMap
  }
}

export const eventsRepository = new EventsRepository()
