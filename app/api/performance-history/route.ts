/**
 * Performance History API Route
 * Calculates daily P&L time series using actual balance history and prices from database
 */

import { NextRequest, NextResponse } from 'next/server'
import { eventsRepository } from '@/lib/db/events-repository'
import { LP_TOKEN_ADDRESS } from '@/lib/constants'
import { getAllDatesBetween, getToday } from '@/lib/date-utils'
import { resolveWalletAddress } from '@/lib/api'

export interface DailyPnlDataPoint {
  date: string
  // Values
  portfolioValue: number      // Total portfolio value (lending + backstop)
  lendingValue: number        // Lending pools value
  backstopValue: number       // Backstop value
  // Cost basis
  costBasis: number           // Cumulative cost basis (deposits - withdrawals)
  lendingCostBasis: number
  backstopCostBasis: number
  // P&L
  unrealizedPnl: number       // portfolioValue - costBasis
  realizedPnl: number         // Cumulative claims (emissions)
  totalPnl: number            // unrealizedPnl + realizedPnl
  // Breakdown
  lendingUnrealizedPnl: number
  backstopUnrealizedPnl: number
}

export interface PerformanceHistoryResponse {
  userAddress: string
  history: DailyPnlDataPoint[]
  firstActivityDate: string | null
  currentValue: number
  currentCostBasis: number
  currentUnrealizedPnl: number
  currentRealizedPnl: number
  currentTotalPnl: number
}

