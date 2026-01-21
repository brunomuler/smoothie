/**
 * Sparkline Types
 * Shared type definitions for sparkline components
 */

// Base data point type - uses 'any' for flexibility with different data shapes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SparklineDataPoint = { date: string } & { [key: string]: any }

export type StatsMode = "average" | "change"

export interface SparklineConfig {
  /** The key in data to use for the Y-axis value */
  dataKey: string
  /** Line color (hex or tailwind color) */
  color: string
  /** Label shown in tooltip (e.g., "APY", "Price", "Q4W") */
  label: string
  /** Function to format the value for display */
  formatValue: (value: number) => string
  /** Optional tooltip color class override */
  tooltipColorClass?: string
  /** Period label for stats display (e.g., "6mo avg", "30d avg", "6mo") */
  periodLabel?: string
  /** @deprecated Use periodLabel instead */
  averageLabel?: string
  /** Whether to show an icon in tooltip (for BLND emissions) */
  tooltipIcon?: React.ReactNode
  /** Stats mode: "average" shows avg value, "change" shows percent change */
  statsMode?: StatsMode
}

export interface BaseSparklineProps {
  /** Chart data array */
  data: SparklineDataPoint[]
  /** Current/SDK value to use for today's data point */
  currentValue?: number
  /** Sparkline configuration */
  config: SparklineConfig
  /** Optional className for sizing */
  className?: string
  /** Loading state */
  isLoading?: boolean
  /** Whether to show the stats panel on the right */
  showStats?: boolean
}
