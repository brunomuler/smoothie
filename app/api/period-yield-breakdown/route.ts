import { NextRequest, NextResponse } from 'next/server'
import { eventsRepository } from '@/lib/db/events-repository'

export type PeriodType = '1W' | '1M' | '1Y' | 'All'

export interface AssetPeriodBreakdown {
  assetAddress: string
  poolId: string
  compositeKey: string
  // Token amounts
  tokensAtStart: number
  tokensNow: number
  netDepositedInPeriod: number
  interestEarnedTokens: number
  // Prices
  priceAtStart: number
  priceNow: number
  priceSource: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback'
  // USD values
  valueAtStart: number
  valueNow: number
  protocolYieldUsd: number
  priceChangeUsd: number
  totalEarnedUsd: number
}

export interface BackstopPeriodBreakdown {
  poolAddress: string
  // LP Token amounts
  lpTokensAtStart: number
  lpTokensNow: number
  netDepositedInPeriod: number
  interestEarnedLpTokens: number
  // Prices
  priceAtStart: number
  priceNow: number
  priceSource: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback'
  // USD values
  valueAtStart: number
  valueNow: number
  protocolYieldUsd: number
  priceChangeUsd: number
  totalEarnedUsd: number
}

export interface PeriodYieldBreakdownResponse {
  byAsset: Record<string, AssetPeriodBreakdown>
  byBackstop: Record<string, BackstopPeriodBreakdown>
  totals: {
    valueAtStart: number
    valueNow: number
    protocolYieldUsd: number
    priceChangeUsd: number
    totalEarnedUsd: number
    totalEarnedPercent: number
  }
  periodStartDate: string
  periodDays: number
  debug?: {
    assetCount: number
    backstopCount: number
    priceSourceCounts: {
      daily_token_prices: number
      forward_fill: number
      sdk_fallback: number
    }
  }
}

/**
 * Calculate period start date based on period type.
 * Uses user's timezone to ensure dates match the chart display.
 *
 * @param period - Time period type
 * @param timezone - User's IANA timezone (e.g., 'America/New_York', 'Europe/London')
 * @returns Date string in YYYY-MM-DD format in user's timezone
 */
function getPeriodStartDate(period: PeriodType, timezone: string = 'UTC'): string {
  // Get current date/time in user's timezone
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  // Parse today's date in user's timezone
  const todayStr = formatter.format(now) // Returns YYYY-MM-DD format
  const [year, month, day] = todayStr.split('-').map(Number)

  let periodStartYear = year
  let periodStartMonth = month
  let periodStartDay = day

  switch (period) {
    case '1W':
      // Subtract 7 days
      const weekAgo = new Date(year, month - 1, day - 7)
      periodStartYear = weekAgo.getFullYear()
      periodStartMonth = weekAgo.getMonth() + 1
      periodStartDay = weekAgo.getDate()
      break
    case '1M':
      // Subtract 30 days
      const monthAgo = new Date(year, month - 1, day - 30)
      periodStartYear = monthAgo.getFullYear()
      periodStartMonth = monthAgo.getMonth() + 1
      periodStartDay = monthAgo.getDate()
      break
    case '1Y':
      // Subtract 1 year
      periodStartYear = year - 1
      break
    case 'All':
    default:
      // For "All", use a very old date
      return '2020-01-01'
  }

  // Format as YYYY-MM-DD
  return `${periodStartYear}-${String(periodStartMonth).padStart(2, '0')}-${String(periodStartDay).padStart(2, '0')}`
}

/**
 * Find token balance BEFORE a specific date from balance history.
 *
 * Since balance history uses END-OF-DAY snapshots:
 * - To get balance at START of Nov 19, we need Nov 18 EOD (strictly < Nov 19)
 * - This represents what the user had BEFORE any events on the target date
 *
 * @param targetDate - The period start date (e.g., "2024-11-19")
 * @returns Balance from the day BEFORE targetDate (end-of-day snapshot)
 */
