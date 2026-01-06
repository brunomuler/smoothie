/**
 * Balance History Utility Functions
 * Helper functions for processing and transforming balance history data
 */

import {
  BalanceHistoryRecord,
  ChartDataPoint,
  PositionChange,
  EarningsStats,
  POOL_NAMES,
} from '@/types/balance-history'

// ============================================
// HISTORICAL YIELD BREAKDOWN TYPES
// ============================================

export interface DepositEvent {
  date: string
  tokens: number
  priceAtDeposit: number
  usdValue: number
  poolId?: string
  priceSource?: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback'
}

export interface HistoricalYieldBreakdown {
  // Cost basis (what you paid) - uses AVERAGE COST METHOD
  costBasisHistorical: number      // Cost of remaining tokens at average deposit price
  weightedAvgDepositPrice: number  // Actual average price paid for all deposits
  netDepositedTokens: number       // Tokens deposited - withdrawn

  // Protocol yield (what you earned from lending/backstop)
  protocolYieldTokens: number      // Tokens earned = balance - netDeposited
  protocolYieldUsd: number         // Yield tokens × current price

  // Price change (market performance on deposits)
  priceChangeUsd: number           // Can be positive or negative
  priceChangePercent: number       // % change from deposit price to current

  // Combined totals
  currentValueUsd: number          // balance × current price
  totalEarnedUsd: number           // currentValue - costBasis = yield + priceChange
  totalEarnedPercent: number
}

// ============================================
// BORROW COST BREAKDOWN TYPES
// ============================================

export interface BorrowEvent {
  date: string
  tokens: number
  priceAtBorrow: number
  usdValue: number
  poolId?: string
  priceSource?: 'daily_token_prices' | 'forward_fill' | 'sdk_fallback'
}

/**
 * Borrow Cost Breakdown - calculates how much the user owes and how much is interest
 *
 * Key concepts for borrowing (inverse of supply):
 * - Cost basis = net borrowed amount at original prices (what you borrowed)
 * - Interest accrued = current debt - cost basis (what you owe beyond principal)
 * - Price change on debt: if price goes UP, debt value goes UP = bad for borrower
 *
 * Formula:
 * - borrowCostBasis = (total borrowed - total repaid) at weighted avg borrow price
 * - interestAccruedTokens = currentDebt - netBorrowedTokens
 * - interestAccruedUsd = interestAccruedTokens × currentPrice
 * - priceChangeOnDebt = netBorrowedTokens × (currentPrice - avgBorrowPrice)
 *   (positive = price went up = BAD for borrower, debt is more expensive to repay)
 */
export interface HistoricalBorrowBreakdown {
  // Cost basis (what you borrowed) - uses AVERAGE COST METHOD
  borrowCostBasisUsd: number       // USD value of net borrowed amount at borrow-time prices
  weightedAvgBorrowPrice: number   // Actual average price when tokens were borrowed
  netBorrowedTokens: number        // Tokens borrowed - repaid (principal outstanding)

  // Interest accrued (protocol cost)
  interestAccruedTokens: number    // Tokens owed beyond principal = currentDebt - netBorrowed
  interestAccruedUsd: number       // Interest tokens × current price

  // Price change on debt (market impact)
  // Note: For borrowers, price increase is BAD (debt becomes more expensive)
  priceChangeOnDebtUsd: number     // netBorrowed × (currentPrice - avgBorrowPrice)
  priceChangePercent: number       // % change from borrow price to current

  // Current debt totals
  currentDebtTokens: number        // Current outstanding debt from SDK
  currentDebtUsd: number           // currentDebt × current price

  // Total cost (negative = cost to user)
  // totalCostUsd = interestAccruedUsd + priceChangeOnDebtUsd
  // (both positive values represent costs to borrower)
  totalCostUsd: number
  totalCostPercent: number
}

