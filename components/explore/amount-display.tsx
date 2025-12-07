"use client"

import { cn } from "@/lib/utils"

interface AmountDisplayProps {
  amount: number
  amountUsd: number
  symbol?: string
  showUsdPrimary?: boolean
  className?: string
  size?: "sm" | "md" | "lg"
}

function formatNumber(value: number, decimals: number = 2): string {
  if (Math.abs(value) >= 1000000) {
    return `${(value / 1000000).toFixed(decimals)}M`
  }
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(decimals)}K`
  }
  return value.toFixed(decimals)
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function AmountDisplay({
  amount,
  amountUsd,
  symbol = "",
  showUsdPrimary = false,
  className,
  size = "md",
}: AmountDisplayProps) {
  const sizeClasses = {
    sm: { primary: "text-sm", secondary: "text-xs" },
    md: { primary: "text-base", secondary: "text-sm" },
    lg: { primary: "text-lg font-semibold", secondary: "text-sm" },
  }

  if (showUsdPrimary) {
    return (
      <div className={cn("flex flex-col", className)}>
        <span className={cn("font-mono font-medium", sizeClasses[size].primary)}>
          {formatCurrency(amountUsd)}
        </span>
        <span className={cn("text-muted-foreground font-mono", sizeClasses[size].secondary)}>
          {formatNumber(amount)} {symbol}
        </span>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col", className)}>
      <span className={cn("font-mono font-medium", sizeClasses[size].primary)}>
        {formatNumber(amount)} {symbol}
      </span>
      <span className={cn("text-muted-foreground font-mono", sizeClasses[size].secondary)}>
        {formatCurrency(amountUsd)}
      </span>
    </div>
  )
}

export function CompactAmountDisplay({
  amount,
  amountUsd,
  symbol = "",
  showUsdPrimary = false,
  className,
}: Omit<AmountDisplayProps, "size">) {
  if (showUsdPrimary) {
    return (
      <span className={cn("font-mono", className)}>
        {formatCurrency(amountUsd)}{" "}
        <span className="text-muted-foreground text-sm">
          ({formatNumber(amount)} {symbol})
        </span>
      </span>
    )
  }

  return (
    <span className={cn("font-mono", className)}>
      {formatNumber(amount)} {symbol}{" "}
      <span className="text-muted-foreground text-sm">({formatCurrency(amountUsd)})</span>
    </span>
  )
}
