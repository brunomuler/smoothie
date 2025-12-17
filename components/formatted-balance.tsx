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

  // If value is already a formatted string (like "$1,234.56" or "€1.234,56"), extract the number part
  let numValue: number
  let prefix = ""

  if (typeof value === "string") {
    // Extract currency symbol/prefix (any non-digit, non-decimal characters at the start)
    const prefixMatch = value.match(/^[^\d\-]*/)
    prefix = prefixMatch ? prefixMatch[0] : ""

    // Remove all non-numeric characters except decimal point, comma, and minus sign
    // Then normalize: replace comma with dot if it's used as decimal separator
    let cleaned = value.replace(/[^\d.,-]/g, "")

    // Handle European format (1.234,56) vs US format (1,234.56)
    // If there's both comma and dot, the last one is the decimal separator
    const lastComma = cleaned.lastIndexOf(",")
    const lastDot = cleaned.lastIndexOf(".")

    if (lastComma > lastDot) {
      // European format: 1.234,56 -> remove dots, replace comma with dot
      cleaned = cleaned.replace(/\./g, "").replace(",", ".")
    } else {
      // US format: 1,234.56 -> just remove commas
      cleaned = cleaned.replace(/,/g, "")
    }

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
  let prefix = ""

  if (typeof value === "string") {
    // Extract currency symbol/prefix (any non-digit, non-decimal characters at the start)
    const prefixMatch = value.match(/^[^\d\-]*/)
    prefix = prefixMatch ? prefixMatch[0] : ""

    // Remove all non-numeric characters except decimal point, comma, and minus sign
    let cleaned = value.replace(/[^\d.,-]/g, "")

    // Handle European format (1.234,56) vs US format (1,234.56)
    const lastComma = cleaned.lastIndexOf(",")
    const lastDot = cleaned.lastIndexOf(".")

    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".")
    } else {
      cleaned = cleaned.replace(/,/g, "")
    }

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

  return (
    <span className={className}>
      {prefix}
      <span>{integerWithCommas}</span>
      {decimalPart && <span className="text-[0.7em] text-muted-foreground">.{decimalPart}</span>}
    </span>
  )
}