/**
 * Calculate yield breakdown separating protocol earnings from price changes.
 * Uses AVERAGE COST METHOD for accurate cost basis calculation.
 *
 * Key insight:
 * - Avg deposit price = total USD deposited / total tokens deposited
 * - Cost basis = remaining tokens × avg deposit price (withdrawals reduce at avg cost)
 * - Current value = current balance × current SDK price
 * - Protocol yield = tokens earned (balance - net deposits) × current price
 * - Price change = net deposited tokens × (current price - avg deposit price)
 *
 * This method ensures the "weighted average price" shown to users matches
 * the actual price they paid, rather than inflated values caused by
 * withdrawals at different market prices.
 *
 * Same-day deposits are treated specially: they use current SDK price for cost basis
 * to avoid showing misleading P&L from intraday price fluctuations (we only have
 * daily price data, so same-day P&L would be noise).
 *
 * @param currentBalance Current token balance from SDK
 * @param currentPrice Current token price from SDK (ALWAYS use SDK, not DB)
 * @param deposits All deposits with historical prices from daily_token_prices
 * @param withdrawals All withdrawals with historical prices
 */
export function calculateHistoricalYieldBreakdown(
  currentBalance: number,
  currentPrice: number,
  deposits: DepositEvent[],
  withdrawals: DepositEvent[],
): HistoricalYieldBreakdown {
  // Get today's date in YYYY-MM-DD format (same format as deposit dates)
  const today = new Date().toISOString().split('T')[0]

  // Separate same-day deposits from historical deposits
  // Same-day deposits use current price for cost basis to avoid misleading P&L
  const historicalDeposits = deposits.filter(d => d.date !== today)
  const sameDayDeposits = deposits.filter(d => d.date === today)

  // For same-day deposits, recalculate USD value using current price
  // This ensures cost basis = current value, resulting in $0 price change
  const sameDayDepositsAdjusted = sameDayDeposits.map(d => ({
    ...d,
    priceAtDeposit: currentPrice,
    usdValue: d.tokens * currentPrice,
  }))

  // Combine historical and adjusted same-day deposits
  const adjustedDeposits = [...historicalDeposits, ...sameDayDepositsAdjusted]

  // 1. Calculate totals
  const totalDepositedUsd = adjustedDeposits.reduce((sum, d) => sum + d.usdValue, 0)
  const totalDepositedTokens = adjustedDeposits.reduce((sum, d) => sum + d.tokens, 0)
  const totalWithdrawnTokens = withdrawals.reduce((sum, w) => sum + w.tokens, 0)
  const netDepositedTokens = totalDepositedTokens - totalWithdrawnTokens

  // 2. Calculate weighted average deposit price (AVERAGE COST METHOD)
  // This is the actual average price paid for deposits, regardless of withdrawals
  const weightedAvgDepositPrice = totalDepositedTokens > 0
    ? totalDepositedUsd / totalDepositedTokens
    : currentPrice // Fallback to current if no deposits

  // 3. Calculate cost basis using AVERAGE COST METHOD
  // Withdrawals reduce cost basis at the average deposit price, not at withdrawal-time market price
  // This prevents confusing "average prices" that exceed the asset's historical max price
  const costRemovedByWithdrawals = totalWithdrawnTokens * weightedAvgDepositPrice
  const costBasisHistorical = totalDepositedUsd - costRemovedByWithdrawals

  // 4. Calculate protocol yield (tokens earned from APY)
  const protocolYieldTokens = currentBalance - netDepositedTokens
  const protocolYieldUsd = protocolYieldTokens * currentPrice

  // 5. Calculate price change on deposited tokens
  // This is how much the VALUE of your deposits changed due to price movement
  const depositValueAtCurrentPrice = netDepositedTokens * currentPrice
  const priceChangeUsd = depositValueAtCurrentPrice - costBasisHistorical
  const priceChangePercent = costBasisHistorical > 0
    ? (priceChangeUsd / costBasisHistorical) * 100
    : 0

  // 6. Calculate totals
  const currentValueUsd = currentBalance * currentPrice
  const totalEarnedUsd = currentValueUsd - costBasisHistorical
  // Note: totalEarnedUsd = protocolYieldUsd + priceChangeUsd (they should sum up)

  return {
    // Cost basis
    costBasisHistorical,
    weightedAvgDepositPrice,
    netDepositedTokens,

    // Protocol yield (what you earned from lending)
    protocolYieldTokens,
    protocolYieldUsd,

    // Price change (market movement, can be negative)
    priceChangeUsd,
    priceChangePercent,

    // Totals
    currentValueUsd,
    totalEarnedUsd,
    totalEarnedPercent: costBasisHistorical > 0
      ? (totalEarnedUsd / costBasisHistorical) * 100
      : 0,
  }
}

