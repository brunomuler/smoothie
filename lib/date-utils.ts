/**
 * Date Utilities
 * Centralized date manipulation functions
 */

/**
 * Generate an array of all dates between start and end (inclusive)
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 * @returns Array of date strings in YYYY-MM-DD format
 */
export function getAllDatesBetween(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  const current = new Date(startDate)
  const end = new Date(endDate)

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 1)
  }

  return dates
}

/**
 * Get today's date in YYYY-MM-DD format
 */
export function getToday(): string {
  return new Date().toISOString().split('T')[0]
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
 * @param startDate - Start date (Date object or string)
 * @param endDate - End date (Date object or string)
 * @returns Number of days between the dates (minimum 1)
 */
export function getDaysBetween(startDate: string | Date, endDate: string | Date): number {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate
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
