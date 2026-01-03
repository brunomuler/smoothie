/**
 * Chart Utility Functions
 * Functions for aggregating and transforming data for the bar chart
 */

import type { ChartDataPoint, BarChartDataPoint, BarChartEvent, TimePeriod, PoolYieldBreakdown } from '@/types/balance-history'
import type { ChartDataPoint as WalletChartDataPoint } from "@/types/wallet-balance"
import type { UserAction } from '@/lib/db/types'

/**
 * Generate simple chart data with current balance for wallet display
 */
export function generateChartData(balance: number): WalletChartDataPoint[] {
  // Generate simple chart data with current balance
  const now = new Date()
  const data: WalletChartDataPoint[] = []

  // Add historical points (last 30 days)
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    data.push({
      date: date.toISOString(),
      balance: balance,
      deposit: balance * 0.9, // Approximate deposit amount
      yield: balance * 0.1, // Approximate yield
      type: i === 0 ? 'current' : 'historical',
    })
  }

  return data
}

/**
 * Get the date range for a given time period
 */
export function getDateRangeForPeriod(
  period: TimePeriod,
  firstEventDate: string | null
): { start: Date; end: Date } {
  const today = new Date()
  today.setHours(23, 59, 59, 999) // End of today

  const end = new Date(today)
  let start: Date

  switch (period) {
    case '1W':
      start = new Date(today)
      start.setDate(start.getDate() - 6)
      start.setHours(0, 0, 0, 0)
      break
    case '1M':
      start = new Date(today)
      start.setDate(start.getDate() - 29)
      start.setHours(0, 0, 0, 0)
      break
    case '1Y':
      start = new Date(today)
      start.setMonth(start.getMonth() - 11)
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
      break
    case 'All':
      if (firstEventDate) {
        start = new Date(firstEventDate)
        start.setDate(start.getDate() - 1) // Day before first event
        start.setHours(0, 0, 0, 0)
      } else {
        // Default to 1 year if no first event date
        start = new Date(today)
        start.setFullYear(start.getFullYear() - 1)
        start.setHours(0, 0, 0, 0)
      }
      break
    case 'Projection':
      start = new Date(today)
      start.setHours(0, 0, 0, 0)
      end.setFullYear(end.getFullYear() + 20)
      break
    default:
      start = new Date(today)
      start.setDate(start.getDate() - 29)
      start.setHours(0, 0, 0, 0)
  }

  return { start, end }
}

/**
 * Map user actions to events within a date range
 */
export function mapEventsToBar(
  actions: UserAction[],
  periodStart: Date,
  periodEnd: Date
): BarChartEvent[] {
  return actions
    .filter((action) => {
      const actionDate = new Date(action.ledger_closed_at)
      return actionDate >= periodStart && actionDate <= periodEnd
    })
    .map((action) => {
      // Determine amount based on action type:
      // - claim: use claim_amount
      // - backstop events: use lp_tokens
      // - regular events: use amount_underlying
      const isBackstopEvent = action.action_type.startsWith('backstop_')
      let amount: number | null = null
      if (action.action_type === 'claim') {
        amount = action.claim_amount
      } else if (isBackstopEvent) {
        amount = action.lp_tokens
      } else {
        amount = action.amount_underlying
      }

      return {
        type: action.action_type,
        date: action.ledger_closed_at,
        amount,
        assetSymbol: action.action_type === 'claim' ? 'BLND' : action.asset_symbol,
        // Backstop LP tokens use 7 decimals (already stored correctly)
        assetDecimals: action.asset_decimals,
      }
    })
}

/**
 * Format date to YYYY-MM-DD in local timezone
 */
function formatDateLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Find balance data for a specific date
 * Returns the balance that represents the END of the target day
 */
