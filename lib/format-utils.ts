// Format number with full decimals for dust amounts
export function formatAmount(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "0"
  // Show more decimals for dust amounts
  if (value > 0 && value < 0.01) {
    return value.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })
  }
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

// Format USD with full decimals for dust amounts
export function formatUsdAmount(value: number): string {
  if (!Number.isFinite(value)) return "$0.00"
  // Show more decimals for dust amounts
  if (value > 0 && value < 0.01) {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })}`
  }
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