function findTokenBalanceBeforeDate(
  history: Array<{ snapshot_date: string; supply_balance: number; collateral_balance: number; pool_id: string }>,
  targetDate: string,
  poolId: string,
  debug: boolean = false
): number {
  // Filter by pool and sort by date descending (newest first)
  const sorted = history
    .filter(r => r.pool_id === poolId)
    .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))

  if (debug) {
    console.log(`[findTokenBalanceBeforeDate] Looking for balance BEFORE ${targetDate} for pool ${poolId.slice(0, 8)}...`)
    console.log(`[findTokenBalanceBeforeDate] Total records for pool: ${sorted.length}`)
    // Show records around target date
    const nearbyRecords = sorted.filter(r =>
      r.snapshot_date >= targetDate.slice(0, 7) // Same month or later
    ).slice(0, 5)
    console.log(`[findTokenBalanceBeforeDate] Nearby records:`, nearbyRecords.map(r => ({
      date: r.snapshot_date,
      supply: r.supply_balance?.toFixed(2),
      collateral: r.collateral_balance?.toFixed(2),
      total: ((r.supply_balance || 0) + (r.collateral_balance || 0)).toFixed(2)
    })))
  }

  // Find the first record STRICTLY BEFORE the target date
  // This gives us the end-of-day balance from the day before the period starts
  for (const record of sorted) {
    if (record.snapshot_date < targetDate) {
      const balance = (record.supply_balance || 0) + (record.collateral_balance || 0)
      if (debug) {
        console.log(`[findTokenBalanceBeforeDate] Found record at ${record.snapshot_date}: supply=${record.supply_balance}, collateral=${record.collateral_balance}, total=${balance}`)
      }
      return balance
    }
  }

  if (debug) {
    console.log(`[findTokenBalanceBeforeDate] No record found before ${targetDate}`)
  }
  // If no record found before target date, user didn't have position before this period
  return 0
}

