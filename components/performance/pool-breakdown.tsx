"use client"

import { Shield, PiggyBank } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { InfoLabel } from "./info-label"

interface PoolData {
  poolId: string
  poolName: string | null
  lending: {
    deposited: number
    withdrawn: number
    emissionsClaimed: number
  }
  backstop: {
    deposited: number
    withdrawn: number
    emissionsClaimed: number
  }
}

interface PoolYieldData {
  lending: { protocolYieldUsd: number; totalEarnedUsd: number }
  backstop: { protocolYieldUsd: number; totalEarnedUsd: number }
}

interface PoolBalances {
  lending: number
  backstop: number
}

interface PoolBreakdownProps {
  perPoolBreakdown: PoolData[]
  perPoolCurrentBalances: Map<string, PoolBalances>
  perPoolYieldData: Map<string, PoolYieldData>
  showPriceChanges: boolean
  formatUsd: (value: number) => string
}

export function PoolBreakdown({
  perPoolBreakdown,
  perPoolCurrentBalances,
  perPoolYieldData,
  showPriceChanges,
  formatUsd,
}: PoolBreakdownProps) {
  if (perPoolBreakdown.length === 0) return null

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">Breakdown by Pool</h2>
      <Card>
        <CardContent className="space-y-4 pt-4">
          {perPoolBreakdown.map((poolData, poolIndex) => {
            const totalDeposited = poolData.lending.deposited + poolData.backstop.deposited

            // Get actual per-pool current balances from SDK positions
            const poolBalances = perPoolCurrentBalances.get(poolData.poolId)
            const lendingCurrentBalance = poolBalances?.lending ?? 0
            const backstopCurrentBalance = poolBalances?.backstop ?? 0

            // Get per-pool yield data (consistent with source breakdown)
            const poolYield = perPoolYieldData.get(poolData.poolId)

            // For active positions: use yield breakdown data (respects showPriceChanges setting)
            // For exited positions: yield is realized = Withdrawn - Deposited (already included in withdrawal)
            const lendingYield = lendingCurrentBalance > 0
              ? (showPriceChanges
                  ? (poolYield?.lending.totalEarnedUsd ?? 0)
                  : (poolYield?.lending.protocolYieldUsd ?? 0))
              : Math.max(0, poolData.lending.withdrawn - poolData.lending.deposited)
            const backstopYield = backstopCurrentBalance > 0
              ? (showPriceChanges
                  ? (poolYield?.backstop.totalEarnedUsd ?? 0)
                  : (poolYield?.backstop.protocolYieldUsd ?? 0))
              : Math.max(0, poolData.backstop.withdrawn - poolData.backstop.deposited)

            // Total P&L = Yield + Emissions
            const lendingTotalPnl = lendingYield + poolData.lending.emissionsClaimed
            const backstopTotalPnl = backstopYield + poolData.backstop.emissionsClaimed

            const poolTotalPnl = lendingTotalPnl + backstopTotalPnl
            const poolTotalCurrentBalance = lendingCurrentBalance + backstopCurrentBalance

            return (
              <div key={poolData.poolId} className="space-y-4">
                {poolIndex > 0 && <Separator />}
                {/* Pool Header */}
                <p className="font-semibold text-sm">
                  {poolData.poolName || poolData.poolId.slice(0, 8) + '...'}
                </p>

                {/* Lending Position */}
                {poolData.lending.deposited > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-full bg-blue-500/10">
                        <PiggyBank className="h-3.5 w-3.5 text-blue-500" />
                      </div>
                      <p className="font-medium text-sm">Lending</p>
                    </div>
                    <div className="space-y-1 text-sm">
                      {lendingCurrentBalance > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Current Balance</span>
                          <span className="tabular-nums">{formatUsd(lendingCurrentBalance)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Deposited</span>
                        <span className="tabular-nums">{formatUsd(poolData.lending.deposited)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Withdrawn</span>
                        <span className="tabular-nums">{formatUsd(poolData.lending.withdrawn)}</span>
                      </div>
                      {lendingYield > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            <InfoLabel
                              label="Yield"
                              tooltip={lendingCurrentBalance > 0
                                ? "Interest earned from lending. This is protocol yield."
                                : "Interest earned from lending (realized when withdrawn)."}
                            />
                          </span>
                          <span className="tabular-nums">{formatUsd(lendingYield)}</span>
                        </div>
                      )}
                      {poolData.lending.emissionsClaimed > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            <InfoLabel label="Emissions Claimed" tooltip="BLND tokens received as rewards from this lending position." />
                          </span>
                          <span className="tabular-nums">{formatUsd(poolData.lending.emissionsClaimed)}</span>
                        </div>
                      )}
                      {/* P&L Section */}
                      <div className="flex justify-between items-center font-medium pt-1 border-t border-border/50">
                        <span>
                          <InfoLabel label="P&L" tooltip="Total profit: Yield + Emissions" />
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={`tabular-nums ${lendingTotalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {lendingTotalPnl >= 0 ? "+" : ""}{formatUsd(lendingTotalPnl)}
                          </span>
                          {poolData.lending.deposited > 0 && (
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${lendingTotalPnl >= 0 ? "text-emerald-400 border-emerald-400/30" : "text-red-400 border-red-400/30"}`}>
                              {lendingTotalPnl >= 0 ? "+" : ""}{((lendingTotalPnl / poolData.lending.deposited) * 100).toFixed(1)}%
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Backstop Position */}
                {poolData.backstop.deposited > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-full bg-purple-500/10">
                        <Shield className="h-3.5 w-3.5 text-purple-500" />
                      </div>
                      <p className="font-medium text-sm">Backstop</p>
                    </div>
                    <div className="space-y-1 text-sm">
                      {backstopCurrentBalance > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Current Balance</span>
                          <span className="tabular-nums">{formatUsd(backstopCurrentBalance)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Deposited</span>
                        <span className="tabular-nums">{formatUsd(poolData.backstop.deposited)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Withdrawn</span>
                        <span className="tabular-nums">{formatUsd(poolData.backstop.withdrawn)}</span>
                      </div>
                      {backstopYield > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            <InfoLabel
                              label="Yield"
                              tooltip={backstopCurrentBalance > 0
                                ? "LP token appreciation from backstop positions. This is protocol yield."
                                : "LP token appreciation (realized when withdrawn)."}
                            />
                          </span>
                          <span className="tabular-nums">{formatUsd(backstopYield)}</span>
                        </div>
                      )}
                      {poolData.backstop.emissionsClaimed > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            <InfoLabel label="Emissions Claimed" tooltip="BLND and LP tokens received as rewards from this backstop position." />
                          </span>
                          <span className="tabular-nums">{formatUsd(poolData.backstop.emissionsClaimed)}</span>
                        </div>
                      )}
                      {/* P&L Section */}
                      <div className="flex justify-between items-center font-medium pt-1 border-t border-border/50">
                        <span>
                          <InfoLabel label="P&L" tooltip="Total profit: Yield + Emissions" />
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={`tabular-nums ${backstopTotalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {backstopTotalPnl >= 0 ? "+" : ""}{formatUsd(backstopTotalPnl)}
                          </span>
                          {poolData.backstop.deposited > 0 && (
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${backstopTotalPnl >= 0 ? "text-emerald-400 border-emerald-400/30" : "text-red-400 border-red-400/30"}`}>
                              {backstopTotalPnl >= 0 ? "+" : ""}{((backstopTotalPnl / poolData.backstop.deposited) * 100).toFixed(1)}%
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Pool Summary */}
                <div className="pt-2 border-t border-border/50 space-y-1">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Current Balance</span>
                    <span className="tabular-nums font-medium">{formatUsd(poolTotalCurrentBalance)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Total Deposited</span>
                    <span className="tabular-nums font-medium">{formatUsd(totalDeposited)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Total Withdrawn</span>
                    <span className="tabular-nums font-medium">{formatUsd(poolData.lending.withdrawn + poolData.backstop.withdrawn)}</span>
                  </div>
                  <Separator className="my-1" />
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Total P&L</span>
                    <p className={`text-lg font-bold tabular-nums ${poolTotalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {poolTotalPnl >= 0 ? "+" : ""}{formatUsd(poolTotalPnl)}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