/**
 * Period-specific yield breakdown - calculates yield for a specific time period
 * rather than all-time.
 *
 * Key formulas:
 * - Protocol Yield (period) = (tokens_now - tokens_at_period_start) × price_now
 * - Price Change (period) = tokens_at_period_start × (price_now - price_at_period_start)
 * - Total Earned (period) = Protocol Yield + Price Change
 */
export interface PeriodYieldBreakdown {
  // What you started with at period start
  tokensAtStart: number
  valueAtStart: number  // tokens_at_start × price_at_start
  priceAtStart: number

  // What you have now
  tokensNow: number
  valueNow: number  // tokens_now × price_now
  priceNow: number

  // Period-specific earnings
  protocolYieldTokens: number  // tokens_now - tokens_at_start
  protocolYieldUsd: number     // protocol_yield_tokens × price_now
  priceChangeUsd: number       // tokens_at_start × (price_now - price_at_start)
  totalEarnedUsd: number       // protocol_yield + price_change
  totalEarnedPercent: number   // total_earned / value_at_start
}

/**
 * Calculate period-specific yield breakdown.
 *
 * @param tokensAtStart Token balance at period start (from history)
 * @param priceAtStart Token price at period start (from historical prices)
 * @param tokensNow Current token balance (from SDK)
 * @param priceNow Current token price (from SDK)
 */
export function calculatePeriodYieldBreakdown(
  tokensAtStart: number,
  priceAtStart: number,
  tokensNow: number,
  priceNow: number,
): PeriodYieldBreakdown {
  // Value at period start
  const valueAtStart = tokensAtStart * priceAtStart

  // Value now
  const valueNow = tokensNow * priceNow

  // Protocol yield: tokens earned during period × current price
  const protocolYieldTokens = tokensNow - tokensAtStart
  const protocolYieldUsd = protocolYieldTokens * priceNow

  // Price change: how much the starting tokens changed in value due to price movement
  const priceChangeUsd = tokensAtStart * (priceNow - priceAtStart)

  // Total earned for the period
  const totalEarnedUsd = protocolYieldUsd + priceChangeUsd
  // Note: totalEarnedUsd should equal (valueNow - valueAtStart)

  // Percentage gain
  const totalEarnedPercent = valueAtStart > 0
    ? (totalEarnedUsd / valueAtStart) * 100
    : 0

  return {
    tokensAtStart,
    valueAtStart,
    priceAtStart,
    tokensNow,
    valueNow,
    priceNow,
    protocolYieldTokens,
    protocolYieldUsd,
    priceChangeUsd,
    totalEarnedUsd,
    totalEarnedPercent,
  }
}

/**
 * Calculate borrow cost breakdown separating interest from price changes.
 * Uses AVERAGE COST METHOD for accurate cost basis calculation.
 *
 * Key insight for borrowing (inverse of supply):
 * - When you borrow, you take on debt at the borrow-time price
 * - Interest accrues in tokens, increasing your debt
 * - Price changes affect how expensive it is to repay:
 *   - If price goes UP: your debt is worth more → BAD for borrower
 *   - If price goes DOWN: your debt is cheaper to repay → GOOD for borrower
 *
 * This is the INVERSE of supply where price up = good.
 *
 * Same-day borrows are treated specially: they use current SDK price for cost basis
 * to avoid showing misleading P&L from intraday price fluctuations.
 *
 * @param currentDebt Current debt token balance from SDK
 * @param currentPrice Current token price from SDK (ALWAYS use SDK, not DB)
 * @param borrows All borrows with historical prices from daily_token_prices
 * @param repays All repays with historical prices
 */
