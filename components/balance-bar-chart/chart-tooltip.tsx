"use client"

import { Circle } from "lucide-react"
import { EventIcons } from "./constants"
import { getActionColor } from "@/lib/chart-utils"
import type { BarChartDataPoint, TimePeriod } from "@/types/balance-history"
import type { FormatCurrencyOptions } from "@/lib/currency/format"

interface BalanceChartTooltipProps {
  active?: boolean
  payload?: any[]
  period: TimePeriod
  formatCurrency: (amount: number, options?: FormatCurrencyOptions) => string
}

// Format amount with appropriate precision and symbol
// Converts raw amount using decimals (e.g., 30000000000 with 7 decimals = 3000)
export function formatEventAmount(
  rawAmount: number | null,
  symbol: string | null,
  decimals: number | null
): string {
  if (rawAmount === null || rawAmount === undefined) return ''

  // Convert raw amount to human-readable using decimals
  const amount = rawAmount / Math.pow(10, decimals || 7)
  const absAmount = Math.abs(amount)
  let formatted: string

  if (absAmount >= 1000000) {
    formatted = `${(amount / 1000000).toFixed(2)}M`
  } else if (absAmount >= 1000) {
    formatted = `${(amount / 1000).toFixed(2)}K`
  } else if (absAmount >= 1) {
    formatted = amount.toFixed(2)
  } else {
    formatted = amount.toFixed(4)
  }

  return symbol ? `${formatted} ${symbol}` : formatted
}

export function BalanceChartTooltip({
  active,
  payload,
  period,
  formatCurrency,
}: BalanceChartTooltipProps) {
  if (!active || !payload || !payload.length) {
    return null
  }

  const data = payload[0].payload as BarChartDataPoint
  const formatter = (value: number) => formatCurrency(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  const yieldFormatter = (value: number) => formatCurrency(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    showSign: true,
  })

  // Check if we have per-pool breakdown data
  const hasPoolBreakdown = data.poolBreakdown && data.poolBreakdown.length > 0

  return (
    <div className="bg-black text-white border border-zinc-800 rounded-md shadow-lg p-2.5 min-w-[200px] max-w-[280px] select-none z-50">
      <div className="font-medium text-[11px] mb-1.5">
        {data.period}
        {data.isProjected && (
          <span className="text-zinc-400 ml-2">(Projected)</span>
        )}
      </div>

      <div className="space-y-1 text-[11px]">
        <div className="flex justify-between">
          <span className="text-zinc-400">Balance:</span>
          <span className="font-medium">{formatter(data.balance)}</span>
        </div>

        {/* Only show borrowed in non-projection views */}
        {!data.isProjected && data.borrow > 0 && (
          <div className="flex justify-between">
            <span className="text-zinc-400">Borrowed:</span>
            <span className="font-medium text-orange-400">
              {formatter(data.borrow)}
            </span>
          </div>
        )}

        {/* Show per-pool breakdown for projections */}
        {hasPoolBreakdown && data.isProjected ? (
          <>
            {/* Per-pool yield breakdown */}
            <div className="pt-1.5 border-t border-zinc-700 mt-1.5">
              <div className="space-y-1">
                {data.poolBreakdown!
                  .filter((pool) => pool.yieldEarned !== 0 || pool.blndYield !== 0)
                  .map((pool) => (
                    <div key={pool.poolId} className="space-y-0.5">
                      <div className="text-[10px] font-medium text-zinc-400">{pool.poolName}</div>
                      {pool.yieldEarned !== 0 && (
                        <div className="flex justify-between text-[10px]">
                          <span className="text-zinc-400 pl-2">Yield:</span>
                          <span className="text-emerald-400">
                            {yieldFormatter(pool.yieldEarned)}
                          </span>
                        </div>
                      )}
                      {pool.blndYield !== 0 && (
                        <div className="flex justify-between text-[10px]">
                          <span className="text-zinc-400 pl-2">BLND:</span>
                          <span className="text-purple-400">
                            {yieldFormatter(pool.blndYield)}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>

            {/* Totals */}
            <div className="pt-1.5 border-t border-zinc-700 mt-1.5">
              {data.yieldEarned !== 0 && (
                <div className="flex justify-between">
                  <span className="text-zinc-400">Total Yield:</span>
                  <span className="font-medium text-emerald-400">
                    {yieldFormatter(data.yieldEarned)}
                  </span>
                </div>
              )}
              {data.blndYield !== undefined && data.blndYield !== 0 && (
                <div className="flex justify-between">
                  <span className="text-zinc-400">Total BLND:</span>
                  <span className="font-medium text-purple-400">
                    {yieldFormatter(data.blndYield)}
                  </span>
                </div>
              )}
              <div className="flex justify-between mt-1 pt-1 border-t border-zinc-700">
                <span className="text-zinc-300 font-medium">Combined:</span>
                <span className="font-medium text-emerald-400">
                  {yieldFormatter(data.yieldEarned + (data.blndYield || 0))}
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Standard view without per-pool breakdown */}
            <div className="flex justify-between">
              <span className="text-zinc-400">Yield:</span>
              <span
                className={
                  data.yieldEarned >= 0
                    ? "font-medium text-emerald-400"
                    : "font-medium text-red-400"
                }
              >
                {yieldFormatter(data.yieldEarned)}
              </span>
            </div>

            {data.blndYield !== undefined && data.blndYield > 0 && (
              <div className="flex justify-between">
                <span className="text-zinc-400">BLND Yield:</span>
                <span className="font-medium text-purple-400">
                  {yieldFormatter(data.blndYield)}
                </span>
              </div>
            )}
          </>
        )}

        {data.events.length > 0 && (
          <div className="pt-1.5 border-t border-zinc-700 mt-1.5">
            <div className="text-[10px] text-zinc-400 mb-1">Events:</div>
            <div className="space-y-0.5">
              {data.events.slice(0, 5).map((event, idx) => {
                const IconComponent = EventIcons[event.type] || Circle
                return (
                  <div key={idx} className="flex items-center gap-1.5 text-[10px]">
                    <IconComponent
                      className="h-2.5 w-2.5"
                      color={getActionColor(event.type)}
                    />
                    <span className="capitalize">{event.type.replace("_", " ")}</span>
                    {event.amount !== null && (
                      <span className="text-zinc-400">
                        {formatEventAmount(event.amount, event.assetSymbol, event.assetDecimals)}
                      </span>
                    )}
                  </div>
                )
              })}
              {data.events.length > 5 && (
                <div className="text-[10px] text-zinc-400">
                  +{data.events.length - 5} more
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