/**
 * GET /api/performance-history
 *
 * Returns daily P&L time series calculated from actual database data.
 *
 * Query params:
 * - userAddress: The user's wallet address (required)
 * - days: Number of days of history (default 365)
 * - sdkPrices: JSON object of token address -> current price (for today's values)
 * - lpTokenPrice: Current LP token price from SDK
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const userAddress = searchParams.get('userAddress')
  const days = parseInt(searchParams.get('days') || '365', 10)
  const sdkPricesParam = searchParams.get('sdkPrices')
  const lpTokenPrice = parseFloat(searchParams.get('lpTokenPrice') || '0')
  const timezone = searchParams.get('timezone') || 'UTC'

  if (!userAddress) {
    return NextResponse.json(
      { error: 'Missing required parameter: userAddress' },
      { status: 400 }
    )
  }

  // Resolve demo wallet alias to real address
  const resolvedUserAddress = resolveWalletAddress(userAddress)

  try {
    // Parse SDK prices
    let sdkPrices: Record<string, number> = {}
    if (sdkPricesParam) {
      try {
        sdkPrices = JSON.parse(sdkPricesParam)
      } catch {
        // Ignore parse errors
      }
    }

    // Step 1: Get all assets the user has interacted with
    const userActions = await eventsRepository.getUserActions(resolvedUserAddress, {
      actionTypes: ['supply', 'supply_collateral', 'withdraw', 'withdraw_collateral'],
      limit: 1000,
    })

    // Collect unique assets and pool-asset pairs
    const uniqueAssets = new Set<string>()
    const poolAssetPairs = new Map<string, { poolId: string; assetAddress: string }>()

    for (const action of userActions) {
      if (!action.pool_id || !action.asset_address) continue
      uniqueAssets.add(action.asset_address)
      const key = `${action.pool_id}-${action.asset_address}`
      if (!poolAssetPairs.has(key)) {
        poolAssetPairs.set(key, { poolId: action.pool_id, assetAddress: action.asset_address })
      }
    }

    // Step 2: Get balance history for each asset IN PARALLEL
    const balanceHistoryByAsset = new Map<string, Array<{
      snapshot_date: string
      supply_balance: number
      collateral_balance: number
      pool_id: string
    }>>()

    let earliestBalanceDate: string | null = null

    // Fetch all asset histories in parallel for better performance
    const balanceHistoryPromises = Array.from(uniqueAssets).map(async (assetAddress) => {
      const { history } = await eventsRepository.getBalanceHistoryFromEvents(
        resolvedUserAddress,
        assetAddress,
        days,
        timezone
      )
      return { assetAddress, history: history as Array<{
        snapshot_date: string
        supply_balance: number
        collateral_balance: number
        pool_id: string
      }> }
    })

    const balanceHistoryResults = await Promise.all(balanceHistoryPromises)

    for (const { assetAddress, history } of balanceHistoryResults) {
      balanceHistoryByAsset.set(assetAddress, history)

      // Find the actual earliest date with balance data (not just event date)
      for (const record of history) {
        if (!earliestBalanceDate || record.snapshot_date < earliestBalanceDate) {
          earliestBalanceDate = record.snapshot_date
        }
      }
    }

    // Step 3: Get backstop balance history
    const backstopCostBases = await eventsRepository.getAllBackstopCostBases(resolvedUserAddress)
    const backstopPoolAddresses = backstopCostBases.map(cb => cb.pool_address)

    let backstopHistory: Array<{
      date: string
      pool_address: string
      lp_tokens_value: number
    }> = []

    if (backstopPoolAddresses.length > 0) {
      backstopHistory = await eventsRepository.getBackstopUserBalanceHistoryMultiplePools(
        resolvedUserAddress,
        backstopPoolAddresses,
        days,
        timezone
      )

      // Check backstop earliest balance date
      for (const record of backstopHistory) {
        if (!earliestBalanceDate || record.date < earliestBalanceDate) {
          earliestBalanceDate = record.date
        }
      }
    }

    // Step 4: Get historical prices for all assets
    const today = getToday()
    // Use earliest balance date for prices (we need prices from when we have balance data)
    const startDate = earliestBalanceDate || today

    const pricesByAsset = new Map<string, Map<string, { price: number; source: string }>>()

    for (const assetAddress of uniqueAssets) {
      const sdkPrice = sdkPrices[assetAddress] || 0
      const prices = await eventsRepository.getHistoricalPricesForDateRange(
        assetAddress,
        startDate,
        today,
        sdkPrice
      )
      pricesByAsset.set(assetAddress, prices)
    }

    // Get LP token prices
    const lpPrices = await eventsRepository.getHistoricalPricesForDateRange(
      LP_TOKEN_ADDRESS,
      startDate,
      today,
      lpTokenPrice
    )

    // Step 5: Get deposit/withdrawal events for cost basis calculation
    const depositEventsMap = await eventsRepository.getDepositEventsWithPricesBatch(
      resolvedUserAddress,
      Array.from(poolAssetPairs.values()),
      sdkPrices
    )

    // Get backstop events for cost basis
    const backstopEvents = backstopPoolAddresses.length > 0
      ? await eventsRepository.getBackstopEventsWithPrices(resolvedUserAddress, undefined, lpTokenPrice)
      : { deposits: [], withdrawals: [] }

    // Step 6: Get claim events for realized P&L
    const sdkPricesMap = new Map(Object.entries(sdkPrices))
    const realizedYieldData = await eventsRepository.getRealizedYieldData(resolvedUserAddress, sdkPricesMap)

    // Step 7: Build daily P&L time series
    const allDates = earliestBalanceDate ? getAllDatesBetween(earliestBalanceDate, today) : []

    // Track TOKEN deposits/withdrawals per asset (not USD!)
    // This matches how the existing displayPnl calculation works
    const lendingTokenEventsByAssetByDate = new Map<string, Map<string, {
      depositedTokens: number
      withdrawnTokens: number
      depositedUsd: number  // For weighted avg price calculation
    }>>()

    for (const [compositeKey, events] of depositEventsMap) {
      const assetAddress = compositeKey.split('-')[1]
      const assetEvents = lendingTokenEventsByAssetByDate.get(assetAddress) || new Map()

      for (const deposit of events.deposits) {
        const existing = assetEvents.get(deposit.date) || { depositedTokens: 0, withdrawnTokens: 0, depositedUsd: 0 }
        existing.depositedTokens += deposit.tokens
        existing.depositedUsd += deposit.usdValue
        assetEvents.set(deposit.date, existing)
      }
      for (const withdrawal of events.withdrawals) {
        const existing = assetEvents.get(withdrawal.date) || { depositedTokens: 0, withdrawnTokens: 0, depositedUsd: 0 }
        existing.withdrawnTokens += withdrawal.tokens
        assetEvents.set(withdrawal.date, existing)
      }
      lendingTokenEventsByAssetByDate.set(assetAddress, assetEvents)
    }

    // Process backstop deposits/withdrawals (LP tokens)
    const backstopTokenEventsByDate = new Map<string, {
      depositedTokens: number
      withdrawnTokens: number
      depositedUsd: number
    }>()

    for (const deposit of backstopEvents.deposits) {
      const existing = backstopTokenEventsByDate.get(deposit.date) || { depositedTokens: 0, withdrawnTokens: 0, depositedUsd: 0 }
      existing.depositedTokens += deposit.lpTokens
      existing.depositedUsd += deposit.usdValue
      backstopTokenEventsByDate.set(deposit.date, existing)
    }
    for (const withdrawal of backstopEvents.withdrawals) {
      const existing = backstopTokenEventsByDate.get(withdrawal.date) || { depositedTokens: 0, withdrawnTokens: 0, depositedUsd: 0 }
      existing.withdrawnTokens += withdrawal.lpTokens
      backstopTokenEventsByDate.set(withdrawal.date, existing)
    }

    // Process realized P&L (claims)
    let cumRealizedPnl = 0
    const claimsByDate = new Map<string, number>()
    for (const tx of realizedYieldData.transactions) {
      if (tx.type === 'claim') {
        const existing = claimsByDate.get(tx.date) || 0
        claimsByDate.set(tx.date, existing + tx.valueUsd)
      }
    }

    const realizedPnlByDate = new Map<string, number>()

    // Build cumulative TOKEN deposits/withdrawals per asset
    // Track: cumDeposited, cumWithdrawn, cumDepositedUsd (for weighted avg price)
    const cumLendingTokensByAsset = new Map<string, {
      depositedTokens: number
      withdrawnTokens: number
      depositedUsd: number
    }>()

    // Initialize from all assets
    for (const assetAddress of uniqueAssets) {
      cumLendingTokensByAsset.set(assetAddress, { depositedTokens: 0, withdrawnTokens: 0, depositedUsd: 0 })
    }

    let cumBackstopTokens = { depositedTokens: 0, withdrawnTokens: 0, depositedUsd: 0 }

    // Include events BEFORE first balance date in initial values
    const firstDate = allDates[0]
    if (firstDate) {
      // Add lending events before start date
      for (const [assetAddress, assetEvents] of lendingTokenEventsByAssetByDate) {
        const cumData = cumLendingTokensByAsset.get(assetAddress)!
        for (const [eventDate, events] of assetEvents) {
          if (eventDate < firstDate) {
            cumData.depositedTokens += events.depositedTokens
            cumData.withdrawnTokens += events.withdrawnTokens
            cumData.depositedUsd += events.depositedUsd
          }
        }
      }

      // Add backstop events before start date
      for (const [eventDate, events] of backstopTokenEventsByDate) {
        if (eventDate < firstDate) {
          cumBackstopTokens.depositedTokens += events.depositedTokens
          cumBackstopTokens.withdrawnTokens += events.withdrawnTokens
          cumBackstopTokens.depositedUsd += events.depositedUsd
        }
      }

      // Add claims before start date
      for (const [eventDate, claims] of claimsByDate) {
        if (eventDate < firstDate) {
          cumRealizedPnl += claims
        }
      }
    }

    // Build cumulative token values by date for each asset
    const lendingCumTokensByAssetByDate = new Map<string, Map<string, {
      depositedTokens: number
      withdrawnTokens: number
      depositedUsd: number
    }>>()

    const backstopCumTokensByDate = new Map<string, {
      depositedTokens: number
      withdrawnTokens: number
      depositedUsd: number
    }>()

    for (const date of allDates) {
      // Update lending cumulative tokens for each asset
      for (const [assetAddress, assetEvents] of lendingTokenEventsByAssetByDate) {
        const cumData = cumLendingTokensByAsset.get(assetAddress)!
        const dateEvents = assetEvents.get(date)
        if (dateEvents) {
          cumData.depositedTokens += dateEvents.depositedTokens
          cumData.withdrawnTokens += dateEvents.withdrawnTokens
          cumData.depositedUsd += dateEvents.depositedUsd
        }
        // Store snapshot for this date
        let assetDateMap = lendingCumTokensByAssetByDate.get(assetAddress)
        if (!assetDateMap) {
          assetDateMap = new Map()
          lendingCumTokensByAssetByDate.set(assetAddress, assetDateMap)
        }
        assetDateMap.set(date, { ...cumData })
      }

      // Update backstop cumulative tokens
      const backstopDateEvents = backstopTokenEventsByDate.get(date)
      if (backstopDateEvents) {
        cumBackstopTokens.depositedTokens += backstopDateEvents.depositedTokens
        cumBackstopTokens.withdrawnTokens += backstopDateEvents.withdrawnTokens
        cumBackstopTokens.depositedUsd += backstopDateEvents.depositedUsd
      }
      backstopCumTokensByDate.set(date, { ...cumBackstopTokens })

      // Update realized P&L
      const claims = claimsByDate.get(date)
      if (claims) {
        cumRealizedPnl += claims
      }
      realizedPnlByDate.set(date, cumRealizedPnl)
    }

    // Pre-process balance history to create lookup maps with carry-forward values
    // For each asset, create a map of date -> balance that carries forward the last known value
    const lendingBalanceByDateByAsset = new Map<string, Map<string, number>>()
    for (const [assetAddress, balanceHistory] of balanceHistoryByAsset) {
      const sortedHistory = [...balanceHistory].sort((a, b) =>
        a.snapshot_date.localeCompare(b.snapshot_date)
      )
      const balanceByDate = new Map<string, number>()
      let lastBalance = 0
      let historyIndex = 0

      for (const date of allDates) {
        // Find the most recent balance record on or before this date
        while (historyIndex < sortedHistory.length &&
               sortedHistory[historyIndex].snapshot_date <= date) {
          const record = sortedHistory[historyIndex]
          lastBalance = (record.supply_balance || 0) + (record.collateral_balance || 0)
          historyIndex++
        }
        balanceByDate.set(date, lastBalance)
      }
      lendingBalanceByDateByAsset.set(assetAddress, balanceByDate)
    }

    // Pre-process backstop history - group by pool and date, then carry forward
    const backstopLpTokensByPoolByDate = new Map<string, Map<string, number>>()
    for (const record of backstopHistory) {
      const poolMap = backstopLpTokensByPoolByDate.get(record.pool_address) || new Map<string, number>()
      poolMap.set(record.date, record.lp_tokens_value || 0)
      backstopLpTokensByPoolByDate.set(record.pool_address, poolMap)
    }

    // For each pool, carry forward balances
    const backstopCarriedByPoolByDate = new Map<string, Map<string, number>>()
    for (const [poolAddress, dateMap] of backstopLpTokensByPoolByDate) {
      const carriedMap = new Map<string, number>()
      let lastValue = 0
      for (const date of allDates) {
        if (dateMap.has(date)) {
          lastValue = dateMap.get(date)!
        }
        carriedMap.set(date, lastValue)
      }
      backstopCarriedByPoolByDate.set(poolAddress, carriedMap)
    }

    // Build history array using TOKEN-BASED P&L calculation
    // This matches the existing displayPnl calculation:
    // protocolYield = (balance - netDepositedTokens) × price
    // totalPnl = protocolYield + realizedClaims
    const history: DailyPnlDataPoint[] = []

    for (const date of allDates) {
      // Calculate lending protocol yield for this date
      let lendingValue = 0
      let lendingProtocolYield = 0
      let lendingCostBasis = 0

      for (const [assetAddress, balanceByDate] of lendingBalanceByDateByAsset) {
        const prices = pricesByAsset.get(assetAddress)
        const priceData = prices?.get(date)
        const price = priceData?.price || 0
        const balance = balanceByDate.get(date) || 0

        // Get cumulative token deposits/withdrawals for this asset on this date
        const assetCumTokens = lendingCumTokensByAssetByDate.get(assetAddress)
        const cumTokens = assetCumTokens?.get(date) || { depositedTokens: 0, withdrawnTokens: 0, depositedUsd: 0 }

        const netDepositedTokens = cumTokens.depositedTokens - cumTokens.withdrawnTokens
        const earnedTokens = balance - netDepositedTokens

        // Protocol yield = earned tokens × current price
        const protocolYieldUsd = earnedTokens * price

        lendingValue += balance * price
        lendingProtocolYield += protocolYieldUsd
        lendingCostBasis += cumTokens.depositedUsd // Track cost basis in USD for reference
      }

      // Calculate backstop protocol yield for this date
      let backstopValue = 0
      let backstopProtocolYield = 0
      let backstopCostBasis = 0

      const lpPriceData = lpPrices.get(date)
      const lpPrice = lpPriceData?.price || 0

      // Sum backstop LP tokens across all pools
      let totalBackstopLpTokens = 0
      for (const [, carriedMap] of backstopCarriedByPoolByDate) {
        const lpTokens = carriedMap.get(date) || 0
        totalBackstopLpTokens += lpTokens
      }

      const backstopCumTokens = backstopCumTokensByDate.get(date) || { depositedTokens: 0, withdrawnTokens: 0, depositedUsd: 0 }
      const netBackstopDepositedTokens = backstopCumTokens.depositedTokens - backstopCumTokens.withdrawnTokens
      const backstopEarnedTokens = totalBackstopLpTokens - netBackstopDepositedTokens

      backstopValue = totalBackstopLpTokens * lpPrice
      backstopProtocolYield = backstopEarnedTokens * lpPrice
      backstopCostBasis = backstopCumTokens.depositedUsd

      const portfolioValue = lendingValue + backstopValue
      const costBasis = lendingCostBasis + backstopCostBasis
      const realizedPnl = realizedPnlByDate.get(date) || 0

      // Unrealized P&L = protocol yield (tokens earned × price)
      const lendingUnrealizedPnl = lendingProtocolYield
      const backstopUnrealizedPnl = backstopProtocolYield
      const unrealizedPnl = lendingProtocolYield + backstopProtocolYield

      // Total P&L = unrealized (protocol yield) + realized (claims)
      const totalPnl = unrealizedPnl + realizedPnl

      history.push({
        date,
        portfolioValue,
        lendingValue,
        backstopValue,
        costBasis,
        lendingCostBasis,
        backstopCostBasis,
        unrealizedPnl,
        realizedPnl,
        totalPnl,
        lendingUnrealizedPnl,
        backstopUnrealizedPnl,
      })
    }

    // Get current values from the last entry
    const lastEntry = history[history.length - 1]

    return NextResponse.json({
      userAddress,
      history,
      firstActivityDate: earliestBalanceDate,
      currentValue: lastEntry?.portfolioValue || 0,
      currentCostBasis: lastEntry?.costBasis || 0,
      currentUnrealizedPnl: lastEntry?.unrealizedPnl || 0,
      currentRealizedPnl: lastEntry?.realizedPnl || 0,
      currentTotalPnl: lastEntry?.totalPnl || 0,
    } as PerformanceHistoryResponse, {
      headers: {
        // 5 minute cache - historical data changes infrequently
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    })
  } catch (error) {
    console.error('[Performance History API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to calculate performance history', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
