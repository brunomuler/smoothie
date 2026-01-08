import { NextRequest, NextResponse } from 'next/server'
import { eventsRepository } from '@/lib/db/events-repository'
import { LP_TOKEN_ADDRESS, BLND_TOKEN_ADDRESS } from '@/lib/constants'
import { resolveWalletAddress } from '@/lib/api'

export type PnlPeriodType = '1W' | '1M' | '6M'

export interface PnlChangeDataPoint {
  period: string // Display label (e.g., "Dec 28" or "Jan 2025")
  periodStart: string // ISO date YYYY-MM-DD
  periodEnd: string // ISO date YYYY-MM-DD

  // Stacked bar segments (all in USD)
  supplyApy: number // Protocol yield from lending
  supplyBlndApy: number // Estimated BLND from lending
  backstopYield: number // LP token appreciation
  backstopBlndApy: number // Estimated BLND from backstop
  borrowInterestCost: number // Interest accrued on borrows (negative = cost)
  borrowBlndApy: number // BLND emissions from borrow positions (positive)
  priceChange: number // Can be negative

  // Total for the bar
  total: number

  // Flag for latest period (uses live SDK data)
  isLive: boolean
}

export interface PnlChangeChartResponse {
  data: PnlChangeDataPoint[]
  periodType: PnlPeriodType
  granularity: 'daily' | 'monthly'
}

interface PeriodBoundary {
  start: string // YYYY-MM-DD
  end: string // YYYY-MM-DD
  label: string // Display label
}

/**
 * Generate period boundaries based on selected time range.
 * Uses user's timezone to determine day boundaries.
 */