export function calculateHistoricalBorrowBreakdown(
  currentDebt: number,
  currentPrice: number,
  borrows: BorrowEvent[],
  repays: BorrowEvent[],
): HistoricalBorrowBreakdown {
  // Get today's date in YYYY-MM-DD format (same format as borrow dates)
  const today = new Date().toISOString().split('T')[0]

  // Separate same-day borrows from historical borrows
  // Same-day borrows use current price for cost basis to avoid misleading P&L
  const historicalBorrows = borrows.filter(b => b.date !== today)
  const sameDayBorrows = borrows.filter(b => b.date === today)

  // For same-day borrows, recalculate USD value using current price
  const sameDayBorrowsAdjusted = sameDayBorrows.map(b => ({
    ...b,
    priceAtBorrow: currentPrice,
    usdValue: b.tokens * currentPrice,
  }))

  // Combine historical and adjusted same-day borrows
  const adjustedBorrows = [...historicalBorrows, ...sameDayBorrowsAdjusted]

  // 1. Calculate totals
  const totalBorrowedUsd = adjustedBorrows.reduce((sum, b) => sum + b.usdValue, 0)
  const totalBorrowedTokens = adjustedBorrows.reduce((sum, b) => sum + b.tokens, 0)
  const totalRepaidTokens = repays.reduce((sum, r) => sum + r.tokens, 0)
  const netBorrowedTokens = totalBorrowedTokens - totalRepaidTokens

  // 2. Calculate weighted average borrow price (AVERAGE COST METHOD)
  // This is the actual average price when borrows were taken out
  const weightedAvgBorrowPrice = totalBorrowedTokens > 0
    ? totalBorrowedUsd / totalBorrowedTokens
    : currentPrice // Fallback to current if no borrows

  // 3. Calculate borrow cost basis using AVERAGE COST METHOD
  // Repays reduce the cost basis at the average borrow price
  const costRemovedByRepays = totalRepaidTokens * weightedAvgBorrowPrice
  const borrowCostBasisUsd = totalBorrowedUsd - costRemovedByRepays

  // 4. Calculate interest accrued (tokens owed beyond principal)
  const interestAccruedTokens = currentDebt - netBorrowedTokens
  const interestAccruedUsd = interestAccruedTokens * currentPrice

  // 5. Calculate price change on debt
  // IMPORTANT: For borrowers, price increase is BAD (debt is more expensive to repay)
  // This is the opposite of supply where price increase is good
  const debtValueAtBorrowPrice = netBorrowedTokens * weightedAvgBorrowPrice
  const debtValueAtCurrentPrice = netBorrowedTokens * currentPrice
  const priceChangeOnDebtUsd = debtValueAtCurrentPrice - debtValueAtBorrowPrice
  // positive = price went up = debt is more expensive = BAD for borrower
  const priceChangePercent = borrowCostBasisUsd > 0
    ? (priceChangeOnDebtUsd / borrowCostBasisUsd) * 100
    : 0

  // 6. Calculate current debt totals
  const currentDebtUsd = currentDebt * currentPrice

  // 7. Calculate total cost to borrower
  // Both interest and price increase are costs to the borrower
  const totalCostUsd = interestAccruedUsd + priceChangeOnDebtUsd
  const totalCostPercent = borrowCostBasisUsd > 0
    ? (totalCostUsd / borrowCostBasisUsd) * 100
    : 0

  return {
    // Cost basis
    borrowCostBasisUsd,
    weightedAvgBorrowPrice,
    netBorrowedTokens,

    // Interest accrued (protocol cost)
    interestAccruedTokens,
    interestAccruedUsd,

    // Price change on debt (market impact)
    priceChangeOnDebtUsd,
    priceChangePercent,

    // Current debt totals
    currentDebtTokens: currentDebt,
    currentDebtUsd,

    // Total cost
    totalCostUsd,
    totalCostPercent,
  }
}

/**
 * Calculate yield breakdown for backstop LP positions.
 * Same logic as regular assets but for LP tokens.
 */
export function calculateBackstopYieldBreakdown(
  currentLpTokens: number,
  currentLpPrice: number,  // From SDK
  deposits: Array<{ lpTokens: number; priceAtDeposit: number; usdValue: number }>,
  withdrawals: Array<{ lpTokens: number; priceAtWithdrawal: number; usdValue: number }>,
): HistoricalYieldBreakdown {
  // Convert to standard DepositEvent format
  const depositEvents: DepositEvent[] = deposits.map(d => ({
    date: '',
    tokens: d.lpTokens,
    priceAtDeposit: d.priceAtDeposit,
    usdValue: d.usdValue,
  }))

  const withdrawalEvents: DepositEvent[] = withdrawals.map(w => ({
    date: '',
    tokens: w.lpTokens,
    priceAtDeposit: w.priceAtWithdrawal,
    usdValue: w.usdValue,
  }))

  return calculateHistoricalYieldBreakdown(
    currentLpTokens,
    currentLpPrice,
    depositEvents,
    withdrawalEvents,
  )
}

