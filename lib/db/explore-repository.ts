import { pool } from './config'
import { ActionType } from './types'
import {
  AccountDepositResult,
  AccountEventCountResult,
  AccountBalanceResult,
  TopDepositorResult,
  AggregateMetrics,
  TokenVolumeResult,
} from '@/types/explore'

// Mock prices for USD conversion (same as pricing service)
const MOCK_PRICES: Record<string, number> = {
  USDC: 1,
  XLM: 0.12,
  AQUA: 0.004,
  BLND: 0.25,
}

export class ExploreRepository {
  /**
   * Get accounts by minimum deposit amount
   */
  async getAccountsByMinDeposit(params: {
    assetAddress: string
    minAmount: number
    inUsd: boolean
    limit: number
    offset: number
    orderDir?: 'asc' | 'desc'
  }): Promise<{ results: AccountDepositResult[]; totalCount: number }> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    const { assetAddress, minAmount, inUsd, limit, offset, orderDir = 'desc' } = params

    // Get the token symbol for price lookup
    const tokenResult = await pool.query(
      'SELECT symbol FROM tokens WHERE asset_address = $1',
      [assetAddress]
    )
    const symbol = tokenResult.rows[0]?.symbol || ''
    const price = MOCK_PRICES[symbol.toUpperCase()] || 0

    // Calculate the minimum amount in the appropriate unit
    const minAmountNative = inUsd && price > 0 ? minAmount / price : minAmount

    const orderDirection = orderDir === 'asc' ? 'ASC' : 'DESC'

    // Count query
    const countResult = await pool.query(
      `
      SELECT COUNT(*) as total FROM (
        SELECT user_address
        FROM user_action_history
        WHERE asset_address = $1
          AND action_type IN ('supply', 'supply_collateral')
        GROUP BY user_address
        HAVING SUM(amount_underlying) / 1e7 >= $2
      ) sub
      `,
      [assetAddress, minAmountNative]
    )
    const totalCount = parseInt(countResult.rows[0]?.total || '0', 10)

    // Main query
    const result = await pool.query(
      `
      SELECT
        user_address,
        SUM(amount_underlying) / 1e7 as total_deposited,
        COUNT(*) as deposit_count,
        MAX(ledger_closed_at)::text as last_deposit_date
      FROM user_action_history
      WHERE asset_address = $1
        AND action_type IN ('supply', 'supply_collateral')
      GROUP BY user_address
      HAVING SUM(amount_underlying) / 1e7 >= $2
      ORDER BY total_deposited ${orderDirection}
      LIMIT $3 OFFSET $4
      `,
      [assetAddress, minAmountNative, limit, offset]
    )

    const results: AccountDepositResult[] = result.rows.map((row) => {
      const totalDeposited = parseFloat(row.total_deposited) || 0
      return {
        userAddress: row.user_address,
        totalDeposited,
        totalDepositedUsd: totalDeposited * price,
        depositCount: parseInt(row.deposit_count, 10),
        lastDepositDate: row.last_deposit_date,
        assetSymbol: symbol,
      }
    })

