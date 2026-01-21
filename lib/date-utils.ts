/**
 * Date Utilities
 * Centralized date manipulation functions
 *
 * TIMEZONE HANDLING:
 * - All date strings are in YYYY-MM-DD format
 * - Functions accept an optional timezone parameter for consistency
 * - When timezone is provided, dates are calculated in that timezone
 * - Default behavior uses UTC to match historical behavior
 */

/**
 * Get the user's local timezone
 * Falls back to 'UTC' on server-side rendering
 * @returns IANA timezone string (e.g., 'America/New_York', 'Europe/London')
 */
export function getUserTimezone(): string {
  if (typeof window === 'undefined') return 'UTC'
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * Get today's date in the user's local timezone as YYYY-MM-DD
 * Useful for client-side date filtering that should respect user's local time
 * @returns Date string in YYYY-MM-DD format
 */
export function getTodayInUserTimezone(): string {
  return formatDateInTimezone(new Date(), getUserTimezone())
}

/**
 * Format a date in a specific timezone as YYYY-MM-DD
 * Uses Intl.DateTimeFormat for reliable timezone conversion
 * @param date - Date object to format
 * @param timezone - IANA timezone string (e.g., 'America/New_York', 'UTC')
 * @returns Date string in YYYY-MM-DD format
 */
export function formatDateInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * Parse a YYYY-MM-DD string into UTC midnight Date
 * This avoids timezone ambiguity when parsing date strings
 * @param dateStr - Date string in YYYY-MM-DD format
 * @returns Date object at UTC midnight
 */
export function parseDateAsUTC(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

/**
 * Add days to a date string using UTC arithmetic (timezone-safe)
 * @param dateStr - Date string in YYYY-MM-DD format
 * @param days - Number of days to add (can be negative)
 * @returns New date string in YYYY-MM-DD format
 */
export function addDaysToDate(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().split('T')[0]
}

/**
 * Generate an array of all dates between start and end (inclusive)
 * Uses UTC-safe arithmetic to avoid timezone issues
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 * @returns Array of date strings in YYYY-MM-DD format
 */
export function getAllDatesBetween(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  let current = startDate

  // Use string comparison (works for YYYY-MM-DD format)
  while (current <= endDate) {
    dates.push(current)
    current = addDaysToDate(current, 1)
  }

  return dates
}

/**
 * Get today's date in YYYY-MM-DD format
 * @param timezone - Optional timezone. Defaults to UTC for backwards compatibility.
 *                   Pass user's timezone (e.g., from Intl.DateTimeFormat().resolvedOptions().timeZone)
 *                   to get today's date in their local timezone.
 * @returns Date string in YYYY-MM-DD format
 */
export function getToday(timezone: string = 'UTC'): string {
  return formatDateInTimezone(new Date(), timezone)
}

/**
 * Get the first (earliest) date from a Map's keys
 * @param dateMap - Map with date strings as keys
 * @returns The earliest date string, or undefined if map is empty
 */
export function getFirstDateFromMap<T>(dateMap: Map<string, T>): string | undefined {
  if (dateMap.size === 0) return undefined
  return Array.from(dateMap.keys()).sort()[0]
}

/**
 * Get the first (earliest) date from a Set of dates
 * @param dateSet - Set of date strings
 * @returns The earliest date string, or undefined if set is empty
 */
export function getFirstDateFromSet(dateSet: Set<string>): string | undefined {
  if (dateSet.size === 0) return undefined
  return Array.from(dateSet).sort()[0]
}

/**
 * Calculate the number of days between two dates
 * Uses UTC parsing for strings to avoid timezone issues
 * @param startDate - Start date (Date object or YYYY-MM-DD string)
 * @param endDate - End date (Date object or YYYY-MM-DD string)
 * @returns Number of days between the dates (minimum 1)
 */
export function getDaysBetween(startDate: string | Date, endDate: string | Date): number {
  // Use UTC parsing for strings to avoid timezone ambiguity
  const start = typeof startDate === 'string' ? parseDateAsUTC(startDate) : startDate
  const end = typeof endDate === 'string' ? parseDateAsUTC(endDate) : endDate
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
}

/**
 * Parse a composite key in format "poolId-assetAddress"
 * @param compositeKey - The composite key to parse
 * @returns Object with poolId and assetAddress
 */
export function parseCompositeKey(compositeKey: string): { poolId: string; assetAddress: string } {
  const parts = compositeKey.split('-')
  return {
    poolId: parts[0] || '',
    assetAddress: parts.slice(1).join('-') || '', // Handle asset addresses that might contain dashes
  }
}
