export function formatNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "0.00"
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// Format with integers if >= 1, otherwise show 2 decimals
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "0"
  const decimals = value >= 1 ? 0 : 2
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