/**
 * Transform balance history records into chart data
 * Backend now handles forward-fill with rate recalculation
 */
export function fillMissingDates(
  records: BalanceHistoryRecord[],
  includeBaselineDay: boolean = true,
  firstEventDate: string | null = null,
): ChartDataPoint[] {
  if (records.length === 0) {
    return []
  }

  // Group records by date and pool
  const datePoolMap = new Map<
    string,
    Map<string, BalanceHistoryRecord>
  >()

  records.forEach((record) => {
    if (!datePoolMap.has(record.snapshot_date)) {
      datePoolMap.set(record.snapshot_date, new Map())
    }
    datePoolMap
      .get(record.snapshot_date)!
      .set(record.pool_id, record)
  })

  // Get all dates and sort
  const allDates = Array.from(datePoolMap.keys()).sort()

  // Add a $0 baseline day before the first data point (only if this IS the first-ever event)
  // This ensures we only show $0 at the very beginning of the pool history, not at the start of filtered views
  if (includeBaselineDay && allDates.length > 0 && firstEventDate) {
    const firstDateInRecords = allDates[0]

    // Only add baseline if the first date in our records matches the absolute first event date
    if (firstDateInRecords === firstEventDate) {
      const firstDate = new Date(allDates[0])
      const dayBefore = new Date(firstDate)
      dayBefore.setDate(dayBefore.getDate() - 1)
      // Use local date formatting to avoid UTC conversion issues
      const year = dayBefore.getFullYear()
      const month = String(dayBefore.getMonth() + 1).padStart(2, '0')
      const day = String(dayBefore.getDate()).padStart(2, '0')
      const dayBeforeStr = `${year}-${month}-${day}`

      // Add empty pool map for the day before (will show $0)
      datePoolMap.set(dayBeforeStr, new Map())
      allDates.unshift(dayBeforeStr)
    }
  }

  // Calculate initial deposit amount from first data point (skip $0 baseline if it exists)
  const firstRealDate = includeBaselineDay && allDates.length > 1 ? allDates[1] : allDates[0]
  const firstDateRecords = datePoolMap.get(firstRealDate)!

  // Track cumulative deposits per pool (bTokens and initial b_rate)
  const poolBTokens = new Map<string, number>()
  const poolInitialBRate = new Map<string, number>()
  // Track if we have Dune cost_basis data (to avoid recalculating)
  const poolHasCostBasis = new Map<string, boolean>()
  firstDateRecords.forEach((record, poolId) => {
    const totalBTokens = record.supply_btokens + record.collateral_btokens
    poolBTokens.set(poolId, totalBTokens)
    poolInitialBRate.set(poolId, record.b_rate)
    const hasCostBasis = record.total_cost_basis !== undefined && record.total_cost_basis !== null
    poolHasCostBasis.set(poolId, hasCostBasis)
  })

  // Build chart data - backend already filled missing dates with recalculated rates
  const chartData: ChartDataPoint[] = allDates.map((date, index) => {
    const dateRecords = datePoolMap.get(date)!
    const pools: ChartDataPoint['pools'] = []
    let total = 0
    let totalDeposit = 0
    let totalBorrow = 0

    dateRecords.forEach((record, poolId) => {
      // Use supply + collateral only (don't subtract debt for the chart)
      // This matches the SDK's totalSupplyUsd which doesn't deduct borrowed amounts
      const balance = record.supply_balance + record.collateral_balance
      const borrow = record.debt_balance

      // Update tracked bTokens if there's a change (deposit/withdrawal)
      const currentBTokens = record.supply_btokens + record.collateral_btokens
      const trackedBTokens = poolBTokens.get(poolId) || 0

      // If bTokens changed, update tracking (this is a deposit or withdrawal)
      if (Math.abs(currentBTokens - trackedBTokens) > 0.0001) {
        poolBTokens.set(poolId, currentBTokens)
        // Update initial b_rate for the new position
        poolInitialBRate.set(poolId, record.b_rate)
      }

      // Use Dune cost_basis if available, otherwise calculate from bTokens
      let depositAmount: number
      const useDuneCostBasis = poolHasCostBasis.get(poolId) && record.total_cost_basis !== undefined && record.total_cost_basis !== null

      if (useDuneCostBasis) {
        // Use Dune's pre-calculated cost basis
        depositAmount = record.total_cost_basis!
      } else {
        // Fallback: calculate deposit amount using INITIAL b_rate (at time of deposit)
        const initialRate = poolInitialBRate.get(poolId) || record.b_rate
        depositAmount = (poolBTokens.get(poolId) || 0) * initialRate
      }
      totalDeposit += depositAmount
      totalBorrow += borrow

      pools.push({
        poolId,
        poolName: getPoolName(poolId),
        balance,
        deposit: depositAmount,
        yield: record.total_yield || 0, // Use Dune's pre-calculated yield
        borrow,
      })
      total += balance
    })

    const yield_amount = total - totalDeposit

    return {
      date,
      formattedDate: formatChartDate(date),
      timestamp: new Date(date).getTime(),
      pool_yieldblox:
        pools.find(
          (p) =>
            p.poolId ===
            'CCCCIQSDILITHMM7PBSLVDT5MISSY7R26MNZXCX4H7J5JQ5FPIYOGYFS',
        )?.balance || 0,
      pool_blend:
        pools.find(
          (p) =>
            p.poolId ===
            'CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD',
        )?.balance || 0,
      total,
      deposit: totalDeposit,
      yield: yield_amount,
      borrow: totalBorrow,
      pools,
    }
  })

  return chartData
}