function findBalanceForDate(
  chartData: ChartDataPoint[],
  targetDate: Date
): ChartDataPoint | null {
  // Use local timezone for date comparison
  const targetStr = formatDateLocal(targetDate)

  // First try exact match - the data for a date represents END of that day
  const exactMatch = chartData.find((d) => d.date === targetStr)
  if (exactMatch) return exactMatch

  // Find the closest date BEFORE the target (not equal)
  // This is because if we don't have data for today, we use yesterday's end-of-day balance
  let closest: ChartDataPoint | null = null
  for (const point of chartData) {
    if (point.date < targetStr) {
      if (!closest || point.date > closest.date) {
        closest = point
      }
    }
  }

  return closest
}

/**
 * Find balance at end of a month
 */
function findEndOfMonthBalance(
  chartData: ChartDataPoint[],
  year: number,
  month: number
): ChartDataPoint | null {
  // Get last day of the month
  const lastDay = new Date(year, month + 1, 0)
  return findBalanceForDate(chartData, lastDay)
}

/**
 * Generate daily bars for 1W or 1M period
 */
function generateDailyBars(
  chartData: ChartDataPoint[],
  userActions: UserAction[],
  days: number,
  currentBalance: number,
  currentBorrow: number = 0
): BarChartDataPoint[] {
  const today = new Date()
  const todayStr = formatDateLocal(today)
  const bars: BarChartDataPoint[] = []

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const dateStr = formatDateLocal(date)

    const periodStart = new Date(date)
    periodStart.setHours(0, 0, 0, 0)
    const periodEnd = new Date(date)
    periodEnd.setHours(23, 59, 59, 999)

    // Find balance for this day
    const balanceData = findBalanceForDate(chartData, date)

    // For today, use current live balance
    const isToday = dateStr === todayStr
    const balance = isToday ? currentBalance : (balanceData?.total || 0)

    // For deposit, use balanceData if available, or find the most recent deposit
    let deposit = balanceData?.deposit || 0
    if (isToday && deposit === 0 && chartData.length > 0) {
      // Use the most recent deposit value from historical data
      const mostRecent = chartData[chartData.length - 1]
      deposit = mostRecent?.deposit || 0
    }

    const borrow = isToday ? currentBorrow : (balanceData?.borrow || 0)
    const yieldEarned = balance - deposit

    // Get events for this day
    const events = mapEventsToBar(userActions, periodStart, periodEnd)

    bars.push({
      period: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      balance,
      yieldEarned,
      deposit,
      borrow,
      events,
      isToday,
    })
  }

  return bars
}

/**
 * Generate monthly bars for 1Y or All period
 */