/**
 * GET /api/period-yield-breakdown
 *
 * Returns yield breakdown for a specific time period.
 *
 * This API queries balance history DIRECTLY from the database (same source as chart)
 * to get accurate token balances at period start.
 *
 * Query params:
 * - userAddress: The user's wallet address
 * - period: Time period ('1W', '1M', '1Y', 'All')
 * - sdkPrices: JSON object mapping asset addresses to current SDK prices
 * - currentBalances: JSON object mapping compositeKey (poolId-assetAddress) to current token balance
 *
 * Calculates (per asset, then sums):
 * - tokensAtStart = actual token balance from balance history at period start
 * - netDepositedInPeriod = deposits - withdrawals during period
 * - interestEarnedTokens = tokensNow - tokensAtStart - netDepositedInPeriod
 * - Protocol Yield = interestEarnedTokens × currentPrice
 * - Price Change = tokensAtStart × (currentPrice - priceAtStart)
 * - Total Earned = Protocol Yield + Price Change
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const userAddress = searchParams.get('userAddress')
  const period = (searchParams.get('period') || '1M') as PeriodType
  const sdkPricesParam = searchParams.get('sdkPrices')
  const currentBalancesParam = searchParams.get('currentBalances')
  const backstopPositionsParam = searchParams.get('backstopPositions')
  const lpTokenPriceParam = searchParams.get('lpTokenPrice')
  // Get timezone from query param - should match the chart's timezone for consistent dates
  const timezone = searchParams.get('timezone') || 'UTC'

  console.log('[Period Yield API] Called with:', { userAddress, period, timezone })

  if (!userAddress) {
    return NextResponse.json(
      { error: 'Missing required parameter: userAddress' },
      { status: 400 }
    )
  }

  // Parse SDK prices (current prices)
  let sdkPrices: Record<string, number> = {}
  if (sdkPricesParam) {
    try {
      sdkPrices = JSON.parse(sdkPricesParam)
    } catch {
      console.warn('[Period Yield API] Failed to parse sdkPrices')
    }
  }

  // Parse current balances (from SDK)
  let currentBalances: Record<string, number> = {}
  if (currentBalancesParam) {
    try {
      currentBalances = JSON.parse(currentBalancesParam)
    } catch {
      console.warn('[Period Yield API] Failed to parse currentBalances')
    }
  }

  // Parse backstop positions (poolAddress -> lpTokens)
  let backstopPositions: Record<string, number> = {}
  if (backstopPositionsParam) {
    try {
      backstopPositions = JSON.parse(backstopPositionsParam)
    } catch {
      console.warn('[Period Yield API] Failed to parse backstopPositions')
    }
  }

  // Parse LP token price
  const lpTokenPrice = lpTokenPriceParam ? parseFloat(lpTokenPriceParam) : 0

  console.log('[Period Yield API] Backstop params:', {
    backstopPositionsParam: backstopPositionsParam?.slice(0, 100),
    backstopPositionsCount: Object.keys(backstopPositions).length,
    lpTokenPriceParam,
    lpTokenPrice,
  })

  try {
    const periodStartDate = getPeriodStartDate(period, timezone)
    // Get today's date in user's timezone
    const todayFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const todayStr = todayFormatter.format(new Date())

    // Get all unique assets the user has interacted with
    const userActions = await eventsRepository.getUserActions(userAddress, {
      actionTypes: ['supply', 'supply_collateral', 'withdraw', 'withdraw_collateral'],
      limit: 1000,
    })

    // Group actions by pool-asset and collect unique asset addresses
    const poolAssetPairs = new Map<string, { poolId: string; assetAddress: string }>()
    const uniqueAssets = new Set<string>()

    for (const action of userActions) {
      if (!action.pool_id || !action.asset_address) continue
      const compositeKey = `${action.pool_id}-${action.asset_address}`
      if (!poolAssetPairs.has(compositeKey)) {
        poolAssetPairs.set(compositeKey, {
          poolId: action.pool_id,
          assetAddress: action.asset_address,
        })
        uniqueAssets.add(action.asset_address)
      }
    }

    console.log(`[Period Yield API] Found ${userActions.length} actions, ${poolAssetPairs.size} pool-asset pairs, ${uniqueAssets.size} unique assets`)
    console.log(`[Period Yield API] Assets in sdkPrices:`, Object.keys(sdkPrices))
    console.log(`[Period Yield API] All unique assets from actions:`, Array.from(uniqueAssets))

    // Fetch balance history for all unique assets from database
    // This is the same data source the chart uses
    const balanceHistoryByAsset = new Map<string, Array<{ snapshot_date: string; supply_balance: number; collateral_balance: number; pool_id: string }>>()

    for (const assetAddress of uniqueAssets) {
      const { history } = await eventsRepository.getBalanceHistoryFromEvents(
        userAddress,
        assetAddress,
        365, // Get up to 1 year of history
        timezone // Use user's timezone to match chart data
      )
      balanceHistoryByAsset.set(assetAddress, history as Array<{ snapshot_date: string; supply_balance: number; collateral_balance: number; pool_id: string }>)
    }

    const byAsset: Record<string, AssetPeriodBreakdown> = {}
    const byBackstop: Record<string, BackstopPeriodBreakdown> = {}
    let totalValueAtStart = 0
    let totalValueNow = 0
    let totalProtocolYieldUsd = 0
    let totalPriceChangeUsd = 0

    // Track price sources for debugging
    const priceSourceCounts = {
      daily_token_prices: 0,
      forward_fill: 0,
      sdk_fallback: 0,
    }
    let assetCount = 0
    let backstopCount = 0

    // Process each pool-asset pair
    for (const [compositeKey, { poolId, assetAddress }] of poolAssetPairs) {
      const sdkPrice = sdkPrices[assetAddress] || 0
      const tokensNow = currentBalances[compositeKey] || 0

      // Step 1: Get actual token balance BEFORE period start from DATABASE
      // Since balance history is END-OF-DAY snapshots, we look for balance STRICTLY BEFORE
      // periodStartDate to get what the user had at the START of the period.
      // Example: For period starting Nov 19, we get Nov 18 EOD balance
      const history = balanceHistoryByAsset.get(assetAddress) || []
      const tokensAtStart = findTokenBalanceBeforeDate(history, periodStartDate, poolId, true)

      // Skip only if BOTH current AND start balances are zero (never had position in this period)
      if (tokensNow <= 0 && tokensAtStart <= 0) {
        console.log(`[Period Yield API] Skipping ${compositeKey.slice(0, 16)}... tokensNow=${tokensNow}, tokensAtStart=${tokensAtStart}`)
        continue
      }

      // For closed positions (tokensNow = 0), we still need to calculate valueAtStart
      // Get historical price if no SDK price available
      let effectivePrice = sdkPrice
      if (sdkPrice <= 0 && tokensAtStart > 0) {
        // Position was closed - get historical price at period start for valueAtStart calculation
        const { price: historicalPrice } = await eventsRepository.getHistoricalPriceAtDate(
          assetAddress,
          periodStartDate,
          0 // No fallback - we need actual price
        )
        effectivePrice = historicalPrice
        console.log(`[Period Yield API] Closed position ${compositeKey.slice(0, 16)}... using historical price: ${historicalPrice}`)
      }

      // Skip if still no price available
      if (effectivePrice <= 0) {
        console.log(`[Period Yield API] Skipping ${compositeKey.slice(0, 16)}... no price available`)
        continue
      }

      // Step 2: Get events FROM period start (to calculate net deposited in period)
      // Since tokensAtStart is now the balance BEFORE periodStartDate,
      // we include events ON periodStartDate in netDepositedInPeriod.
      // Example: Period starts Nov 19, tokensAtStart is Nov 18 EOD,
      //          so Nov 19 deposits should count in netDepositedInPeriod
      const eventsInPeriod = await eventsRepository.getDepositEventsWithPrices(
        userAddress,
        assetAddress,
        poolId,
        effectivePrice,
        periodStartDate, // startDate = period start (includes all events in period)
        undefined,       // no endDate (up to now)
        timezone         // Use user's timezone for consistent date handling
      )

      const depositsInPeriod = eventsInPeriod.deposits
      const withdrawalsInPeriod = eventsInPeriod.withdrawals
      const depositsInPeriodTokens = depositsInPeriod.reduce((sum, d) => sum + d.tokens, 0)
      const withdrawalsInPeriodTokens = withdrawalsInPeriod.reduce((sum, w) => sum + w.tokens, 0)
      const netDepositedInPeriod = depositsInPeriodTokens - withdrawalsInPeriodTokens

      // Debug: log each deposit event
      console.log(`[Period Yield API] Deposit events for ${compositeKey.slice(0, 24)}:`, {
        periodStartDate,
        timezone,
        deposits: depositsInPeriod.map(d => ({ date: d.date, tokens: d.tokens.toFixed(2) })),
        totalDeposits: depositsInPeriodTokens.toFixed(2),
        totalWithdrawals: withdrawalsInPeriodTokens.toFixed(2),
        netDeposited: netDepositedInPeriod.toFixed(2),
      })

      // Step 3: Get ACTUAL market price at period start from daily_token_prices
      // This is different from all-time which uses weighted average deposit price.
      // For period calculation, we want to know how much the market price changed
      // during this period, not since the user first bought.
      const { price: priceAtStart, source: priceSource } = await eventsRepository.getHistoricalPriceAtDate(
        assetAddress,
        periodStartDate,
        effectivePrice
      )

      console.log(`[Period Yield API] Asset ${assetAddress.slice(0, 8)}... in pool ${poolId.slice(0, 8)}...`, {
        periodStartDate,
        priceAtStart: priceAtStart.toFixed(6),
        priceSource,
        priceNow: effectivePrice.toFixed(6),
        priceDiff: (effectivePrice - priceAtStart).toFixed(6),
        tokensAtStart: tokensAtStart.toFixed(4),
        tokensNow: tokensNow.toFixed(4),
        netDepositedInPeriod: netDepositedInPeriod.toFixed(4),
        depositsCount: depositsInPeriod.length,
        withdrawalsCount: withdrawalsInPeriod.length,
        isClosedPosition: tokensNow <= 0 && tokensAtStart > 0,
      })

      // Step 4: Calculate breakdown using the CORRECT formulas
      // Interest earned = current tokens - tokens at start - net deposits in period
      const interestEarnedTokens = tokensNow - tokensAtStart - netDepositedInPeriod

      // Protocol Yield = interest earned × current price (or effective price for closed positions)
      const protocolYieldUsd = interestEarnedTokens * effectivePrice

      // Price Change = change on tokens at start + change on deposits - change lost on withdrawals
      // For deposits made during period: price appreciation = tokens * (currentPrice - depositPrice)
      const priceChangeOnDeposits = depositsInPeriod.reduce((sum, d) => {
        return sum + d.tokens * (effectivePrice - d.priceAtDeposit)
      }, 0)
      // For withdrawals: we "lost" the price appreciation on those tokens
      const priceChangeLostOnWithdrawals = withdrawalsInPeriod.reduce((sum, w) => {
        return sum + w.tokens * (effectivePrice - w.priceAtWithdrawal)
      }, 0)
      // Total price change = change on start tokens + change on deposits - change lost on withdrawals
      const priceChangeOnStartTokens = tokensAtStart * (effectivePrice - priceAtStart)
      const priceChangeUsd = priceChangeOnStartTokens + priceChangeOnDeposits - priceChangeLostOnWithdrawals

      // Total Earned
      const totalEarnedUsd = protocolYieldUsd + priceChangeUsd

      // Value calculations
      const valueAtStart = tokensAtStart * priceAtStart
      const valueNow = tokensNow * effectivePrice

      // Store breakdown
      byAsset[compositeKey] = {
        assetAddress,
        poolId,
        compositeKey,
        tokensAtStart,
        tokensNow,
        netDepositedInPeriod,
        interestEarnedTokens,
        priceAtStart,
        priceNow: effectivePrice,
        priceSource,
        valueAtStart,
        valueNow,
        protocolYieldUsd,
        priceChangeUsd,
        totalEarnedUsd,
      }

      // Accumulate totals
      totalValueAtStart += valueAtStart
      totalValueNow += valueNow
      totalProtocolYieldUsd += protocolYieldUsd
      totalPriceChangeUsd += priceChangeUsd
      priceSourceCounts[priceSource]++
      assetCount++

      console.log(`[Period Yield API] ${compositeKey}:`, {
        tokensAtStart,
        tokensNow,
        netDepositedInPeriod,
        interestEarnedTokens,
        priceAtStart,
        priceNow: sdkPrice,
        protocolYieldUsd,
        priceChangeUsd,
        priceChangeBreakdown: {
          onStartTokens: priceChangeOnStartTokens,
          onDeposits: priceChangeOnDeposits,
          lostOnWithdrawals: priceChangeLostOnWithdrawals,
        },
        totalEarnedUsd,
      })
    }

    // Process backstop positions
    const LP_TOKEN_ADDRESS = 'CAS3FL6TLZKDGGSISDBWGGPXT3NRR4DYTZD7YOD3HMYO6LTJUVGRVEAM'
    const backstopPoolAddresses = Object.keys(backstopPositions)

    if (backstopPoolAddresses.length > 0 && lpTokenPrice > 0) {
      console.log('[Period Yield API] Processing backstop positions:', {
        poolCount: backstopPoolAddresses.length,
        lpTokenPrice,
      })

      // Fetch backstop balance history for all pools
      const backstopHistory = await eventsRepository.getBackstopUserBalanceHistoryMultiplePools(
        userAddress,
        backstopPoolAddresses,
        365, // Up to 1 year
        timezone // Use user's timezone to match chart data
      )

      // Get LP token price at period start
      const { price: lpPriceAtStart, source: lpPriceSource } = await eventsRepository.getHistoricalPriceAtDate(
        LP_TOKEN_ADDRESS,
        periodStartDate,
        lpTokenPrice
      )

      console.log('[Period Yield API] LP token price at period start:', {
        lpPriceAtStart,
        lpPriceSource,
        lpPriceNow: lpTokenPrice,
      })

      // Get backstop events within period for net deposited calculation
      const backstopEventsData = await eventsRepository.getBackstopEventsWithPrices(
        userAddress,
        undefined, // All pools
        lpTokenPrice
      )

      // Process each backstop pool
      for (const poolAddress of backstopPoolAddresses) {
        const lpTokensNow = backstopPositions[poolAddress] || 0

        // Find LP tokens BEFORE period start from history
        // Since balance history is END-OF-DAY snapshots, we look for balance STRICTLY BEFORE
        // periodStartDate to get what the user had at the START of the period.
        const poolHistory = backstopHistory.filter(h => h.pool_address === poolAddress)
        let lpTokensAtStart = 0

        // Debug: log history dates
        const historyDates = poolHistory.map(h => h.date).sort()
        console.log(`[Period Yield API] Backstop ${poolAddress.slice(0, 16)}... history:`, {
          recordCount: poolHistory.length,
          firstDate: historyDates[0],
          lastDate: historyDates[historyDates.length - 1],
          periodStartDate,
          sampleRecords: poolHistory.slice(0, 3).map(h => ({ date: h.date, lp_tokens_value: h.lp_tokens_value })),
        })

        // Sort by date descending and find first record STRICTLY BEFORE period start
        const sortedHistory = poolHistory.sort((a, b) => b.date.localeCompare(a.date))
        for (const record of sortedHistory) {
          if (record.date < periodStartDate) {
            lpTokensAtStart = record.lp_tokens_value || 0
            break
          }
        }

        // Skip if no position in this period
        if (lpTokensNow <= 0 && lpTokensAtStart <= 0) {
          console.log(`[Period Yield API] Skipping backstop ${poolAddress.slice(0, 16)}... lpTokensNow=${lpTokensNow}, lpTokensAtStart=${lpTokensAtStart}`)
          continue
        }

        // Calculate net deposited in period from events
        // Since lpTokensAtStart is now BEFORE periodStartDate, we include events ON periodStartDate
        const poolDepositsInPeriod = backstopEventsData.deposits
          .filter(d => d.poolAddress === poolAddress && d.date >= periodStartDate)
        const poolWithdrawalsInPeriod = backstopEventsData.withdrawals
          .filter(w => w.poolAddress === poolAddress && w.date >= periodStartDate)

        const poolDepositsTokens = poolDepositsInPeriod.reduce((sum, d) => sum + d.lpTokens, 0)
        const poolWithdrawalsTokens = poolWithdrawalsInPeriod.reduce((sum, w) => sum + w.lpTokens, 0)
        const netDepositedInPeriod = poolDepositsTokens - poolWithdrawalsTokens

        // Calculate price change on deposits made during period
        // Each deposit was made at a historical price, price change = tokens * (currentPrice - depositPrice)
        const priceChangeOnDeposits = poolDepositsInPeriod.reduce((sum, d) => {
          return sum + d.lpTokens * (lpTokenPrice - d.priceAtDeposit)
        }, 0)
        // Withdrawals: we "lost" the price appreciation on those tokens
        const priceChangeLostOnWithdrawals = poolWithdrawalsInPeriod.reduce((sum, w) => {
          return sum + w.lpTokens * (lpTokenPrice - w.priceAtWithdrawal)
        }, 0)

        // Calculate breakdown
        const interestEarnedLpTokens = lpTokensNow - lpTokensAtStart - netDepositedInPeriod
        const protocolYieldUsd = interestEarnedLpTokens * lpTokenPrice
        // Price change = change on tokens at start + change on deposits - change lost on withdrawals
        const priceChangeOnStartTokens = lpTokensAtStart * (lpTokenPrice - lpPriceAtStart)
        const priceChangeUsd = priceChangeOnStartTokens + priceChangeOnDeposits - priceChangeLostOnWithdrawals
        const backstopTotalEarned = protocolYieldUsd + priceChangeUsd
        const valueAtStart = lpTokensAtStart * lpPriceAtStart
        const valueNow = lpTokensNow * lpTokenPrice

        byBackstop[poolAddress] = {
          poolAddress,
          lpTokensAtStart,
          lpTokensNow,
          netDepositedInPeriod,
          interestEarnedLpTokens,
          priceAtStart: lpPriceAtStart,
          priceNow: lpTokenPrice,
          priceSource: lpPriceSource,
          valueAtStart,
          valueNow,
          protocolYieldUsd,
          priceChangeUsd,
          totalEarnedUsd: backstopTotalEarned,
        }

        // Add to totals
        totalValueAtStart += valueAtStart
        totalValueNow += valueNow
        totalProtocolYieldUsd += protocolYieldUsd
        totalPriceChangeUsd += priceChangeUsd
        priceSourceCounts[lpPriceSource]++
        backstopCount++

        console.log(`[Period Yield API] Backstop ${poolAddress.slice(0, 16)}...:`, {
          lpTokensAtStart,
          lpTokensNow,
          netDepositedInPeriod,
          interestEarnedLpTokens,
          lpPriceAtStart,
          lpPriceNow: lpTokenPrice,
          protocolYieldUsd,
          priceChangeUsd,
          priceChangeBreakdown: {
            onStartTokens: priceChangeOnStartTokens,
            onDeposits: priceChangeOnDeposits,
            lostOnWithdrawals: priceChangeLostOnWithdrawals,
          },
          totalEarnedUsd: backstopTotalEarned,
        })
      }
    }

    const totalEarnedUsd = totalProtocolYieldUsd + totalPriceChangeUsd
    const totalEarnedPercent = totalValueAtStart > 0
      ? (totalEarnedUsd / totalValueAtStart) * 100
      : 0

    // Calculate period days
    const periodStartMs = new Date(periodStartDate).getTime()
    const todayMs = new Date(todayStr).getTime()
    const periodDays = Math.round((todayMs - periodStartMs) / (1000 * 60 * 60 * 24))

    console.log('[Period Yield API] Totals:', {
      period,
      periodStartDate,
      periodDays,
      totalValueAtStart,
      totalValueNow,
      totalProtocolYieldUsd,
      totalPriceChangeUsd,
      totalEarnedUsd,
      totalEarnedPercent: totalEarnedPercent.toFixed(2) + '%',
    })

    return NextResponse.json({
      byAsset,
      byBackstop,
      totals: {
        valueAtStart: totalValueAtStart,
        valueNow: totalValueNow,
        protocolYieldUsd: totalProtocolYieldUsd,
        priceChangeUsd: totalPriceChangeUsd,
        totalEarnedUsd,
        totalEarnedPercent,
      },
      periodStartDate,
      periodDays,
      debug: {
        assetCount,
        backstopCount,
        priceSourceCounts,
      },
    } as PeriodYieldBreakdownResponse, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    })
  } catch (error) {
    console.error('[Period Yield API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to calculate period yield breakdown' },
      { status: 500 }
    )
  }
}
