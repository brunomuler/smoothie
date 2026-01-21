"use client"

import { format } from "date-fns"

/**
 * Chart Tooltip Components
 * Reusable tooltip building blocks for Recharts charts
 */

interface ChartTooltipContainerProps {
  children: React.ReactNode
  className?: string
}

/**
 * Base styled container for chart tooltips
 */
export function ChartTooltipContainer({ children, className = "" }: ChartTooltipContainerProps) {
  return (
    <div className={`bg-black text-white border border-zinc-800 rounded-md px-2 py-1.5 shadow-md text-[11px] whitespace-nowrap ${className}`}>
      {children}
    </div>
  )
}

interface ChartTooltipDateProps {
  date: string
  className?: string
}

/**
 * Formatted date display for tooltips
 * Parses YYYY-MM-DD date strings and formats as "MMM d, yyyy"
 */
export function ChartTooltipDate({ date, className = "" }: ChartTooltipDateProps) {
  // Parse date as local time by adding T12:00:00 to avoid timezone issues
  // new Date("2026-01-20") parses as UTC midnight, which shows as previous day in timezones behind UTC
  const localDate = new Date(date + "T12:00:00")

  return (
    <p className={`text-zinc-400 ${className}`}>
      {format(localDate, "MMM d, yyyy")}
    </p>
  )
}

interface ChartTooltipValueProps {
  value: string
  label?: string
  colorClass?: string
  className?: string
  icon?: React.ReactNode
}

/**
 * Colored value display for tooltips
 */
export function ChartTooltipValue({
  value,
  label,
  colorClass = "text-emerald-400",
  className = "",
  icon,
}: ChartTooltipValueProps) {
  return (
    <p className={`font-medium ${colorClass} ${className} ${icon ? 'flex items-center gap-1' : ''}`}>
      {icon}
      {value}{label ? ` ${label}` : ''}
    </p>
  )
}

/**
 * Color constants for chart tooltips
 */
export const TOOLTIP_COLORS = {
  emerald: "text-emerald-400",
  purple: "text-purple-400",
  blue: "text-blue-400",
  amber: "text-amber-400",
  red: "text-red-400",
  green: "text-green-500",
} as const

export type TooltipColorKey = keyof typeof TOOLTIP_COLORS