function generateMonthlyBars(
  chartData: ChartDataPoint[],
  userActions: UserAction[],
  startDate: Date,
  endDate: Date,
  currentBalance: number,
  currentBorrow: number = 0,
  currentDeposit?: number
): BarChartDataPoint[] {
  const bars: BarChartDataPoint[] = []
  const today = new Date()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()

  // Start from the first month
  const cursor = new Date(startDate)
  cursor.setDate(1)

  while (cursor <= endDate) {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()

    const periodStart = new Date(year, month, 1)
    const periodEnd = new Date(year, month + 1, 0, 23, 59, 59, 999)

    // Check if this is the current month
    const isCurrentMonth = year === currentYear && month === currentMonth

    // Find balance at end of month
    const balanceData = isCurrentMonth
      ? null // Use current balance for current month
      : findEndOfMonthBalance(chartData, year, month)

    const balance = isCurrentMonth ? currentBalance : (balanceData?.total || 0)

    // For deposit, use balanceData if available, or find the most recent deposit for current month
    // For current month: prefer currentDeposit (from SDK cost basis) over historical data
    let deposit = balanceData?.deposit || 0
    if (isCurrentMonth) {
      if (currentDeposit !== undefined && Number.isFinite(currentDeposit)) {
        // Use SDK-calculated cost basis (includes backstop)
        deposit = currentDeposit
      } else if (deposit === 0 && chartData.length > 0) {
        // Fallback to most recent historical deposit value
        const mostRecent = chartData[chartData.length - 1]
        deposit = mostRecent?.deposit || 0
      }
    }

    const borrow = isCurrentMonth ? currentBorrow : (balanceData?.borrow || 0)
    const yieldEarned = balance - deposit

    // Get events for this month
    const events = mapEventsToBar(userActions, periodStart, periodEnd)

    bars.push({
      period: cursor.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      balance,
      yieldEarned,
      deposit,
      borrow,
      events,
      isToday: isCurrentMonth,
    })

    // Move to next month
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return bars
}

/**
 * Per-pool input data for projections
 */
export interface PoolProjectionInput {
  poolId: string
  poolName: string
  balance: number       // Current balance in this pool (USD)
  supplyApy: number     // Supply APY for this pool (percentage, e.g., 8 for 8%)
  blndApy: number       // BLND emission APY for this pool (percentage)
}

/**
 * Generate projection bars for N years
 * For 1-3 years: generates monthly bars
 * For 4+ years: generates yearly bars
 * @param currentBalance - Current balance in USD
 * @param apy - Regular APY percentage (e.g., 8 for 8%)
 * @param years - Number of years to project (1-25)
 * @param currentBorrow - Current borrow amount
 * @param blndApy - BLND APY percentage (e.g., 0.91 for 0.91%)
 * @param blndReinvest - Whether BLND is reinvested (compounded) or just added as simple interest
 * @param blndCompoundFrequency - How many times per year BLND is compounded/reinvested (52 = weekly)
 * @param poolInputs - Per-pool data for breakdown calculations (optional)
 */
export function generateProjectionData(
  currentBalance: number,
  apy: number,
  years: number = 20,
  currentBorrow: number = 0,
  blndApy: number = 0,
  blndReinvest: boolean = true,
  blndCompoundFrequency: number = 52, // Weekly compounding by default
  poolInputs: PoolProjectionInput[] = []
): BarChartDataPoint[] {
  const bars: BarChartDataPoint[] = []
  const today = new Date()
  const deposit = currentBalance // Initial deposit is current balance for projections

  // Regular APY always compounds weekly (52 times/year)
  const REGULAR_COMPOUND_FREQUENCY = 52
  const regularWeeklyRate = apy / 100 / REGULAR_COMPOUND_FREQUENCY

  // Determine if we should show monthly or yearly bars
  const showMonthly = years <= 3
  const totalMonths = years * 12

  // Initialize per-pool tracking if pool inputs provided
  const hasPoolData = poolInputs.length > 0
  const poolTrackers = poolInputs.map(pool => ({
    poolId: pool.poolId,
    poolName: pool.poolName,
    initialBalance: pool.balance,
    regularOnlyBalance: pool.balance,
    actualBalance: pool.balance,
    cumulativeSimpleBlnd: 0,
    supplyApy: pool.supplyApy,
    blndApy: pool.blndApy,
    weeklyRate: pool.supplyApy / 100 / REGULAR_COMPOUND_FREQUENCY,
    blndPeriodRate: pool.blndApy / 100 / blndCompoundFrequency,
  }))

  if (showMonthly) {
    // Generate monthly bars for 1-3 years
    // Track balance with only regular APY (for comparison)
    let regularOnlyBalance = currentBalance
    // Track actual balance with both regular APY and BLND
    let actualBalance = currentBalance
    // Track cumulative simple BLND yield (when not reinvesting)
    let cumulativeSimpleBlnd = 0

    // Monthly rates
    const weeksPerMonth = REGULAR_COMPOUND_FREQUENCY / 12 // ~4.33 weeks per month
    const blndPeriodsPerMonth = blndCompoundFrequency / 12
    const blndPeriodRate = blndApy / 100 / blndCompoundFrequency
    // Regular APY rate per BLND period
    const regularPerBlndPeriod = Math.pow(1 + regularWeeklyRate, REGULAR_COMPOUND_FREQUENCY / blndCompoundFrequency) - 1

    for (let month = 1; month <= totalMonths; month++) {
      // Regular APY compounds weekly (for the "regular only" comparison)
      // Apply ~4.33 weeks of compounding per month
      for (let i = 0; i < weeksPerMonth; i++) {
        regularOnlyBalance = regularOnlyBalance * (1 + regularWeeklyRate)
        // Update per-pool trackers
        for (const tracker of poolTrackers) {
          tracker.regularOnlyBalance = tracker.regularOnlyBalance * (1 + tracker.weeklyRate)
        }
      }

      if (blndReinvest) {
        // BLND reinvested: compound at selected frequency
        // Use fractional exponent for proper compounding with any frequency
        // This handles cases where blndPeriodsPerMonth < 1 (e.g., semi-annually = 0.167)
        const combinedPeriodRate = regularPerBlndPeriod + blndPeriodRate
        actualBalance = actualBalance * Math.pow(1 + combinedPeriodRate, blndPeriodsPerMonth)
        // Update per-pool trackers
        for (const tracker of poolTrackers) {
          const poolRegularPerBlndPeriod = Math.pow(1 + tracker.weeklyRate, REGULAR_COMPOUND_FREQUENCY / blndCompoundFrequency) - 1
          tracker.actualBalance = tracker.actualBalance * Math.pow(1 + poolRegularPerBlndPeriod + tracker.blndPeriodRate, blndPeriodsPerMonth)
        }
      } else {
        // BLND not reinvested: simple interest based on balance at start of year
        // BLND yield = balance at start of year * blndApy / 12 (monthly portion)
        const monthInYear = ((month - 1) % 12) + 1

        if (monthInYear === 1) {
          // First month of a new year - calculate this year's BLND contribution
          const startOfYearBalance = month === 1 ? currentBalance : bars[month - 2].balance
          const yearlyBlnd = startOfYearBalance * (blndApy / 100)
          cumulativeSimpleBlnd += yearlyBlnd / 12 // Add monthly portion
          // Update per-pool trackers
          for (const tracker of poolTrackers) {
            const poolStartBalance = month === 1 ? tracker.initialBalance : tracker.actualBalance
            tracker.cumulativeSimpleBlnd += poolStartBalance * (tracker.blndApy / 100) / 12
          }
        } else {
          // Calculate monthly BLND based on start of year balance
          const startOfYearBar = bars[Math.floor((month - 1) / 12) * 12]
          const startOfYearBalance = startOfYearBar ? startOfYearBar.balance : currentBalance
          cumulativeSimpleBlnd += startOfYearBalance * (blndApy / 100) / 12
          // Update per-pool trackers (use their current balance for simplicity)
          for (const tracker of poolTrackers) {
            tracker.cumulativeSimpleBlnd += tracker.regularOnlyBalance * (tracker.blndApy / 100) / 12
          }
        }
        actualBalance = regularOnlyBalance + cumulativeSimpleBlnd
        // Update per-pool actual balances
        for (const tracker of poolTrackers) {
          tracker.actualBalance = tracker.regularOnlyBalance + tracker.cumulativeSimpleBlnd
        }
      }

      // Calculate yield components
      const regularYield = regularOnlyBalance - deposit
      const blndYield = actualBalance - regularOnlyBalance // Pure BLND contribution

      // Calculate per-pool breakdown
      const poolBreakdown: PoolYieldBreakdown[] = hasPoolData ? poolTrackers.map(tracker => ({
        poolId: tracker.poolId,
        poolName: tracker.poolName,
        balance: tracker.actualBalance,
        yieldEarned: tracker.regularOnlyBalance - tracker.initialBalance,
        blndYield: tracker.actualBalance - tracker.regularOnlyBalance,
      })) : undefined as any

      const futureDate = new Date(today)
      futureDate.setMonth(futureDate.getMonth() + month)

      const periodStart = new Date(futureDate.getFullYear(), futureDate.getMonth(), 1)
      const periodEnd = new Date(futureDate.getFullYear(), futureDate.getMonth() + 1, 0, 23, 59, 59, 999)

      bars.push({
        period: futureDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        balance: actualBalance,
        yieldEarned: regularYield, // Regular APY yield (weekly compounded)
        blndYield: blndYield, // Pure BLND contribution
        poolBreakdown: hasPoolData ? poolBreakdown : undefined,
        deposit,
        borrow: currentBorrow, // Keep borrow constant in projections
        events: [],
        isProjected: true,
        baseBalance: deposit, // Initial balance for overlay (constant)
      })
    }
  } else {
    // Generate yearly bars for 4+ years
    // Track balance with only regular APY (for comparison)
    let regularOnlyBalance = currentBalance
    // Track actual balance with both regular APY and BLND
    let actualBalance = currentBalance
    // Track cumulative simple BLND yield (when not reinvesting)
    let cumulativeSimpleBlnd = 0

    const blndPeriodRate = blndApy / 100 / blndCompoundFrequency
    // Regular APY rate per BLND period
    const regularPerBlndPeriod = Math.pow(1 + regularWeeklyRate, REGULAR_COMPOUND_FREQUENCY / blndCompoundFrequency) - 1

    for (let year = 1; year <= years; year++) {
      // Regular APY compounds weekly (for the "regular only" comparison)
      for (let week = 0; week < REGULAR_COMPOUND_FREQUENCY; week++) {
        regularOnlyBalance = regularOnlyBalance * (1 + regularWeeklyRate)
        // Update per-pool trackers
        for (const tracker of poolTrackers) {
          tracker.regularOnlyBalance = tracker.regularOnlyBalance * (1 + tracker.weeklyRate)
        }
      }

      if (blndReinvest) {
        // BLND reinvested: compound at selected frequency
        // Apply one year's worth of periods
        for (let period = 0; period < blndCompoundFrequency; period++) {
          actualBalance = actualBalance * (1 + regularPerBlndPeriod + blndPeriodRate)
          // Update per-pool trackers
          for (const tracker of poolTrackers) {
            const poolRegularPerBlndPeriod = Math.pow(1 + tracker.weeklyRate, REGULAR_COMPOUND_FREQUENCY / blndCompoundFrequency) - 1
            tracker.actualBalance = tracker.actualBalance * (1 + poolRegularPerBlndPeriod + tracker.blndPeriodRate)
          }
        }
      } else {
        // BLND not reinvested: simple interest based on current balance each year
        // BLND yield = balance at start of year * blndApy (no compounding of BLND)
        const startOfYearBalance = year === 1 ? currentBalance : bars[year - 2].balance
        const yearlyBlnd = startOfYearBalance * (blndApy / 100)
        cumulativeSimpleBlnd += yearlyBlnd
        actualBalance = regularOnlyBalance + cumulativeSimpleBlnd
        // Update per-pool trackers
        for (const tracker of poolTrackers) {
          const poolStartBalance = year === 1 ? tracker.initialBalance : tracker.actualBalance
          tracker.cumulativeSimpleBlnd += poolStartBalance * (tracker.blndApy / 100)
          tracker.actualBalance = tracker.regularOnlyBalance + tracker.cumulativeSimpleBlnd
        }
      }

      // Calculate yield components
      const regularYield = regularOnlyBalance - deposit
      const blndYield = actualBalance - regularOnlyBalance // Pure BLND contribution

      // Calculate per-pool breakdown
      const poolBreakdown: PoolYieldBreakdown[] = hasPoolData ? poolTrackers.map(tracker => ({
        poolId: tracker.poolId,
        poolName: tracker.poolName,
        balance: tracker.actualBalance,
        yieldEarned: tracker.regularOnlyBalance - tracker.initialBalance,
        blndYield: tracker.actualBalance - tracker.regularOnlyBalance,
      })) : undefined as any

      const futureDate = new Date(today)
      futureDate.setFullYear(futureDate.getFullYear() + year)

      const periodStart = new Date(futureDate.getFullYear(), 0, 1)
      const periodEnd = new Date(futureDate.getFullYear(), 11, 31, 23, 59, 59, 999)

      bars.push({
        period: futureDate.getFullYear().toString(),
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        balance: actualBalance,
        yieldEarned: regularYield, // Regular APY yield (weekly compounded)
        blndYield: blndYield, // Pure BLND contribution
        poolBreakdown: hasPoolData ? poolBreakdown : undefined,
        deposit,
        borrow: currentBorrow, // Keep borrow constant in projections
        events: [],
        isProjected: true,
        baseBalance: deposit, // Initial balance for overlay (constant)
      })
    }
  }

  return bars
}

/**
 * Main function to aggregate data by period
 */
/**
 * Projection settings for BLND reinvestment
 */
export interface ProjectionSettings {
  blndReinvestment: boolean
  compoundFrequency: 52 | 26 | 12 | 4 | 2 // weekly, bi-weekly, monthly, quarterly, semi-annually
  projectionYears: number // 1-25 years
}

export const DEFAULT_PROJECTION_SETTINGS: ProjectionSettings = {
  blndReinvestment: true,
  compoundFrequency: 52, // weekly
  projectionYears: 3,
}

export function aggregateDataByPeriod(
  chartData: ChartDataPoint[],
  userActions: UserAction[],
  period: TimePeriod,
  currentBalance: number,
  apy: number,
  firstEventDate: string | null,
  currentBorrow: number = 0,
  blndApy: number = 0,
  projectionSettings: ProjectionSettings = DEFAULT_PROJECTION_SETTINGS,
  poolInputs: PoolProjectionInput[] = [],
  currentDeposit?: number
): BarChartDataPoint[] {
  const { start, end } = getDateRangeForPeriod(period, firstEventDate)

  switch (period) {
    case '1W':
      return generateDailyBars(chartData, userActions, 7, currentBalance, currentBorrow)

    case '1M':
      return generateDailyBars(chartData, userActions, 30, currentBalance, currentBorrow)

    case '1Y':
      return generateMonthlyBars(chartData, userActions, start, end, currentBalance, currentBorrow, currentDeposit)

    case 'All':
      return generateMonthlyBars(chartData, userActions, start, end, currentBalance, currentBorrow, currentDeposit)

    case 'Projection':
      return generateProjectionData(
        currentBalance,
        apy,
        projectionSettings.projectionYears,
        currentBorrow,
        blndApy,
        projectionSettings.blndReinvestment,
        projectionSettings.compoundFrequency,
        poolInputs
      )

    default:
      return generateDailyBars(chartData, userActions, 30, currentBalance, currentBorrow)
  }
}

/**
 * Get icon name for action type
 */
export function getActionIcon(actionType: string): string {
  switch (actionType) {
    case 'supply':
    case 'supply_collateral':
      return 'ArrowDownCircle'
    case 'withdraw':
    case 'withdraw_collateral':
      return 'ArrowUpCircle'
    case 'borrow':
      return 'Banknote'
    case 'repay':
      return 'CheckCircle'
    case 'claim':
      return 'Gift'
    case 'liquidate':
      return 'AlertTriangle'
    default:
      return 'Circle'
  }
}

/**
 * Get color for action type
 */
export function getActionColor(actionType: string): string {
  switch (actionType) {
    case 'supply':
    case 'supply_collateral':
      return '#22c55e' // green
    case 'withdraw':
    case 'withdraw_collateral':
      return '#ef4444' // red
    case 'borrow':
      return '#f97316' // orange
    case 'repay':
      return '#3b82f6' // blue
    case 'claim':
      return '#a855f7' // purple
    case 'liquidate':
      return '#dc2626' // dark red
    case 'backstop_deposit':
    case 'backstop_withdraw':
    case 'backstop_queue_withdrawal':
    case 'backstop_dequeue_withdrawal':
    case 'backstop_claim':
      return '#a855f7' // purple (same as claim, for backstop events)
    default:
      return '#6b7280' // gray
  }
}

/**
 * Format currency for display
 */
export function formatCurrencyCompact(value: number): string {
  if (Math.abs(value) >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`
  }
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`
  }
  return `$${value.toFixed(2)}`
}