/**
 * Detect position changes (deposits/withdrawals)
 * Compares btokens between consecutive days
 */
export function detectPositionChanges(
  records: BalanceHistoryRecord[],
  threshold: number = 0.01,
): PositionChange[] {
  if (records.length <= 1) {
    return []
  }

  const changes: PositionChange[] = []

  // Sort by date and ledger sequence
  const sorted = [...records].sort((a, b) => {
    const dateComp = a.snapshot_date.localeCompare(
      b.snapshot_date,
    )
    if (dateComp !== 0) return dateComp
    return a.ledger_sequence - b.ledger_sequence
  })

  // Group by date
  const byDate = new Map<string, BalanceHistoryRecord[]>()
  sorted.forEach((record) => {
    if (!byDate.has(record.snapshot_date)) {
      byDate.set(record.snapshot_date, [])
    }
    byDate.get(record.snapshot_date)!.push(record)
  })

  const dates = Array.from(byDate.keys()).sort()

  // Compare consecutive dates
  for (let i = 1; i < dates.length; i++) {
    const prevDate = dates[i - 1]
    const currDate = dates[i]

    const prevRecords = byDate.get(prevDate)!
    const currRecords = byDate.get(currDate)!

    // Sum up positions by pool
    const prevSums = {
      supply: prevRecords.reduce(
        (sum, r) => sum + r.supply_btokens,
        0,
      ),
      collateral: prevRecords.reduce(
        (sum, r) => sum + r.collateral_btokens,
        0,
      ),
      debt: prevRecords.reduce(
        (sum, r) => sum + r.liabilities_dtokens,
        0,
      ),
    }

    const currSums = {
      supply: currRecords.reduce(
        (sum, r) => sum + r.supply_btokens,
        0,
      ),
      collateral: currRecords.reduce(
        (sum, r) => sum + r.collateral_btokens,
        0,
      ),
      debt: currRecords.reduce(
        (sum, r) => sum + r.liabilities_dtokens,
        0,
      ),
    }

    const supplyChange = currSums.supply - prevSums.supply
    const collateralChange =
      currSums.collateral - prevSums.collateral
    const debtChange = currSums.debt - prevSums.debt

    // Check if changes are significant
    const isSignificant =
      Math.abs(supplyChange) > threshold ||
      Math.abs(collateralChange) > threshold ||
      Math.abs(debtChange) > threshold

    if (isSignificant) {
      const prevTotal = prevRecords.reduce(
        (sum, r) => sum + r.net_balance,
        0,
      )
      const currTotal = currRecords.reduce(
        (sum, r) => sum + r.net_balance,
        0,
      )

      changes.push({
        index: i,
        date: currDate,
        supplyChange,
        collateralChange,
        debtChange,
        netChange: currTotal - prevTotal,
        isSignificant,
      })
    }
  }

  return changes
}