    return { results, totalCount }
  }

  /**
   * Get accounts by event count
   */
  async getAccountsByEventCount(params: {
    assetAddress?: string
    eventTypes: ActionType[]
    minCount: number
    limit: number
    offset: number
    orderDir?: 'asc' | 'desc'
  }): Promise<{ results: AccountEventCountResult[]; totalCount: number }> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    const { assetAddress, eventTypes, minCount, limit, offset, orderDir = 'desc' } = params
    const orderDirection = orderDir === 'asc' ? 'ASC' : 'DESC'

    // Build WHERE clause
    let whereClause = 'WHERE action_type = ANY($1)'
    const countParams: (string | string[] | number)[] = [eventTypes]
    const queryParams: (string | string[] | number)[] = [eventTypes]
    let paramIndex = 2

    if (assetAddress) {
      whereClause += ` AND asset_address = $${paramIndex}`
      countParams.push(assetAddress)
      queryParams.push(assetAddress)
      paramIndex++
    }

    // Count query
    const countResult = await pool.query(
      `
      SELECT COUNT(*) as total FROM (
        SELECT user_address
        FROM user_action_history
        ${whereClause}
        GROUP BY user_address
        HAVING COUNT(*) >= $${paramIndex}
      ) sub
      `,
      [...countParams, minCount]
    )
    const totalCount = parseInt(countResult.rows[0]?.total || '0', 10)

    // Main query
    queryParams.push(minCount, limit, offset)
    const result = await pool.query(
      `
      SELECT
        user_address,
        COUNT(*) as event_count,
        jsonb_object_agg(action_type, type_count) as events_by_type,
        MIN(ledger_closed_at)::text as first_event_date,
        MAX(ledger_closed_at)::text as last_event_date
      FROM (
        SELECT
          user_address,
          action_type,
          ledger_closed_at,
          COUNT(*) OVER (PARTITION BY user_address, action_type) as type_count
        FROM user_action_history
        ${whereClause}
      ) sub
      GROUP BY user_address
      HAVING COUNT(*) >= $${paramIndex}
      ORDER BY event_count ${orderDirection}
      LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}
      `,
      queryParams
    )

    const results: AccountEventCountResult[] = result.rows.map((row) => ({
      userAddress: row.user_address,
      eventCount: parseInt(row.event_count, 10),
      eventsByType: row.events_by_type || {},
      firstEventDate: row.first_event_date,
      lastEventDate: row.last_event_date,
    }))

    return { results, totalCount }
  }

  /**
   * Get accounts by current balance
   */
  async getAccountsByBalance(params: {
    assetAddress: string
    minBalance: number
    inUsd: boolean
    limit: number
    offset: number
    orderDir?: 'asc' | 'desc'
  }): Promise<{ results: AccountBalanceResult[]; totalCount: number }> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    const { assetAddress, minBalance, inUsd, limit, offset, orderDir = 'desc' } = params

    // Get the token symbol for price lookup
    const tokenResult = await pool.query(
      'SELECT symbol FROM tokens WHERE asset_address = $1',
      [assetAddress]
    )
    const symbol = tokenResult.rows[0]?.symbol || ''
    const price = MOCK_PRICES[symbol.toUpperCase()] || 0

    // Calculate the minimum balance in the appropriate unit
    const minBalanceNative = inUsd && price > 0 ? minBalance / price : minBalance
    const orderDirection = orderDir === 'asc' ? 'ASC' : 'DESC'

    // Complex query to compute current positions from events
    const balanceQuery = `
      WITH current_positions AS (
        SELECT
          user_address,
          pool_id,
          SUM(CASE WHEN action_type = 'supply' THEN amount_tokens ELSE 0 END) -
          SUM(CASE WHEN action_type = 'withdraw' THEN amount_tokens ELSE 0 END) as supply_btokens,
          SUM(CASE WHEN action_type = 'supply_collateral' THEN amount_tokens ELSE 0 END) -
          SUM(CASE WHEN action_type = 'withdraw_collateral' THEN amount_tokens ELSE 0 END) as collateral_btokens,
          SUM(CASE WHEN action_type = 'borrow' THEN amount_tokens ELSE 0 END) -
          SUM(CASE WHEN action_type = 'repay' THEN amount_tokens ELSE 0 END) as debt_dtokens
        FROM user_action_history
        WHERE asset_address = $1
        GROUP BY user_address, pool_id
      ),
      latest_rates AS (
        SELECT DISTINCT ON (pool_id)
          pool_id, b_rate, d_rate
        FROM daily_rates
        WHERE asset_address = $1
        ORDER BY pool_id, rate_date DESC
      ),
      user_balances AS (
        SELECT
          p.user_address,
          SUM(COALESCE(p.supply_btokens, 0) / 1e7 * COALESCE(r.b_rate, 1)) as supply_balance,
          SUM(COALESCE(p.collateral_btokens, 0) / 1e7 * COALESCE(r.b_rate, 1)) as collateral_balance,
          SUM(COALESCE(p.debt_dtokens, 0) / 1e7 * COALESCE(r.d_rate, 1)) as debt_balance
        FROM current_positions p
        LEFT JOIN latest_rates r ON p.pool_id = r.pool_id
        GROUP BY p.user_address
      )
      SELECT
        user_address,
        supply_balance,
        collateral_balance,
        debt_balance,
        (supply_balance + collateral_balance - debt_balance) as net_balance
      FROM user_balances
      WHERE (supply_balance + collateral_balance - debt_balance) >= $2
      ORDER BY net_balance ${orderDirection}
    `

    // Count query
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM (${balanceQuery}) sub`,
      [assetAddress, minBalanceNative]
    )
    const totalCount = parseInt(countResult.rows[0]?.total || '0', 10)

    // Main query with pagination
    const result = await pool.query(
      `${balanceQuery} LIMIT $3 OFFSET $4`,
      [assetAddress, minBalanceNative, limit, offset]
    )

    const results: AccountBalanceResult[] = result.rows.map((row) => {
      const supplyBalance = parseFloat(row.supply_balance) || 0
      const collateralBalance = parseFloat(row.collateral_balance) || 0
      const debtBalance = parseFloat(row.debt_balance) || 0
      const netBalance = parseFloat(row.net_balance) || 0

      return {
        userAddress: row.user_address,
        balance: netBalance,
        balanceUsd: netBalance * price,
        supplyBalance,
        collateralBalance,
        debtBalance,
        netBalance,
        assetSymbol: symbol,
      }
    })

    return { results, totalCount }
  }

  /**
   * Get top depositors by pool
   */
  async getTopDepositorsByPool(params: {
    poolId: string
    assetAddress?: string
    limit: number
  }): Promise<TopDepositorResult[]> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    const { poolId, assetAddress, limit } = params

    let whereClause = 'WHERE pool_id = $1 AND action_type IN (\'supply\', \'supply_collateral\')'
    const queryParams: (string | number)[] = [poolId]
    let paramIndex = 2

    if (assetAddress) {
      whereClause += ` AND asset_address = $${paramIndex}`
      queryParams.push(assetAddress)
      paramIndex++
    }

    queryParams.push(limit)

    const result = await pool.query(
      `
      SELECT
        user_address,
        pool_id,
        pool_name,
        asset_symbol,
        SUM(amount_underlying) / 1e7 as total_deposited,
        ROW_NUMBER() OVER (ORDER BY SUM(amount_underlying) DESC) as rank
      FROM user_action_history
      ${whereClause}
      GROUP BY user_address, pool_id, pool_name, asset_symbol
      ORDER BY total_deposited DESC
      LIMIT $${paramIndex}
      `,
      queryParams
    )

    return result.rows.map((row) => {
      const totalDeposited = parseFloat(row.total_deposited) || 0
      const symbol = row.asset_symbol || ''
      const price = MOCK_PRICES[symbol.toUpperCase()] || 0

      return {
        userAddress: row.user_address,
        poolId: row.pool_id,
        poolName: row.pool_name || 'Unknown Pool',
        totalDeposited,
        totalDepositedUsd: totalDeposited * price,
        rank: parseInt(row.rank, 10),
        assetSymbol: symbol,
      }
    })
  }

  /**
   * Get aggregate metrics for a time range
   */
  async getAggregateMetrics(params: {
    startDate?: string
    endDate?: string
    poolId?: string
    assetAddress?: string
  }): Promise<AggregateMetrics> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    const { startDate, endDate, poolId, assetAddress } = params

    let whereClause = 'WHERE 1=1'
    const queryParams: string[] = []
    let paramIndex = 1

    if (startDate) {
      whereClause += ` AND ledger_closed_at >= $${paramIndex}::timestamp`
      queryParams.push(startDate)
      paramIndex++
    }

    if (endDate) {
      whereClause += ` AND ledger_closed_at < $${paramIndex}::timestamp`
      queryParams.push(endDate)
      paramIndex++
    }

    if (poolId) {
      whereClause += ` AND pool_id = $${paramIndex}`
      queryParams.push(poolId)
      paramIndex++
    }

    if (assetAddress) {
      whereClause += ` AND asset_address = $${paramIndex}`
      queryParams.push(assetAddress)
      paramIndex++
    }

    const result = await pool.query(
      `
      SELECT
        COALESCE(SUM(CASE WHEN action_type IN ('supply', 'supply_collateral')
            THEN amount_underlying / 1e7 ELSE 0 END), 0) as total_deposits,
        COALESCE(SUM(CASE WHEN action_type IN ('withdraw', 'withdraw_collateral')
            THEN amount_underlying / 1e7 ELSE 0 END), 0) as total_withdrawals,
        COUNT(DISTINCT user_address) as active_accounts,
        COUNT(*) as total_events,
        asset_symbol
      FROM user_action_history
      ${whereClause}
      GROUP BY asset_symbol
      `,
      queryParams
    )

    let totalDeposits = 0
    let totalDepositsUsd = 0
    let totalWithdrawals = 0
    let totalWithdrawalsUsd = 0
    let activeAccounts = 0
    let totalEvents = 0

    // Aggregate across all assets
    for (const row of result.rows) {
      const deposits = parseFloat(row.total_deposits) || 0
      const withdrawals = parseFloat(row.total_withdrawals) || 0
      const symbol = row.asset_symbol || ''
      const price = MOCK_PRICES[symbol.toUpperCase()] || 0

      totalDeposits += deposits
      totalDepositsUsd += deposits * price
      totalWithdrawals += withdrawals
      totalWithdrawalsUsd += withdrawals * price
      activeAccounts = Math.max(activeAccounts, parseInt(row.active_accounts, 10) || 0)
      totalEvents += parseInt(row.total_events, 10) || 0
    }

    // Get accurate unique account count
    if (result.rows.length > 1) {
      const accountCountResult = await pool.query(
        `
        SELECT COUNT(DISTINCT user_address) as active_accounts
        FROM user_action_history
        ${whereClause}
        `,
        queryParams
      )
      activeAccounts = parseInt(accountCountResult.rows[0]?.active_accounts, 10) || 0
    }

    return {
      totalDeposits,
      totalDepositsUsd,
      totalWithdrawals,
      totalWithdrawalsUsd,
      netFlow: totalDeposits - totalWithdrawals,
      netFlowUsd: totalDepositsUsd - totalWithdrawalsUsd,
      activeAccounts,
      totalEvents,
    }
  }

  /**
   * Get volume breakdown by token
   */
  async getVolumeByToken(params: {
    startDate?: string
    endDate?: string
    limit: number
  }): Promise<TokenVolumeResult[]> {
    if (!pool) {
      throw new Error('Database pool not initialized')
    }

    const { startDate, endDate, limit } = params

    let whereClause = 'WHERE 1=1'
    const queryParams: (string | number)[] = []
    let paramIndex = 1

    if (startDate) {
      whereClause += ` AND ledger_closed_at >= $${paramIndex}::timestamp`
      queryParams.push(startDate)
      paramIndex++
    }

    if (endDate) {
      whereClause += ` AND ledger_closed_at < $${paramIndex}::timestamp`
      queryParams.push(endDate)
      paramIndex++
    }

    queryParams.push(limit)

    const result = await pool.query(
      `
      SELECT
        asset_address,
        asset_symbol,
        asset_name,
        COALESCE(SUM(CASE WHEN action_type IN ('supply', 'supply_collateral')
            THEN amount_underlying / 1e7 ELSE 0 END), 0) as deposit_volume,
        COALESCE(SUM(CASE WHEN action_type IN ('withdraw', 'withdraw_collateral')
            THEN amount_underlying / 1e7 ELSE 0 END), 0) as withdraw_volume
      FROM user_action_history
      ${whereClause}
      GROUP BY asset_address, asset_symbol, asset_name
      ORDER BY deposit_volume DESC
      LIMIT $${paramIndex}
      `,
      queryParams
    )

    return result.rows.map((row) => {
      const depositVolume = parseFloat(row.deposit_volume) || 0
      const withdrawVolume = parseFloat(row.withdraw_volume) || 0
      const symbol = row.asset_symbol || ''
      const price = MOCK_PRICES[symbol.toUpperCase()] || 0

      return {
        assetAddress: row.asset_address,
        symbol,
        name: row.asset_name,
        depositVolume,
        depositVolumeUsd: depositVolume * price,
        withdrawVolume,
        withdrawVolumeUsd: withdrawVolume * price,
        netVolume: depositVolume - withdrawVolume,
        netVolumeUsd: (depositVolume - withdrawVolume) * price,
      }
    })
  }
}

export const exploreRepository = new ExploreRepository()
