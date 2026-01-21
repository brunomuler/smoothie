"use client"

import { useMemo } from "react"
import { LineChart, Line, Tooltip, ResponsiveContainer, YAxis } from "recharts"
import { getTodayInUserTimezone } from "@/lib/date-utils"
import {
  ChartTooltipContainer,
  ChartTooltipDate,
  ChartTooltipValue,
} from "@/components/charts/tooltips"
import type { BaseSparklineProps, SparklineDataPoint, SparklineConfig } from "./types"

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; payload: SparklineDataPoint }>
  config: SparklineConfig
}

function SparklineTooltip({ active, payload, config }: CustomTooltipProps) {
  if (!active || !payload?.length) {
    return null
  }

  const data = payload[0]
  const date = data.payload.date
  const value = data.value

  return (
    <ChartTooltipContainer>
      <ChartTooltipDate date={date} />
      <ChartTooltipValue
        value={config.formatValue(value)}
        label={config.label}
        colorClass={config.tooltipColorClass || "text-emerald-400"}
        icon={config.tooltipIcon}
      />
    </ChartTooltipContainer>
  )
}

/**
 * BaseSparkline - Core sparkline chart component
 *
 * This component handles:
 * - Filtering out future dates based on user timezone
 * - Replacing today's value with the current SDK value
 * - Calculating averages
 * - Rendering the chart with consistent styling
 */
export function BaseSparkline({
  data,
  currentValue,
  config,
  className = "",
  isLoading = false,
  showStats = true,
}: BaseSparklineProps) {
  // Get today's date in user's timezone
  const today = getTodayInUserTimezone()

  // Filter out future dates and replace today's value with current SDK value
  const chartData = useMemo(() => {
    if (!data?.length) return []

    // Filter out any dates that are "in the future" from user's timezone perspective
    const filteredData = data.filter(d => d.date <= today)

    if (!filteredData.length) return []
    if (currentValue === undefined) return filteredData

    const result = [...filteredData]

    // Use SDK value for today's data point
    const todayIndex = result.findIndex(d => d.date === today)
    if (todayIndex !== -1) {
      result[todayIndex] = {
        ...result[todayIndex],
        [config.dataKey]: currentValue,
      }
    } else {
      result.push({
        date: today,
        [config.dataKey]: currentValue,
      })
    }

    return result
  }, [data, currentValue, today, config.dataKey])

  // Calculate stats based on mode
  const { averageValue, changePercent, isPositive } = useMemo(() => {
    if (!chartData?.length) {
      return { averageValue: 0, changePercent: 0, isPositive: true }
    }

    const values = chartData.map(d => Number(d[config.dataKey]) || 0)

    // Calculate average
    const sum = values.reduce((acc, val) => acc + val, 0)
    const avg = sum / values.length

    // Calculate change percentage
    const startValue = values[0]
    const endValue = values[values.length - 1]
    const change = startValue > 0 ? ((endValue - startValue) / startValue) * 100 : 0

    return {
      averageValue: avg,
      changePercent: change,
      isPositive: change >= 0,
    }
  }, [chartData, config.dataKey])

  // Default size if not specified via className
  const defaultSize = !className?.includes("w-") && !className?.includes("h-")
    ? "h-8 w-16"
    : ""

  if (isLoading) {
    return (
      <div
        className={`bg-muted/30 animate-pulse rounded ${defaultSize} ${className}`}
      />
    )
  }

  if (!chartData?.length) {
    return null
  }

  return (
    <div className="flex items-center gap-3">
      <div className={`${defaultSize} ${className} flex-1`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
          >
            <YAxis domain={['dataMin', 'dataMax']} hide />
            <Tooltip
              content={<SparklineTooltip config={config} />}
              cursor={false}
              allowEscapeViewBox={{ x: true, y: true }}
              wrapperStyle={{ zIndex: 50 }}
              position={{ y: -50 }}
            />
            <Line
              type="monotone"
              dataKey={config.dataKey}
              stroke={config.color}
              strokeWidth={1}
              dot={false}
              activeDot={{
                r: 2,
                fill: config.color,
                stroke: config.color,
              }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {showStats && (
        <div className="shrink-0 text-right">
          {currentValue !== undefined && (
            <p className={`text-sm font-semibold mb-1`} style={{ color: config.color }}>
              {config.formatValue(currentValue)}
            </p>
          )}
          {(config.periodLabel || config.averageLabel) && (
            <>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {config.periodLabel || config.averageLabel}
              </p>
              {config.statsMode === "change" ? (
                <p className={`text-xs ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isPositive ? "+" : ""}{changePercent.toFixed(1)}%
                </p>
              ) : (
                <p className="text-xs text-foreground">{config.formatValue(averageValue)}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
