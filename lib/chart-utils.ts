/**
 * Chart Utility Functions
 * Functions for aggregating and transforming data for the bar chart
 */

import type { ChartDataPoint, BarChartDataPoint, BarChartEvent, TimePeriod } from '@/types/balance-history'
import type { UserAction } from '@/lib/db/types'

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
  currentBorrow: number = 0
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
    let deposit = balanceData?.deposit || 0
    if (isCurrentMonth && deposit === 0 && chartData.length > 0) {
      // Use the most recent deposit value from historical data
      const mostRecent = chartData[chartData.length - 1]
      deposit = mostRecent?.deposit || 0
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
 * Generate projection bars for 20 years
 */
export function generateProjectionData(
  currentBalance: number,
  apy: number,
  years: number = 20,
  currentBorrow: number = 0
): BarChartDataPoint[] {
  const bars: BarChartDataPoint[] = []
  const today = new Date()
  let projectedBalance = currentBalance
  const deposit = currentBalance // Initial deposit is current balance for projections

  for (let year = 1; year <= years; year++) {
    // Apply compound interest annually
    projectedBalance = projectedBalance * (1 + apy / 100)

    const futureDate = new Date(today)
    futureDate.setFullYear(futureDate.getFullYear() + year)

    const periodStart = new Date(futureDate.getFullYear(), 0, 1)
    const periodEnd = new Date(futureDate.getFullYear(), 11, 31, 23, 59, 59, 999)

    bars.push({
      period: futureDate.getFullYear().toString(),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      balance: projectedBalance,
      yieldEarned: projectedBalance - deposit,
      deposit,
      borrow: currentBorrow, // Keep borrow constant in projections
      events: [],
      isProjected: true,
      baseBalance: currentBalance, // Initial balance for overlay (constant)
    })
  }

  return bars
}

/**
 * Main function to aggregate data by period
 */
export function aggregateDataByPeriod(
  chartData: ChartDataPoint[],
  userActions: UserAction[],
  period: TimePeriod,
  currentBalance: number,
  apy: number,
  firstEventDate: string | null,
  currentBorrow: number = 0
): BarChartDataPoint[] {
  const { start, end } = getDateRangeForPeriod(period, firstEventDate)

  switch (period) {
    case '1W':
      return generateDailyBars(chartData, userActions, 7, currentBalance, currentBorrow)

    case '1M':
      return generateDailyBars(chartData, userActions, 30, currentBalance, currentBorrow)

    case '1Y':
      return generateMonthlyBars(chartData, userActions, start, end, currentBalance, currentBorrow)

    case 'All':
      return generateMonthlyBars(chartData, userActions, start, end, currentBalance, currentBorrow)

    case 'Projection':
      return generateProjectionData(currentBalance, apy, 20, currentBorrow)

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
