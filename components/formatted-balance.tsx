"use client"

import * as React from "react"

/**
 * FormattedBalance component
 * Displays a balance number with the decimal part shown in a smaller font size
 * @param value - The balance value to display
 * @param decimals - Maximum number of decimals to show (default: 7)
 * @param className - Additional CSS classes
 */
export function FormattedBalance({
  value,
  decimals = 7,
  className = "",
}: {
  value: number | string
  decimals?: number
  className?: string
}) {
  if (value === null || value === undefined || (typeof value === "number" && isNaN(value))) {
    return <span className={className}>--</span>
  }

  // If value is already a formatted string (like "$1,234.56"), extract the number part
  let numValue: number
  if (typeof value === "string") {
    // Remove $ and commas, parse as float
    const cleaned = value.replace(/[$,]/g, "")
    numValue = parseFloat(cleaned)
    if (isNaN(numValue)) {
      return <span className={className}>{value}</span>
    }
  } else {
    numValue = value
  }

  // Format the number with the specified decimals
  const formatted = numValue.toFixed(decimals)

  // Split into integer and decimal parts
  const parts = formatted.split(".")
  const integerPart = parts[0]
  const decimalPart = parts[1] || ""

  // Add thousand separators to integer part
  const integerWithCommas = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")

  // If original was a string with $, include it
  const prefix = typeof value === "string" && value.startsWith("$") ? "$" : ""

  return (
    <span className={className}>
      {prefix}
      <span>{integerWithCommas}</span>
      {decimalPart && <span className="text-[0.7em] text-muted-foreground">.{decimalPart}</span>}
    </span>
  )
}

/**
 * Utility function to format balance with smaller decimals
 * Returns JSX element for inline use
 */
export function formatBalanceWithSmallDecimals(
  value: number | string,
  decimals = 7,
  className = ""
) {
  if (value === null || value === undefined || (typeof value === "number" && isNaN(value))) {
    return <span className={className}>--</span>
  }

  let numValue: number
  if (typeof value === "string") {
    const cleaned = value.replace(/[$,]/g, "")
    numValue = parseFloat(cleaned)
    if (isNaN(numValue)) {
      return <span className={className}>{value}</span>
    }
  } else {
    numValue = value
  }

  const formatted = numValue.toFixed(decimals)
  const parts = formatted.split(".")
  const integerPart = parts[0]
  const decimalPart = parts[1] || ""

  const integerWithCommas = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  const prefix = typeof value === "string" && value.startsWith("$") ? "$" : ""

  return (
    <span className={className}>
      {prefix}
      <span>{integerWithCommas}</span>
      {decimalPart && <span className="text-[0.7em] text-muted-foreground">.{decimalPart}</span>}
    </span>
  )
}



