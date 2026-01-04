import { NextRequest, NextResponse } from 'next/server'
import { eventsRepository } from '@/lib/db/events-repository'
import { LP_TOKEN_ADDRESS } from '@/lib/constants'

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
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const userAddress = searchParams.get('userAddress')
  const period = (searchParams.get('period') || '1W') as PnlPeriodType
  const timezone = searchParams.get('timezone') || 'UTC'
  const sdkPricesParam = searchParams.get('sdkPrices')
  const sdkBlndPriceParam = searchParams.get('sdkBlndPrice')
  const sdkLpPriceParam = searchParams.get('sdkLpPrice')
  const currentBalancesParam = searchParams.get('currentBalances')
  const backstopPositionsParam = searchParams.get('backstopPositions')
  const useHistoricalBlndPrices = searchParams.get('useHistoricalBlndPrices') === 'true'
  const blndApyParam = searchParams.get('blndApy') // Current BLND APY from SDK (%)
  const backstopBlndApyParam = searchParams.get('backstopBlndApy') // Current backstop BLND APY from SDK (%)

  if (!userAddress) {
    return NextResponse.json(
      { error: 'Missing required parameter: userAddress' },
      { status: 400 }
    )
  }

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

  let backstopPositions: Record<string, number> = {}
  if (backstopPositionsParam) {
    try {
      backstopPositions = JSON.parse(backstopPositionsParam)
    } catch {
      console.warn('[PnL Change API] Failed to parse backstopPositions')
    }
  }

  const sdkBlndPrice = sdkBlndPriceParam ? parseFloat(sdkBlndPriceParam) : 0
  const sdkLpPrice = sdkLpPriceParam ? parseFloat(sdkLpPriceParam) : 0
  const blndApyRate = blndApyParam ? parseFloat(blndApyParam) : 0 // Already in %
  const backstopBlndApyRate = backstopBlndApyParam ? parseFloat(backstopBlndApyParam) : 0 // Already in %

  try {
    const periodBoundaries = generatePeriodBoundaries(period, timezone)
    const granularity = period === '6M' ? 'monthly' : 'daily'

    // Get the overall date range for fetching data
    const overallStart = periodBoundaries[0].start
    const overallEnd = periodBoundaries[periodBoundaries.length - 1].end

    // Fetch all user actions in the period
    const userActions = await eventsRepository.getUserActions(userAddress, {
      actionTypes: ['supply', 'supply_collateral', 'withdraw', 'withdraw_collateral', 'claim'],
      limit: 1000,
    })

    // Get unique assets
    const uniqueAssets = new Set<string>()
    const poolAssetPairs = new Map<string, { poolId: string; assetAddress: string }>()

    for (const action of userActions) {
      if (action.asset_address) {
        uniqueAssets.add(action.asset_address)
        const compositeKey = `${action.pool_id}-${action.asset_address}`
        if (!poolAssetPairs.has(compositeKey)) {
          poolAssetPairs.set(compositeKey, {
            poolId: action.pool_id,
            assetAddress: action.asset_address,
          })
        }
      }
    }

    // Fetch balance history for all assets
    const balanceHistoryByAsset = new Map<string, Array<{
      snapshot_date: string
      supply_balance: number
      collateral_balance: number
      pool_id: string
    }>>()

    for (const assetAddress of uniqueAssets) {
      const { history } = await eventsRepository.getBalanceHistoryFromEvents(
        userAddress,
        assetAddress,
        365,
        timezone
      )
      balanceHistoryByAsset.set(assetAddress, history as Array<{
        snapshot_date: string
        supply_balance: number
        collateral_balance: number
        pool_id: string
      }>)
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

    // Always try to fetch backstop events (we need them for calculations)
    backstopEventsData = await eventsRepository.getBackstopEventsWithPrices(
      userAddress,
      undefined,
      sdkLpPrice > 0 ? sdkLpPrice : 0.35 // Use SDK price or reasonable default for price lookups
    )

    // If no SDK positions provided, discover pools from events
    if (backstopPoolAddresses.length === 0) {
      const poolsFromEvents = new Set<string>()
      backstopEventsData.deposits.forEach(d => poolsFromEvents.add(d.poolAddress))
      backstopEventsData.withdrawals.forEach(w => poolsFromEvents.add(w.poolAddress))
      backstopPoolAddresses = Array.from(poolsFromEvents).filter(p => p) // Filter out empty
    }

    if (backstopPoolAddresses.length > 0) {
      backstopHistory = await eventsRepository.getBackstopUserBalanceHistoryMultiplePools(
        userAddress,
        backstopPoolAddresses,
        365,
        timezone
      )
    }

    // Note: backstopEventsData already fetched above

    // Fetch historical prices for all dates we need
    const allDates = new Set<string>()
    for (const boundary of periodBoundaries) {
      allDates.add(boundary.start)
      allDates.add(boundary.end)
      // Also add day before start for period comparisons
      const dayBefore = new Date(boundary.start)
      dayBefore.setDate(dayBefore.getDate() - 1)
      allDates.add(dayBefore.toISOString().split('T')[0])
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

    const sdkPricesMap = new Map<string, number>(Object.entries(sdkPrices))
    sdkPricesMap.set(LP_TOKEN_ADDRESS, sdkLpPrice)

    const batchedPrices = await eventsRepository.getHistoricalPricesForMultipleTokensAndDates(
      priceRequests,
      sdkPricesMap
    )

    // Helper to get balance for a specific date
    function getBalanceAtDate(
      assetAddress: string,
      poolId: string,
      targetDate: string
    ): number {
      const history = balanceHistoryByAsset.get(assetAddress) || []
      const sorted = history
        .filter(r => r.pool_id === poolId)
        .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))

      for (const record of sorted) {
        if (record.snapshot_date <= targetDate) {
          return (record.supply_balance || 0) + (record.collateral_balance || 0)
        }
      }
      return 0
    }

    // Helper to get backstop position at date (returns both lp_tokens_value and cumulative_shares)
    function getBackstopPositionAtDate(poolAddress: string, targetDate: string): { lpValue: number; shares: number } {
      const poolHistory = backstopHistory.filter(h => h.pool_address === poolAddress)
      const sorted = poolHistory.sort((a, b) => b.date.localeCompare(a.date))

      for (const record of sorted) {
        if (record.date <= targetDate) {
          return {
            lpValue: record.lp_tokens_value || 0,
            shares: record.cumulative_shares || 0,
          }
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

    // Calculate P&L for each period
    const data: PnlChangeDataPoint[] = []

    for (const boundary of periodBoundaries) {
      const isLive = boundary.end === todayStr

      // Get day before period start for comparison
      const dayBeforeStart = new Date(boundary.start)
      dayBeforeStart.setDate(dayBeforeStart.getDate() - 1)
      const dayBeforeStr = dayBeforeStart.toISOString().split('T')[0]

      let supplyApy = 0
      let supplyBlndApy = 0
      let backstopYield = 0
      let backstopBlndApy = 0
      let priceChange = 0

      // Calculate for each asset
      for (const [compositeKey, { poolId, assetAddress }] of poolAssetPairs) {
        // Get balances
        const tokensAtStart = getBalanceAtDate(assetAddress, poolId, dayBeforeStr)
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
        const priceAtStart = getPriceAtDate(assetAddress, dayBeforeStr)
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

        // Estimate BLND earned from supply
        // Use current BLND APY rate applied to average balance
        const avgBalance = (tokensAtStart + tokensAtEnd) / 2
        const avgBalanceUsd = avgBalance * ((priceAtStart + priceAtEnd) / 2)
        const periodDays = granularity === 'monthly'
          ? Math.max(1, Math.round((new Date(boundary.end).getTime() - new Date(boundary.start).getTime()) / (1000 * 60 * 60 * 24)))
          : 1
        const dailyBlndRate = blndApyRate / 100 / 365
        const estimatedBlndValue = avgBalanceUsd * dailyBlndRate * periodDays

        // Apply historical price setting
        const blndPriceToUse = useHistoricalBlndPrices
          ? getPriceAtDate(LP_TOKEN_ADDRESS, boundary.end) * 0.8 // Rough estimate of BLND from LP
          : sdkBlndPrice

        supplyBlndApy += blndPriceToUse > 0 ? estimatedBlndValue : 0

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

        if (isLive && backstopPositions[poolAddress] !== undefined) {
          lpAtEnd = backstopPositions[poolAddress]
          // For live data, we don't have shares directly, so get from history
          const endPosition = getBackstopPositionAtDate(poolAddress, boundary.end)
          sharesAtEnd = endPosition.shares > 0 ? endPosition.shares : positionAtStart.shares
        } else {
          // Fall back to balance history (also handles live period when SDK data not provided)
          const endPosition = getBackstopPositionAtDate(poolAddress, boundary.end)
          lpAtEnd = endPosition.lpValue
          sharesAtEnd = endPosition.shares
        }

        const lpAtStart = positionAtStart.lpValue
        const sharesAtStart = positionAtStart.shares

        // Skip if no position in this period
        if (sharesAtStart <= 0 && sharesAtEnd <= 0) continue

        // Get LP prices
        const lpPriceAtStart = getPriceAtDate(LP_TOKEN_ADDRESS, dayBeforeStr)
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

        // Calculate LP yield using shares-based approach to avoid unit mismatch
        // Balance history returns lp_tokens_value = shares × share_rate
        // Events return raw lp_tokens, which are different units when share_rate != 1

        // Calculate share rates
        const shareRateAtEnd = sharesAtEnd > 0 ? lpAtEnd / sharesAtEnd : 0
        const shareRateAtStart = sharesAtStart > 0 ? lpAtStart / sharesAtStart : 0

        // Yield on shares held at start of period
        const yieldOnStartShares = sharesAtStart * (shareRateAtEnd - shareRateAtStart)

        // Yield on deposits made during the period
        // Each deposit earns yield from the difference between deposit rate and end rate
        let yieldOnDeposits = 0
        for (const deposit of periodDeposits) {
          if (deposit.shares > 0) {
            const depositShareRate = deposit.lpTokens / deposit.shares
            yieldOnDeposits += deposit.shares * Math.max(0, shareRateAtEnd - depositShareRate)
          }
        }

        // Yield that would have been earned on withdrawals (subtract)
        let yieldOnWithdrawals = 0
        for (const withdrawal of periodWithdrawals) {
          if (withdrawal.shares > 0) {
            const withdrawShareRate = withdrawal.lpTokens / withdrawal.shares
            yieldOnWithdrawals += withdrawal.shares * Math.max(0, shareRateAtEnd - withdrawShareRate)
          }
        }

        const lpYield = yieldOnStartShares + yieldOnDeposits - yieldOnWithdrawals

        // Only add yield if it's positive
        if (lpYield > 0) {
          backstopYield += lpYield * lpPriceAtEnd
        }

        // Estimate backstop BLND emissions
        const avgLp = (lpAtStart + lpAtEnd) / 2
        const avgLpUsd = avgLp * ((lpPriceAtStart + lpPriceAtEnd) / 2)
        const periodDays = granularity === 'monthly'
          ? Math.max(1, Math.round((new Date(boundary.end).getTime() - new Date(boundary.start).getTime()) / (1000 * 60 * 60 * 24)))
          : 1
        const dailyBackstopBlndRate = backstopBlndApyRate / 100 / 365
        const estimatedBackstopBlndValue = avgLpUsd * dailyBackstopBlndRate * periodDays
        backstopBlndApy += estimatedBackstopBlndValue

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

      // Calculate total
      const total = supplyApy + supplyBlndApy + backstopYield + backstopBlndApy + priceChange

      data.push({
        period: boundary.label,
        periodStart: boundary.start,
        periodEnd: boundary.end,
        supplyApy,
        supplyBlndApy,
        backstopYield,
        backstopBlndApy,
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
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
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
