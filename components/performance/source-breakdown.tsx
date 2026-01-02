"use client"

import { Shield, PiggyBank } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { InfoLabel } from "./info-label"

interface SourceData {
  deposited: number
  withdrawn: number
}

interface EmissionsData {
  pools: { blnd: number; lp: number; usd: number }
  backstop: { blnd: number; lp: number; usd: number }
}

interface UnclaimedEmissionsData {
  pools: { blnd: number; usd: number }
  backstop: { blnd: number; usd: number }
}

interface DisplayPnlData {
  poolsUnrealized: number
  backstopUnrealized: number
  totalPnl: number
  poolsYield: number
  backstopYield: number
}

interface UnrealizedData {
  poolsCurrentUsd: number
  backstopCurrentUsd: number
  totalCurrentUsd: number
}

interface SourceBreakdownProps {
  pools: SourceData
  backstop: SourceData
  totalDepositedUsd: number
  totalWithdrawnUsd: number
  emissionsBySource: EmissionsData
  unclaimedEmissions: UnclaimedEmissionsData
  displayPnl: DisplayPnlData
  unrealizedData: UnrealizedData
  realizedPnl: number
  formatUsd: (value: number) => string
}

export function SourceBreakdown({
  pools,
  backstop,
  totalDepositedUsd,
  totalWithdrawnUsd,
  emissionsBySource,
  unclaimedEmissions,
  displayPnl,
  unrealizedData,
  realizedPnl,
  formatUsd,
}: SourceBreakdownProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">Breakdown by Source</h2>
      <Card>
        <CardContent className="space-y-4 pt-4">
          {/* Pools */}
          {(pools.deposited > 0 || pools.withdrawn > 0) && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-full bg-blue-500/10">
                  <PiggyBank className="h-3.5 w-3.5 text-blue-500" />
                </div>
                <p className="font-medium text-sm">Lending Pools</p>
              </div>
              <div className="space-y-1 text-sm">
                {unrealizedData.poolsCurrentUsd > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current Balance</span>
                    <span className="tabular-nums">{formatUsd(unrealizedData.poolsCurrentUsd)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deposited</span>
                  <span className="tabular-nums">{formatUsd(pools.deposited)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Withdrawn</span>
                  <span className="tabular-nums">{formatUsd(pools.withdrawn)}</span>
                </div>
                {displayPnl.poolsYield > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      <InfoLabel label="Yield" tooltip="Interest earned from lending. This is protocol yield (tokens earned × current price)." />
                    </span>
                    <span className="tabular-nums">{formatUsd(displayPnl.poolsYield)}</span>
                  </div>
                )}
                {emissionsBySource.pools.usd > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      <InfoLabel label="Emissions Claimed" tooltip="BLND tokens received as rewards from lending positions." />
                    </span>
                    <span className="tabular-nums">{formatUsd(emissionsBySource.pools.usd)}</span>
                  </div>
                )}
                {unclaimedEmissions.pools.usd > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      <InfoLabel label="Emissions Unclaimed" tooltip="BLND tokens available to claim from lending positions." />
                    </span>
                    <span className="tabular-nums">{formatUsd(unclaimedEmissions.pools.usd)}</span>
                  </div>
                )}
                {emissionsBySource.pools.usd > 0 && (
                  <div className="flex justify-between items-center pt-1 border-t border-border/50">
                    <span className="text-muted-foreground">
                      <InfoLabel label="Realized P&L" tooltip="Profits already withdrawn from the protocol (emissions claimed)." />
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums text-emerald-400">+{formatUsd(emissionsBySource.pools.usd)}</span>
                      {pools.deposited > 0 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-400 border-emerald-400/30">
                          +{((emissionsBySource.pools.usd / pools.deposited) * 100).toFixed(1)}%
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
                {unrealizedData.poolsCurrentUsd > 0 && (
                  <>
                    <div className="flex justify-between items-center pt-1 border-t border-border/50">
                      <span className="text-muted-foreground">
                        <InfoLabel label="Unrealized P&L" tooltip="Current Balance minus Cost Basis. Profit still in the protocol." />
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`tabular-nums ${displayPnl.poolsUnrealized >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {displayPnl.poolsUnrealized >= 0 ? "+" : ""}{formatUsd(displayPnl.poolsUnrealized)}
                        </span>
                        {pools.deposited > 0 && (
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${displayPnl.poolsUnrealized >= 0 ? "text-emerald-400 border-emerald-400/30" : "text-red-400 border-red-400/30"}`}>
                            {displayPnl.poolsUnrealized >= 0 ? "+" : ""}{((displayPnl.poolsUnrealized / pools.deposited) * 100).toFixed(1)}%
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between items-center font-medium pt-1 border-t border-border/50">
                      <span>
                        <InfoLabel label="P&L" tooltip="Total profit: Unrealized P&L + Realized P&L" />
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`tabular-nums ${(displayPnl.poolsUnrealized + emissionsBySource.pools.usd) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {(displayPnl.poolsUnrealized + emissionsBySource.pools.usd) >= 0 ? "+" : ""}{formatUsd(displayPnl.poolsUnrealized + emissionsBySource.pools.usd)}
                        </span>
                        {pools.deposited > 0 && (
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${(displayPnl.poolsUnrealized + emissionsBySource.pools.usd) >= 0 ? "text-emerald-400 border-emerald-400/30" : "text-red-400 border-red-400/30"}`}>
                            {(displayPnl.poolsUnrealized + emissionsBySource.pools.usd) >= 0 ? "+" : ""}{(((displayPnl.poolsUnrealized + emissionsBySource.pools.usd) / pools.deposited) * 100).toFixed(1)}%
                          </Badge>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Backstop */}
          {(backstop.deposited > 0 || backstop.withdrawn > 0) && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-full bg-purple-500/10">
                  <Shield className="h-3.5 w-3.5 text-purple-500" />
                </div>
                <p className="font-medium text-sm">Backstop</p>
              </div>
              <div className="space-y-1 text-sm">
                {unrealizedData.backstopCurrentUsd > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current Balance</span>
                    <span className="tabular-nums">{formatUsd(unrealizedData.backstopCurrentUsd)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deposited</span>
                  <span className="tabular-nums">{formatUsd(backstop.deposited)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Withdrawn</span>
                  <span className="tabular-nums">{formatUsd(backstop.withdrawn)}</span>
                </div>
                {displayPnl.backstopYield > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      <InfoLabel label="Yield" tooltip="LP token appreciation from backstop positions. This is protocol yield." />
                    </span>
                    <span className="tabular-nums">{formatUsd(displayPnl.backstopYield)}</span>
                  </div>
                )}
                {emissionsBySource.backstop.usd > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      <InfoLabel label="Emissions Claimed" tooltip="BLND and LP tokens received as rewards from backstop positions." />
                    </span>
                    <span className="tabular-nums">{formatUsd(emissionsBySource.backstop.usd)}</span>
                  </div>
                )}
                {unclaimedEmissions.backstop.usd > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      <InfoLabel label="Emissions Unclaimed" tooltip="BLND tokens available to claim from backstop positions." />
                    </span>
                    <span className="tabular-nums">{formatUsd(unclaimedEmissions.backstop.usd)}</span>
                  </div>
                )}
                {emissionsBySource.backstop.usd > 0 && (
                  <div className="flex justify-between items-center pt-1 border-t border-border/50">
                    <span className="text-muted-foreground">
                      <InfoLabel label="Realized P&L" tooltip="Profits already withdrawn from the protocol (emissions claimed)." />
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums text-emerald-400">+{formatUsd(emissionsBySource.backstop.usd)}</span>
                      {backstop.deposited > 0 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-400 border-emerald-400/30">
                          +{((emissionsBySource.backstop.usd / backstop.deposited) * 100).toFixed(1)}%
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
                {unrealizedData.backstopCurrentUsd > 0 && (
                  <>
                    <div className="flex justify-between items-center pt-1 border-t border-border/50">
                      <span className="text-muted-foreground">
                        <InfoLabel label="Unrealized P&L" tooltip="Current Balance minus Cost Basis. Profit still in the protocol." />
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`tabular-nums ${displayPnl.backstopUnrealized >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {displayPnl.backstopUnrealized >= 0 ? "+" : ""}{formatUsd(displayPnl.backstopUnrealized)}
                        </span>
                        {backstop.deposited > 0 && (
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${displayPnl.backstopUnrealized >= 0 ? "text-emerald-400 border-emerald-400/30" : "text-red-400 border-red-400/30"}`}>
                            {displayPnl.backstopUnrealized >= 0 ? "+" : ""}{((displayPnl.backstopUnrealized / backstop.deposited) * 100).toFixed(1)}%
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between items-center font-medium pt-1 border-t border-border/50">
                      <span>
                        <InfoLabel label="P&L" tooltip="Total profit: Unrealized P&L + Realized P&L" />
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`tabular-nums ${(displayPnl.backstopUnrealized + emissionsBySource.backstop.usd) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {(displayPnl.backstopUnrealized + emissionsBySource.backstop.usd) >= 0 ? "+" : ""}{formatUsd(displayPnl.backstopUnrealized + emissionsBySource.backstop.usd)}
                        </span>
                        {backstop.deposited > 0 && (
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${(displayPnl.backstopUnrealized + emissionsBySource.backstop.usd) >= 0 ? "text-emerald-400 border-emerald-400/30" : "text-red-400 border-red-400/30"}`}>
                            {(displayPnl.backstopUnrealized + emissionsBySource.backstop.usd) >= 0 ? "+" : ""}{(((displayPnl.backstopUnrealized + emissionsBySource.backstop.usd) / backstop.deposited) * 100).toFixed(1)}%
                          </Badge>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          <Separator />

          {/* Summary */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <p className="text-muted-foreground">Total Deposited</p>
              <p className="font-medium tabular-nums">{formatUsd(totalDepositedUsd)}</p>
            </div>
            <div className="flex items-center justify-between text-sm">
              <p className="text-muted-foreground">Total Withdrawn</p>
              <p className="font-medium tabular-nums">{formatUsd(totalWithdrawnUsd)}</p>
            </div>
            {unrealizedData.totalCurrentUsd > 0 && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <p className="text-muted-foreground">Current Balance</p>
                  <p className="font-medium tabular-nums">{formatUsd(unrealizedData.totalCurrentUsd)}</p>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <p className="font-semibold">Total P&L</p>
                  <p className={`text-lg font-bold tabular-nums ${displayPnl.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {displayPnl.totalPnl >= 0 ? "+" : ""}{formatUsd(displayPnl.totalPnl)}
                  </p>
                </div>
              </>
            )}
            {unrealizedData.totalCurrentUsd === 0 && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{realizedPnl >= 0 ? "Realized Profit" : "Net Cash Flow"}</p>
                  <p className={`text-lg font-bold tabular-nums ${realizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {realizedPnl >= 0 ? "+" : ""}{formatUsd(realizedPnl)}
                  </p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