function generatePeriodBoundaries(
  period: PnlPeriodType,
  timezone: string
): PeriodBoundary[] {
  const boundaries: PeriodBoundary[] = []
  const now = new Date()

  // Get today in user's timezone
  const todayFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const todayStr = todayFormatter.format(now)

  const labelFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
  })

  const monthLabelFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'short',
    year: 'numeric',
  })

  if (period === '6M') {
    // Monthly bars for 6 months
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthEndDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)

      const monthStart = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-01`
      let monthEnd: string

      if (i === 0) {
        // Current month - use today
        monthEnd = todayStr
      } else {
        // Past months - use last day of month
        monthEnd = `${monthEndDate.getFullYear()}-${String(monthEndDate.getMonth() + 1).padStart(2, '0')}-${String(monthEndDate.getDate()).padStart(2, '0')}`
      }

      boundaries.push({
        start: monthStart,
        end: monthEnd,
        label: monthLabelFormatter.format(monthDate),
      })
    }
  } else {
    // Daily bars for 1W (7 days) or 1M (30 days)
    const numDays = period === '1W' ? 7 : 30

    for (let i = numDays - 1; i >= 0; i--) {
      const dayDate = new Date(now)
      dayDate.setDate(dayDate.getDate() - i)

      const dayStr = todayFormatter.format(dayDate)

      boundaries.push({
        start: dayStr,
        end: dayStr,
        label: labelFormatter.format(dayDate),
      })
    }
  }

  return boundaries
}

/**
 * GET /api/pnl-change-chart
 *
 * Returns P&L change data for stacked bar chart visualization.
 * Supports both single wallet and multi-wallet aggregation.
 *
 * Query params:
 * - userAddress: Single user's wallet address (for backward compatibility)
 * - userAddresses: Comma-separated list of wallet addresses (for multi-wallet aggregation)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const userAddress = searchParams.get('userAddress')
  const userAddressesParam = searchParams.get('userAddresses')
  const period = (searchParams.get('period') || '1W') as PnlPeriodType
  const timezone = searchParams.get('timezone') || 'UTC'
  const sdkPricesParam = searchParams.get('sdkPrices')
  const sdkBlndPriceParam = searchParams.get('sdkBlndPrice')
  const sdkLpPriceParam = searchParams.get('sdkLpPrice')
  const currentBalancesParam = searchParams.get('currentBalances')
  const currentBorrowBalancesParam = searchParams.get('currentBorrowBalances')
  const backstopPositionsParam = searchParams.get('backstopPositions')
  const useHistoricalBlndPrices = searchParams.get('useHistoricalBlndPrices') === 'true'
  const blndApyParam = searchParams.get('blndApy') // Current BLND APY from SDK (%)
  const backstopBlndApyParam = searchParams.get('backstopBlndApy') // Current backstop BLND APY from SDK (%)

  // Support both single address and multiple addresses
  let userAddresses: string[] = []
  if (userAddressesParam) {
    userAddresses = userAddressesParam.split(',').map(a => a.trim()).filter(a => a.length > 0)
  } else if (userAddress) {
    userAddresses = [userAddress]
  }

  if (userAddresses.length === 0) {
    return NextResponse.json(
      { error: 'Missing required parameter: userAddress or userAddresses' },
      { status: 400 }
    )
  }

  // Resolve demo wallet aliases to real addresses
  userAddresses = userAddresses.map(addr => resolveWalletAddress(addr))

  // Parse parameters
  let sdkPrices: Record<string, number> = {}
  if (sdkPricesParam) {
    try {
      sdkPrices = JSON.parse(sdkPricesParam)
    } catch {
      console.warn('[PnL Change API] Failed to parse sdkPrices')
    }
  }

  let currentBalances: Record<string, number> = {}
  if (currentBalancesParam) {
    try {
      currentBalances = JSON.parse(currentBalancesParam)
    } catch {
      console.warn('[PnL Change API] Failed to parse currentBalances')
    }
  }

  let currentBorrowBalances: Record<string, number> = {}
  if (currentBorrowBalancesParam) {
    try {
      currentBorrowBalances = JSON.parse(currentBorrowBalancesParam)
    } catch {
      console.warn('[PnL Change API] Failed to parse currentBorrowBalances')
    }
  }

  // Backstop positions now include both lpTokens and shares for consistent yield calculation
  let backstopPositions: Record<string, { lpTokens: number; shares: number }> = {}
  if (backstopPositionsParam) {
    try {
      backstopPositions = JSON.parse(backstopPositionsParam)
    } catch {
      console.warn('[PnL Change API] Failed to parse backstopPositions')
    }
  }

  const sdkBlndPrice = sdkBlndPriceParam ? parseFloat(sdkBlndPriceParam) : 0
  const sdkLpPrice = sdkLpPriceParam ? parseFloat(sdkLpPriceParam) : 0

  try {
    const periodBoundaries = generatePeriodBoundaries(period, timezone)
    const granularity = period === '6M' ? 'monthly' : 'daily'

    // Get the overall date range for fetching data
    const overallStart = periodBoundaries[0].start
    const overallEnd = periodBoundaries[periodBoundaries.length - 1].end

    // Fetch all user actions in the period for ALL addresses (including borrow/repay for borrow calculations)
    const allUserActionsPromises = userAddresses.map(addr =>
      eventsRepository.getUserActions(addr, {
        actionTypes: ['supply', 'supply_collateral', 'withdraw', 'withdraw_collateral', 'claim', 'borrow', 'repay'],
        limit: 1000,
      })
    )
    const allUserActionsArrays = await Promise.all(allUserActionsPromises)
    const userActions = allUserActionsArrays.flat()

    // Get unique assets and separate supply vs borrow pool-asset pairs
    const uniqueAssets = new Set<string>()
    const poolAssetPairs = new Map<string, { poolId: string; assetAddress: string }>() // Supply positions
    const borrowPoolAssetPairs = new Map<string, { poolId: string; assetAddress: string }>() // Borrow positions

    for (const action of userActions) {
      if (action.asset_address) {
        uniqueAssets.add(action.asset_address)
        const compositeKey = `${action.pool_id}-${action.asset_address}`

        // Track supply positions
        if (['supply', 'supply_collateral', 'withdraw', 'withdraw_collateral'].includes(action.action_type)) {
          if (!poolAssetPairs.has(compositeKey)) {
            poolAssetPairs.set(compositeKey, {
              poolId: action.pool_id,
              assetAddress: action.asset_address,
            })
          }
        }

        // Track borrow positions
        if (['borrow', 'repay'].includes(action.action_type)) {
          if (!borrowPoolAssetPairs.has(compositeKey)) {
            borrowPoolAssetPairs.set(compositeKey, {
              poolId: action.pool_id,
              assetAddress: action.asset_address,
            })
          }
        }
      }
    }

    // Fetch balance history for all assets (includes supply, collateral, and debt balances)
    // Also include raw bTokens and rates for live bar recalculation
    const balanceHistoryByAsset = new Map<string, Array<{
      snapshot_date: string
      supply_balance: number
      collateral_balance: number
      debt_balance: number
      pool_id: string
      supply_btokens: number
      collateral_btokens: number
      liabilities_dtokens: number
      b_rate: number
      d_rate: number
    }>>()

    // Fetch balance history for all addresses and combine
    for (const assetAddress of uniqueAssets) {
      const allHistories = await Promise.all(
        userAddresses.map(addr =>
          eventsRepository.getBalanceHistoryFromEvents(addr, assetAddress, 365, timezone)
        )
      )
      // Combine histories from all wallets
      const combinedHistory = allHistories.flatMap(h => h.history) as Array<{
        snapshot_date: string
        supply_balance: number
        collateral_balance: number
        debt_balance: number
        pool_id: string
        supply_btokens: number
        collateral_btokens: number
        liabilities_dtokens: number
        b_rate: number
        d_rate: number
      }>
      balanceHistoryByAsset.set(assetAddress, combinedHistory)
    }

    // Fetch backstop history
    // If SDK positions provided, use those pool addresses; otherwise discover from events
    let backstopPoolAddresses = Object.keys(backstopPositions)
    let backstopHistory: Array<{
      date: string
      lp_tokens_value: number
      cumulative_shares: number
      pool_address: string
    }> = []

    // Fetch backstop events first (to discover pools if SDK data not provided)
    let backstopEventsData: {
      deposits: Array<{ date: string; timestamp: string; lpTokens: number; shares: number; priceAtDeposit: number; poolAddress: string }>
      withdrawals: Array<{ date: string; timestamp: string; lpTokens: number; shares: number; priceAtWithdrawal: number; poolAddress: string }>
    } = { deposits: [], withdrawals: [] }

    // Always try to fetch backstop events for ALL addresses (we need them for calculations)
    const allBackstopEventsPromises = userAddresses.map(addr =>
      eventsRepository.getBackstopEventsWithPrices(
        addr,
        undefined,
        sdkLpPrice > 0 ? sdkLpPrice : 0.35 // Use SDK price or reasonable default for price lookups
      )
    )
    const allBackstopEvents = await Promise.all(allBackstopEventsPromises)
    // Combine backstop events from all wallets
    backstopEventsData = {
      deposits: allBackstopEvents.flatMap(e => e.deposits),
      withdrawals: allBackstopEvents.flatMap(e => e.withdrawals),
    }

    // If no SDK positions provided, discover pools from events
    if (backstopPoolAddresses.length === 0) {
      const poolsFromEvents = new Set<string>()
      backstopEventsData.deposits.forEach(d => poolsFromEvents.add(d.poolAddress))
      backstopEventsData.withdrawals.forEach(w => poolsFromEvents.add(w.poolAddress))
      backstopPoolAddresses = Array.from(poolsFromEvents).filter(p => p) // Filter out empty
    }

    if (backstopPoolAddresses.length > 0) {
      // Fetch backstop history for ALL addresses and combine
      const allBackstopHistories = await Promise.all(
        userAddresses.map(addr =>
          eventsRepository.getBackstopUserBalanceHistoryMultiplePools(
            addr,
            backstopPoolAddresses,
            365,
            timezone
          )
        )
      )
      backstopHistory = allBackstopHistories.flat()
    }

    // Note: backstopEventsData already fetched above

    // Helper to get day before a date string (used for period comparisons)
    // This ensures consistent date handling with balance history dates
    function getDayBefore(dateStr: string): string {
      // Parse the date at noon UTC to avoid DST issues, then subtract a day
      const date = new Date(dateStr + 'T12:00:00Z')
      date.setUTCDate(date.getUTCDate() - 1)
      // Format back to YYYY-MM-DD
      return date.toISOString().split('T')[0]
    }

    // Fetch historical prices for all dates we need
    const allDates = new Set<string>()
    for (const boundary of periodBoundaries) {
      allDates.add(boundary.start)
      allDates.add(boundary.end)
      // Also add day before start for period comparisons
      allDates.add(getDayBefore(boundary.start))
    }

    // Also add dates of all user actions (needed for price change on deposits/withdrawals)
    const actionDateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    for (const action of userActions) {
      const actionDate = actionDateFormatter.format(new Date(action.ledger_closed_at))
      allDates.add(actionDate)
    }

    // Also add dates of backstop events
    for (const deposit of backstopEventsData.deposits) {
      const eventDate = actionDateFormatter.format(new Date(deposit.timestamp))
      allDates.add(eventDate)
    }
    for (const withdrawal of backstopEventsData.withdrawals) {
      const eventDate = actionDateFormatter.format(new Date(withdrawal.timestamp))
      allDates.add(eventDate)
    }

    // Build price requests
    const priceRequests: Array<{ tokenAddress: string; targetDate: string }> = []
    for (const assetAddress of uniqueAssets) {
      for (const date of allDates) {
        priceRequests.push({ tokenAddress: assetAddress, targetDate: date })
      }
    }
    // Add LP token prices
    for (const date of allDates) {
      priceRequests.push({ tokenAddress: LP_TOKEN_ADDRESS, targetDate: date })
    }
    // Add BLND token prices
    for (const date of allDates) {
      priceRequests.push({ tokenAddress: BLND_TOKEN_ADDRESS, targetDate: date })
    }

    const sdkPricesMap = new Map<string, number>(Object.entries(sdkPrices))
    sdkPricesMap.set(LP_TOKEN_ADDRESS, sdkLpPrice)
    sdkPricesMap.set(BLND_TOKEN_ADDRESS, sdkBlndPrice)

    const batchedPrices = await eventsRepository.getHistoricalPricesForMultipleTokensAndDates(
      priceRequests,
      sdkPricesMap
    )

    // Fetch historical emission APY data
    // Collect all pool addresses from lending positions, borrow positions, and backstop
    const allPoolAddresses = new Set<string>()
    for (const { poolId } of poolAssetPairs.values()) {
      allPoolAddresses.add(poolId)
    }
    for (const { poolId } of borrowPoolAssetPairs.values()) {
      allPoolAddresses.add(poolId)
    }
    for (const poolAddress of backstopPoolAddresses) {
      allPoolAddresses.add(poolAddress)
    }

    const historicalEmissionApy = await eventsRepository.getHistoricalEmissionApy(
      overallStart,
      overallEnd,
      Array.from(allPoolAddresses),
      Array.from(uniqueAssets)
    )

    // Helper to get emission APY for a specific date (with forward-fill)
    function getEmissionApyForDate(
      date: string,
      poolAddress: string,
      apyType: 'lending_supply' | 'lending_borrow' | 'backstop',
      assetAddress?: string
    ): number {
      let apyMap: Map<string, Map<string, number>>
      if (apyType === 'lending_supply') {
        apyMap = historicalEmissionApy.lendingSupply
      } else if (apyType === 'lending_borrow') {
        apyMap = historicalEmissionApy.lendingBorrow
      } else {
        apyMap = historicalEmissionApy.backstop
      }

      const isLendingType = apyType === 'lending_supply' || apyType === 'lending_borrow'

      // Try exact date first
      if (apyMap.has(date)) {
        const dateData = apyMap.get(date)!
        const key = isLendingType ? `${poolAddress}-${assetAddress}` : poolAddress
        if (dateData.has(key)) {
          return dateData.get(key)!
        }
      }

      // Forward-fill: find most recent date before this one
      const sortedDates = Array.from(apyMap.keys()).sort().reverse()
      for (const pastDate of sortedDates) {
        if (pastDate <= date) {
          const dateData = apyMap.get(pastDate)!
          const key = isLendingType ? `${poolAddress}-${assetAddress}` : poolAddress
          if (dateData.has(key)) {
            return dateData.get(key)!
          }
        }
      }

      // No historical data found for this specific pool/asset - return 0
      // (This means no emissions are configured for this pool/asset combination)
      return 0
    }

    // Helper to get supply/collateral balance for a specific date
    // For multi-wallet: sums balances across all wallets for the same date
    function getBalanceAtDate(
      assetAddress: string,
      poolId: string,
      targetDate: string
    ): number {
      const history = balanceHistoryByAsset.get(assetAddress) || []
      const filtered = history.filter(r => r.pool_id === poolId)

      // Group by snapshot_date to handle multiple wallets
      const byDate = new Map<string, number>()
      for (const record of filtered) {
        const existing = byDate.get(record.snapshot_date) || 0
        byDate.set(record.snapshot_date, existing + (record.supply_balance || 0) + (record.collateral_balance || 0))
      }

      // Find the most recent date <= targetDate
      const sortedDates = Array.from(byDate.keys()).sort().reverse()
      for (const date of sortedDates) {
        if (date <= targetDate) {
          return byDate.get(date) || 0
        }
      }
      return 0
    }

    // Helper to get raw balance data (bTokens + rate) for a specific date
    // Used for live bar recalculation with event-based rates
    // For multi-wallet: sums bTokens across wallets (rates are pool-level, same for all wallets)
    function getRawBalanceAtDate(
      assetAddress: string,
      poolId: string,
      targetDate: string
    ): { supplyBtokens: number; collateralBtokens: number; liabilitiesDtokens: number; bRate: number; dRate: number } | null {
      const history = balanceHistoryByAsset.get(assetAddress) || []
      const filtered = history.filter(r => r.pool_id === poolId)

      // Group by snapshot_date to handle multiple wallets
      const byDate = new Map<string, { supplyBtokens: number; collateralBtokens: number; liabilitiesDtokens: number; bRate: number; dRate: number }>()
      for (const record of filtered) {
        const existing = byDate.get(record.snapshot_date)
        if (existing) {
          // Sum bTokens across wallets (rates should be the same)
          existing.supplyBtokens += record.supply_btokens || 0
          existing.collateralBtokens += record.collateral_btokens || 0
          existing.liabilitiesDtokens += record.liabilities_dtokens || 0
        } else {
          byDate.set(record.snapshot_date, {
            supplyBtokens: record.supply_btokens || 0,
            collateralBtokens: record.collateral_btokens || 0,
            liabilitiesDtokens: record.liabilities_dtokens || 0,
            bRate: record.b_rate || 1,
            dRate: record.d_rate || 1,
          })
        }
      }

      // Find the most recent date <= targetDate
      const sortedDates = Array.from(byDate.keys()).sort().reverse()
      for (const date of sortedDates) {
        if (date <= targetDate) {
          return byDate.get(date) || null
        }
      }
      return null
    }

    // Helper to get debt balance for a specific date
    // For multi-wallet: sums debt across all wallets for the same date
    function getDebtBalanceAtDate(
      assetAddress: string,
      poolId: string,
      targetDate: string
    ): number {
      const history = balanceHistoryByAsset.get(assetAddress) || []
      const filtered = history.filter(r => r.pool_id === poolId)

      // Group by snapshot_date to handle multiple wallets
      const byDate = new Map<string, number>()
      for (const record of filtered) {
        const existing = byDate.get(record.snapshot_date) || 0
        byDate.set(record.snapshot_date, existing + (record.debt_balance || 0))
      }

      // Find the most recent date <= targetDate
      const sortedDates = Array.from(byDate.keys()).sort().reverse()
      for (const date of sortedDates) {
        if (date <= targetDate) {
          return byDate.get(date) || 0
        }
      }
      return 0
    }

    // Helper to get backstop position at date (returns both lp_tokens_value and cumulative_shares)
    // For multi-wallet: sums LP tokens and shares across all wallets for the same date
    function getBackstopPositionAtDate(poolAddress: string, targetDate: string): { lpValue: number; shares: number } {
      const poolHistory = backstopHistory.filter(h => h.pool_address === poolAddress)

      // Group by date to handle multiple wallets
      const byDate = new Map<string, { lpValue: number; shares: number }>()
      for (const record of poolHistory) {
        const existing = byDate.get(record.date)
        if (existing) {
          existing.lpValue += record.lp_tokens_value || 0
          existing.shares += record.cumulative_shares || 0
        } else {
          byDate.set(record.date, {
            lpValue: record.lp_tokens_value || 0,
            shares: record.cumulative_shares || 0,
          })
        }
      }

      // Find the most recent date <= targetDate
      const sortedDates = Array.from(byDate.keys()).sort().reverse()
      for (const date of sortedDates) {
        if (date <= targetDate) {
          return byDate.get(date) || { lpValue: 0, shares: 0 }
        }
      }
      return { lpValue: 0, shares: 0 }
    }

    // Helper to get price at date
    function getPriceAtDate(assetAddress: string, targetDate: string): number {
      const assetPrices = batchedPrices.get(assetAddress)
      if (assetPrices) {
        const priceData = assetPrices.get(targetDate)
        if (priceData) return priceData.price
      }
      return sdkPrices[assetAddress] || 0
    }

    // Get today in user's timezone for live detection
    const todayFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const todayStr = todayFormatter.format(new Date())

    // For the live bar, pre-fetch event-based rates at "start of today in user's timezone"
    // This gives more accurate starting balances for the live bar calculation
    // PostgreSQL handles the timezone conversion correctly in the query
    const eventBasedRates = new Map<string, { b_rate: number | null; d_rate: number | null }>()

    // Collect all unique pool/asset pairs (from both supply and borrow)
    const allPoolAssetPairs = new Map(poolAssetPairs)
    for (const [compositeKey, value] of borrowPoolAssetPairs) {
      if (!allPoolAssetPairs.has(compositeKey)) {
        allPoolAssetPairs.set(compositeKey, value)
      }
    }

    // Fetch all event-based rates IN PARALLEL for better performance
    const ratePromises = Array.from(allPoolAssetPairs).map(async ([compositeKey, { poolId, assetAddress }]) => {
      const rates = await eventsRepository.getRateAtStartOfDay(
        poolId,
        assetAddress,
        todayStr,
        timezone
      )
      return { compositeKey, rates }
    })

    const rateResults = await Promise.all(ratePromises)
    for (const { compositeKey, rates } of rateResults) {
      eventBasedRates.set(compositeKey, rates)
    }

    // Fetch event-based backstop share rates IN PARALLEL for live bar
    const eventBasedBackstopRates = new Map<string, number | null>()
    const backstopRatePromises = backstopPoolAddresses.map(async (poolAddress) => {
      const shareRate = await eventsRepository.getBackstopShareRateAtStartOfDay(
        poolAddress,
        todayStr,
        timezone
      )
      return { poolAddress, shareRate }
    })

    const backstopRateResults = await Promise.all(backstopRatePromises)
    for (const { poolAddress, shareRate } of backstopRateResults) {
      eventBasedBackstopRates.set(poolAddress, shareRate)
    }

    // Calculate P&L for each period
    const data: PnlChangeDataPoint[] = []

    for (const boundary of periodBoundaries) {
      const isLive = boundary.end === todayStr

      // Get day before period start for comparison (in same format as balance history dates)
      const dayBeforeStr = getDayBefore(boundary.start)

      let supplyApy = 0
      let supplyBlndApy = 0
      let backstopYield = 0
      let backstopBlndApy = 0
      let borrowInterestCost = 0 // Interest accrued on borrows (negative = cost)
      let borrowBlndApy = 0 // BLND emissions from borrow positions (positive)
      let priceChange = 0

      // Calculate for each asset
      for (const [compositeKey, { poolId, assetAddress }] of poolAssetPairs) {
        // Get balances
        let tokensAtStart: number

        if (isLive) {
          // For live bar, use event-based rate for more accurate starting balance
          // This avoids the timezone mismatch between daily_rates (UTC) and user's timezone
          const rawBalance = getRawBalanceAtDate(assetAddress, poolId, dayBeforeStr)
          const eventRates = eventBasedRates.get(compositeKey)

          if (rawBalance && eventRates?.b_rate) {
            // Recalculate using event-based rate at the precise timezone boundary
            tokensAtStart = (rawBalance.supplyBtokens + rawBalance.collateralBtokens) * eventRates.b_rate
          } else {
            // Fall back to historical balance if no event-based rate available
            tokensAtStart = getBalanceAtDate(assetAddress, poolId, dayBeforeStr)
          }
        } else {
          // For historical bars, use the standard balance calculation
          tokensAtStart = getBalanceAtDate(assetAddress, poolId, dayBeforeStr)
        }

        let tokensAtEnd: number

        if (isLive && currentBalances[compositeKey] !== undefined) {
          // Use SDK current balance for live period
          tokensAtEnd = currentBalances[compositeKey]
        } else {
          // Fall back to balance history (also handles live period when SDK data not provided)
          tokensAtEnd = getBalanceAtDate(assetAddress, poolId, boundary.end)
        }

        if (tokensAtStart <= 0 && tokensAtEnd <= 0) continue

        // Get prices
        // For live bar, use today's price (captured ~midnight LA) instead of yesterday's
        const priceAtStart = getPriceAtDate(assetAddress, isLive ? boundary.start : dayBeforeStr)
        const priceAtEnd = isLive
          ? (sdkPrices[assetAddress] || priceAtStart)
          : getPriceAtDate(assetAddress, boundary.end)

        if (priceAtEnd <= 0) continue

        // Get events in this period
        // Convert event timestamps to user's timezone for proper date comparison
        const dateFormatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
        const periodActions = userActions.filter(a => {
          if (a.asset_address !== assetAddress || a.pool_id !== poolId) return false
          // Convert UTC timestamp to user's local date
          const actionDate = dateFormatter.format(new Date(a.ledger_closed_at))
          return actionDate >= boundary.start && actionDate <= boundary.end
        })

        // Calculate net deposited in period
        let depositsTokens = 0
        let withdrawalsTokens = 0

        for (const action of periodActions) {
          const rawAmount = action.amount_underlying
          if (rawAmount === null) continue
          const decimals = action.asset_decimals || 7
          const tokens = rawAmount / Math.pow(10, decimals)

          if (action.action_type === 'supply' || action.action_type === 'supply_collateral') {
            depositsTokens += tokens
          } else if (action.action_type === 'withdraw' || action.action_type === 'withdraw_collateral') {
            withdrawalsTokens += tokens
          }
        }

        const netDeposited = depositsTokens - withdrawalsTokens

        // Calculate protocol yield (supply APY)
        const interestTokens = tokensAtEnd - tokensAtStart - netDeposited
        const periodSupplyApy = interestTokens * priceAtEnd
        supplyApy += periodSupplyApy

        // Estimate BLND earned from supply using time-weighted balance
        const periodStartDate = new Date(boundary.start + 'T00:00:00')
        let periodEndDate: Date
        if (isLive) {
          // For live bar, use current time to get partial day elapsed
          periodEndDate = new Date()
        } else {
          // For historical bars, add 1 day to end date since boundary.end is inclusive
          periodEndDate = new Date(boundary.end + 'T00:00:00')
          periodEndDate.setDate(periodEndDate.getDate() + 1)
        }
        const periodMs = periodEndDate.getTime() - periodStartDate.getTime()
        const periodDays = Math.max(0.01, periodMs / (1000 * 60 * 60 * 24)) // min 0.01 to avoid division issues

        // Get historical emission APY for this period (use period start date)
        const periodBlndApyRate = getEmissionApyForDate(boundary.start, poolId, 'lending_supply', assetAddress)
        const dailyBlndRate = periodBlndApyRate / 100 / 365

        // BLND on tokens held at start of period (earn for full period)
        let blndEarnings = tokensAtStart * priceAtStart * dailyBlndRate * periodDays

        // BLND on deposits (pro-rated from deposit date to period end)
        for (const action of periodActions) {
          const rawAmount = action.amount_underlying
          if (rawAmount === null) continue
          const decimals = action.asset_decimals || 7
          const tokens = rawAmount / Math.pow(10, decimals)
          const actionDate = new Date(action.ledger_closed_at)
          const priceAtAction = getPriceAtDate(assetAddress, dateFormatter.format(actionDate))
          const daysRemaining = Math.max(0, (periodEndDate.getTime() - actionDate.getTime()) / (1000 * 60 * 60 * 24))

          if (action.action_type === 'supply' || action.action_type === 'supply_collateral') {
            // Deposits earn BLND from deposit date to period end
            blndEarnings += tokens * priceAtAction * dailyBlndRate * daysRemaining
          } else if (action.action_type === 'withdraw' || action.action_type === 'withdraw_collateral') {
            // Withdrawals stop earning BLND from withdrawal date
            blndEarnings -= tokens * priceAtAction * dailyBlndRate * daysRemaining
          }
        }

        // Get actual BLND price from database or SDK
        const blndPriceToUse = useHistoricalBlndPrices
          ? getPriceAtDate(BLND_TOKEN_ADDRESS, boundary.end)
          : sdkBlndPrice

        supplyBlndApy += blndPriceToUse > 0 ? Math.max(0, blndEarnings) : 0

        // Calculate price change
        const priceChangeOnStart = tokensAtStart * (priceAtEnd - priceAtStart)

        // For deposits during period
        let priceChangeOnDeposits = 0
        let priceChangeLostOnWithdrawals = 0

        for (const action of periodActions) {
          const rawAmount = action.amount_underlying
          if (rawAmount === null) continue
          const decimals = action.asset_decimals || 7
          const tokens = rawAmount / Math.pow(10, decimals)
          // Convert to user's timezone for price lookup
          const actionDate = dateFormatter.format(new Date(action.ledger_closed_at))
          const priceAtAction = getPriceAtDate(assetAddress, actionDate)

          if (action.action_type === 'supply' || action.action_type === 'supply_collateral') {
            priceChangeOnDeposits += tokens * (priceAtEnd - priceAtAction)
          } else if (action.action_type === 'withdraw' || action.action_type === 'withdraw_collateral') {
            priceChangeLostOnWithdrawals += tokens * (priceAtEnd - priceAtAction)
          }
        }

        priceChange += priceChangeOnStart + priceChangeOnDeposits - priceChangeLostOnWithdrawals
      }

      // Calculate backstop P&L using shares-based approach
      // The balance history tracks lp_tokens_value = shares × share_rate
      // To calculate yield correctly, we use shares from both history and events
      for (const poolAddress of backstopPoolAddresses) {
        const positionAtStart = getBackstopPositionAtDate(poolAddress, dayBeforeStr)
        let lpAtEnd: number
        let sharesAtEnd: number

        const sdkPosition = backstopPositions[poolAddress]
        if (isLive && sdkPosition?.lpTokens !== undefined && sdkPosition?.shares !== undefined) {
          // Use SDK data for both lpTokens AND shares to ensure consistent share rate calculation
          lpAtEnd = sdkPosition.lpTokens
          sharesAtEnd = sdkPosition.shares
        } else {
          // Fall back to balance history (also handles live period when SDK data not provided)
          const endPosition = getBackstopPositionAtDate(poolAddress, boundary.end)
          lpAtEnd = endPosition.lpValue
          sharesAtEnd = endPosition.shares
        }

        let lpAtStart: number
        const sharesAtStart = positionAtStart.shares

        // For live bar, use event-based share rate for more accurate starting LP value
        // This avoids timezone mismatch between balance history and user's timezone
        if (isLive) {
          const eventShareRate = eventBasedBackstopRates.get(poolAddress)
          if (eventShareRate !== null && eventShareRate !== undefined) {
            lpAtStart = sharesAtStart * eventShareRate
          } else {
            lpAtStart = positionAtStart.lpValue
          }
        } else {
          lpAtStart = positionAtStart.lpValue
        }

        // Skip if no position in this period
        if (sharesAtStart <= 0 && sharesAtEnd <= 0) continue

        // Get LP prices
        // For live bar, use today's price (captured ~midnight LA) instead of yesterday's
        const lpPriceAtStart = getPriceAtDate(LP_TOKEN_ADDRESS, isLive ? boundary.start : dayBeforeStr)
        const lpPriceAtEnd = isLive && sdkLpPrice > 0
          ? sdkLpPrice
          : getPriceAtDate(LP_TOKEN_ADDRESS, boundary.end)

        if (lpPriceAtEnd <= 0) continue

        // Get backstop events in period - use SHARES not LP tokens for consistency
        // Convert event timestamps to user's timezone for proper date comparison
        const backstopDateFormatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
        const periodDeposits = backstopEventsData.deposits.filter(d => {
          if (d.poolAddress !== poolAddress) return false
          // Convert UTC timestamp to user's local date
          const eventDate = backstopDateFormatter.format(new Date(d.timestamp))
          return eventDate >= boundary.start && eventDate <= boundary.end
        })
        const periodWithdrawals = backstopEventsData.withdrawals.filter(w => {
          if (w.poolAddress !== poolAddress) return false
          // Convert UTC timestamp to user's local date
          const eventDate = backstopDateFormatter.format(new Date(w.timestamp))
          return eventDate >= boundary.start && eventDate <= boundary.end
        })

        // Calculate LP yield using accounting approach:
        // Yield = End LP + Withdrawn LP - Start LP - Deposited LP
        // This correctly handles full withdrawals where shareRateAtEnd would be 0

        // Sum up deposits and withdrawals during the period
        let depositedLp = 0
        for (const deposit of periodDeposits) {
          depositedLp += deposit.lpTokens
        }

        let withdrawnLp = 0
        for (const withdrawal of periodWithdrawals) {
          withdrawnLp += withdrawal.lpTokens
        }

        // Yield = what we have now + what we took out - what we started with - what we put in
        const lpYield = lpAtEnd + withdrawnLp - lpAtStart - depositedLp

        // Include both positive and negative yield
        backstopYield += lpYield * lpPriceAtEnd

        // Estimate backstop BLND emissions using time-weighted balance
        const backstopPeriodStartDate = new Date(boundary.start + 'T00:00:00')
        let backstopPeriodEndDate: Date
        if (isLive) {
          // For live bar, use current time to get partial day elapsed
          backstopPeriodEndDate = new Date()
        } else {
          // For historical bars, add 1 day to end date since boundary.end is inclusive
          backstopPeriodEndDate = new Date(boundary.end + 'T00:00:00')
          backstopPeriodEndDate.setDate(backstopPeriodEndDate.getDate() + 1)
        }
        const backstopPeriodMs = backstopPeriodEndDate.getTime() - backstopPeriodStartDate.getTime()
        const backstopPeriodDays = Math.max(0.01, backstopPeriodMs / (1000 * 60 * 60 * 24))

        // Get historical backstop emission APY for this period
        const periodBackstopBlndApyRate = getEmissionApyForDate(boundary.start, poolAddress, 'backstop')
        const dailyBackstopBlndRate = periodBackstopBlndApyRate / 100 / 365

        // BLND on LP tokens held at start of period (earn for full period)
        let backstopBlndEarnings = lpAtStart * lpPriceAtStart * dailyBackstopBlndRate * backstopPeriodDays

        // BLND on deposits (pro-rated from deposit date to period end)
        for (const deposit of periodDeposits) {
          const depositDate = new Date(deposit.timestamp)
          const lpPriceAtDeposit = getPriceAtDate(LP_TOKEN_ADDRESS, backstopDateFormatter.format(depositDate))
          const daysRemaining = Math.max(0, (backstopPeriodEndDate.getTime() - depositDate.getTime()) / (1000 * 60 * 60 * 24))
          backstopBlndEarnings += deposit.lpTokens * lpPriceAtDeposit * dailyBackstopBlndRate * daysRemaining
        }

        // Subtract BLND that would have been earned on withdrawals
        for (const withdrawal of periodWithdrawals) {
          const withdrawDate = new Date(withdrawal.timestamp)
          const lpPriceAtWithdraw = getPriceAtDate(LP_TOKEN_ADDRESS, backstopDateFormatter.format(withdrawDate))
          const daysRemaining = Math.max(0, (backstopPeriodEndDate.getTime() - withdrawDate.getTime()) / (1000 * 60 * 60 * 24))
          backstopBlndEarnings -= withdrawal.lpTokens * lpPriceAtWithdraw * dailyBackstopBlndRate * daysRemaining
        }

        backstopBlndApy += Math.max(0, backstopBlndEarnings)

        // LP price change (price appreciation on LP tokens)
        // 1. Price change on LP tokens held at start of period
        const lpPriceChangeOnStart = lpAtStart * (lpPriceAtEnd - lpPriceAtStart)

        // 2. Price change on LP tokens deposited during the period
        let lpPriceChangeOnDeposits = 0
        for (const deposit of periodDeposits) {
          // Get LP price at the date of deposit
          const depositDate = backstopDateFormatter.format(new Date(deposit.timestamp))
          const lpPriceAtDeposit = getPriceAtDate(LP_TOKEN_ADDRESS, depositDate)
          lpPriceChangeOnDeposits += deposit.lpTokens * (lpPriceAtEnd - lpPriceAtDeposit)
        }

        // 3. Price change lost on withdrawals (would have been earned if not withdrawn)
        let lpPriceChangeLostOnWithdrawals = 0
        for (const withdrawal of periodWithdrawals) {
          const withdrawDate = backstopDateFormatter.format(new Date(withdrawal.timestamp))
          const lpPriceAtWithdraw = getPriceAtDate(LP_TOKEN_ADDRESS, withdrawDate)
          lpPriceChangeLostOnWithdrawals += withdrawal.lpTokens * (lpPriceAtEnd - lpPriceAtWithdraw)
        }

        const lpPriceChange = lpPriceChangeOnStart + lpPriceChangeOnDeposits - lpPriceChangeLostOnWithdrawals
        priceChange += lpPriceChange
      }

      // Calculate borrow interest cost and BLND APY for each borrow position
      for (const [compositeKey, { poolId, assetAddress }] of borrowPoolAssetPairs) {
        // Get debt balances
        let debtAtStart: number

        if (isLive) {
          // For live bar, use event-based rate for more accurate starting debt
          const rawBalance = getRawBalanceAtDate(assetAddress, poolId, dayBeforeStr)
          const eventRates = eventBasedRates.get(compositeKey)

          if (rawBalance && eventRates?.d_rate) {
            // Recalculate using event-based rate at the precise timezone boundary
            debtAtStart = rawBalance.liabilitiesDtokens * eventRates.d_rate
          } else {
            // Fall back to historical balance if no event-based rate available
            debtAtStart = getDebtBalanceAtDate(assetAddress, poolId, dayBeforeStr)
          }
        } else {
          // For historical bars, use the standard debt calculation
          debtAtStart = getDebtBalanceAtDate(assetAddress, poolId, dayBeforeStr)
        }

        let debtAtEnd: number

        if (isLive && currentBorrowBalances[compositeKey] !== undefined) {
          // Use SDK current borrow balance for live period
          debtAtEnd = currentBorrowBalances[compositeKey]
        } else {
          // Fall back to balance history (also handles live period when SDK data not provided)
          debtAtEnd = getDebtBalanceAtDate(assetAddress, poolId, boundary.end)
        }

        if (debtAtStart <= 0 && debtAtEnd <= 0) continue

        // Get prices
        // For live bar, use today's price (captured ~midnight LA) instead of yesterday's
        const priceAtStart = getPriceAtDate(assetAddress, isLive ? boundary.start : dayBeforeStr)
        const priceAtEnd = isLive
          ? (sdkPrices[assetAddress] || priceAtStart)
          : getPriceAtDate(assetAddress, boundary.end)

        if (priceAtEnd <= 0) continue

        // Get borrow/repay events in this period
        const dateFormatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
        const periodBorrowActions = userActions.filter(a => {
          if (a.asset_address !== assetAddress || a.pool_id !== poolId) return false
          if (!['borrow', 'repay'].includes(a.action_type)) return false
          const actionDate = dateFormatter.format(new Date(a.ledger_closed_at))
          return actionDate >= boundary.start && actionDate <= boundary.end
        })

        // Calculate net borrowed in period (tokens)
        let borrowsTokens = 0
        let repaysTokens = 0

        for (const action of periodBorrowActions) {
          const rawAmount = action.amount_underlying
          if (rawAmount === null) continue
          const decimals = action.asset_decimals || 7
          const tokens = rawAmount / Math.pow(10, decimals)

          if (action.action_type === 'borrow') {
            borrowsTokens += tokens
          } else if (action.action_type === 'repay') {
            repaysTokens += tokens
          }
        }

        const netBorrowed = borrowsTokens - repaysTokens

        // Calculate borrow interest cost for the period
        // Interest = change in debt - net borrowed
        // Debt grows from interest, so interest = (debtAtEnd - debtAtStart) - (borrows - repays)
        //
        // SAFEGUARD: If debtAtStart is 0 but debtAtEnd > 0 and there were no borrows in this period,
        // it means we don't have historical data for when the debt was created. In this case,
        // skip the interest calculation to avoid incorrectly treating the entire debt as interest.
        let interestTokens = 0
        if (debtAtStart > 0 || netBorrowed !== 0) {
          // We have either historical debt data OR activity in this period - safe to calculate
          interestTokens = (debtAtEnd - debtAtStart) - netBorrowed

          // SANITY CHECK: Interest should not exceed ~1% of debt per day (365% APY is unrealistic)
          // If it does, there's likely a data mismatch between SDK and historical data
          const maxReasonableInterestRatio = 0.01 // 1% per day max
          const avgDebt = (debtAtStart + debtAtEnd) / 2
          if (avgDebt > 0 && Math.abs(interestTokens) > avgDebt * maxReasonableInterestRatio) {
            // Interest is unreasonably large, likely data mismatch - skip this period
            interestTokens = 0
          }
        }
        // If debtAtStart = 0 and netBorrowed = 0 but debtAtEnd > 0, we skip (interestTokens stays 0)

        const periodBorrowInterestCost = interestTokens * priceAtEnd

        // Borrow interest is a cost (negative), so we subtract it
        borrowInterestCost -= periodBorrowInterestCost

        // Calculate borrow BLND emissions using time-weighted balance
        const borrowPeriodStartDate = new Date(boundary.start + 'T00:00:00')
        let borrowPeriodEndDate: Date
        if (isLive) {
          // For live bar, use current time to get partial day elapsed
          borrowPeriodEndDate = new Date()
        } else {
          // For historical bars, add 1 day to end date since boundary.end is inclusive
          borrowPeriodEndDate = new Date(boundary.end + 'T00:00:00')
          borrowPeriodEndDate.setDate(borrowPeriodEndDate.getDate() + 1)
        }
        const borrowPeriodMs = borrowPeriodEndDate.getTime() - borrowPeriodStartDate.getTime()
        const borrowPeriodDays = Math.max(0.01, borrowPeriodMs / (1000 * 60 * 60 * 24))

        // Get historical borrow emission APY for this period (lending_borrow type)
        const periodBorrowBlndApyRate = getEmissionApyForDate(boundary.start, poolId, 'lending_borrow', assetAddress)
        const dailyBorrowBlndRate = periodBorrowBlndApyRate / 100 / 365

        // BLND on debt held at start of period (earn for full period)
        let blndFromBorrow = debtAtStart * priceAtStart * dailyBorrowBlndRate * borrowPeriodDays

        // BLND on borrows during period (pro-rated from borrow date to period end)
        for (const action of periodBorrowActions) {
          const rawAmount = action.amount_underlying
          if (rawAmount === null) continue
          const decimals = action.asset_decimals || 7
          const tokens = rawAmount / Math.pow(10, decimals)
          const actionDate = new Date(action.ledger_closed_at)
          const priceAtAction = getPriceAtDate(assetAddress, dateFormatter.format(actionDate))
          const daysRemaining = Math.max(0, (borrowPeriodEndDate.getTime() - actionDate.getTime()) / (1000 * 60 * 60 * 24))

          if (action.action_type === 'borrow') {
            // New borrows earn BLND from borrow date to period end
            blndFromBorrow += tokens * priceAtAction * dailyBorrowBlndRate * daysRemaining
          } else if (action.action_type === 'repay') {
            // Repays stop earning BLND from repay date
            blndFromBorrow -= tokens * priceAtAction * dailyBorrowBlndRate * daysRemaining
          }
        }

        // Get actual BLND price from database or SDK
        const blndPriceToUse = useHistoricalBlndPrices
          ? getPriceAtDate(BLND_TOKEN_ADDRESS, boundary.end)
          : sdkBlndPrice

        borrowBlndApy += blndPriceToUse > 0 ? Math.max(0, blndFromBorrow) : 0
      }

      // Calculate total (borrow cost is negative, borrow BLND is positive)
      const total = supplyApy + supplyBlndApy + backstopYield + backstopBlndApy + borrowInterestCost + borrowBlndApy + priceChange

      data.push({
        period: boundary.label,
        periodStart: boundary.start,
        periodEnd: boundary.end,
        supplyApy,
        supplyBlndApy,
        backstopYield,
        backstopBlndApy,
        borrowInterestCost,
        borrowBlndApy,
        priceChange,
        total,
        isLive,
      })
    }

    return NextResponse.json({
      data,
      periodType: period,
      granularity,
    } as PnlChangeChartResponse, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    })
  } catch (error) {
    console.error('[PnL Change API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to calculate P&L change data' },
      { status: 500 }
    )
  }
}