/**
 * Calculate earnings statistics PER POOL
 * Interest is calculated from rate changes, not balance changes
 */
export function calculateEarningsStats(
  chartData: ChartDataPoint[],
  positionChanges: PositionChange[],
): EarningsStats {
  if (chartData.length <= 1) {
    return {
      totalInterest: 0,
      currentAPY: 0,
      avgDailyInterest: 0,
      projectedAnnual: 0,
      dayCount: 0,
      avgPosition: 0,
      perPool: {},
    }
  }

  const dayCount = chartData.length - 1
  const perPool: Record<string, {
    totalInterest: number
    currentAPY: number
    avgDailyInterest: number
    projectedAnnual: number
    avgPosition: number
  }> = {}

  // Get all unique pool IDs
  const poolIds = new Set<string>()
  chartData.forEach(point => {
    point.pools.forEach(pool => poolIds.add(pool.poolId))
  })

  // Calculate stats for each pool separately
  poolIds.forEach(poolId => {
    // Find latest yield from Dune and latest balance for this pool
    let totalInterest = 0 // This will be Dune's total_yield
    let latestBalance = 0
    let totalPosition = 0
    let dataPoints = 0

    for (let i = 0; i < chartData.length; i++) {
      const currPool = chartData[i].pools.find(p => p.poolId === poolId)
      if (currPool) {
        // Use Dune's pre-calculated yield (total_yield field)
        totalInterest = currPool.yield
        latestBalance = currPool.balance
        totalPosition += currPool.balance
        dataPoints++
      }
    }

    const avgPosition = dataPoints > 0 ? totalPosition / dataPoints : 0
    const avgDailyInterest = totalInterest / dayCount

    // Calculate APY
    const apy = avgPosition > 0
      ? (totalInterest / avgPosition) * (365 / dayCount) * 100
      : 0

    // Projected annual (using latestBalance from loop above)
    const projectedAnnual = (latestBalance * apy) / 100

    perPool[poolId] = {
      totalInterest,
      currentAPY: apy,
      avgDailyInterest,
      projectedAnnual,
      avgPosition,
    }
  })

  // Calculate combined stats
  const totalInterest = Object.values(perPool).reduce((sum, p) => sum + p.totalInterest, 0)
  const avgDailyInterest = totalInterest / dayCount

  const totalPosition = Object.values(perPool).reduce((sum, p) => sum + p.avgPosition, 0)
  const combinedAPY = totalPosition > 0
    ? (totalInterest / totalPosition) * (365 / dayCount) * 100
    : 0

  const latestBalance = chartData[chartData.length - 1].total
  const projectedAnnual = (latestBalance * combinedAPY) / 100

  return {
    totalInterest,
    currentAPY: combinedAPY,
    avgDailyInterest,
    projectedAnnual,
    dayCount,
    avgPosition: totalPosition,
    perPool,
  }
}

/**
 * Group balance records by date
 */
export function groupByDate(
  records: BalanceHistoryRecord[],
): Map<string, BalanceHistoryRecord[]> {
  const grouped = new Map<string, BalanceHistoryRecord[]>()

  records.forEach((record) => {
    if (!grouped.has(record.snapshot_date)) {
      grouped.set(record.snapshot_date, [])
    }
    grouped.get(record.snapshot_date)!.push(record)
  })

  return grouped
}

/**
 * Get human-readable pool name
 */
export function getPoolName(poolId: string): string {
  return POOL_NAMES[poolId] || poolId.slice(0, 8) + '...'
}

/**
 * Format date for chart display
 */
export function formatChartDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Format currency value
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * Format number with commas
 */
export function formatNumber(num: number, decimals: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num)
}
