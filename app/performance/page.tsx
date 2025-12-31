"use client"

import { useState, useMemo, Suspense } from "react"
import Link from "next/link"
import { ArrowLeft, TrendingUp, TrendingDown, Shield, PiggyBank, Flame, Download, Calendar, Wallet, Info } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart"
import { Area, AreaChart, XAxis, YAxis } from "recharts"
import { useRealizedYield } from "@/hooks/use-realized-yield"
import { useBlendPositions } from "@/hooks/use-blend-positions"
import { useCurrencyPreference } from "@/hooks/use-currency-preference"
import { LP_TOKEN_ADDRESS } from "@/lib/constants"
import { DashboardLayout } from "@/components/dashboard-layout"
import { useWalletState } from "@/hooks/use-wallet-state"

function formatNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "0.00"
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

// Helper component for labels with info tooltips
function InfoLabel({ label, tooltip, className = "" }: { label: string; tooltip: string; className?: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center gap-1 cursor-help ${className}`}>
            {label}
            <Info className="h-3 w-3 text-muted-foreground/60" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-xs">
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

const chartConfig = {
  cumulativeRealized: {
    label: "Realized P&L",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig

function RealizedYieldContent() {
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [sourceFilter, setSourceFilter] = useState<string>("all")
  const { format: formatInCurrency } = useCurrencyPreference()

  const {
    wallets,
    activeWallet,
    handleSelectWallet,
    handleConnectWallet,
    handleDisconnect,
  } = useWalletState()

  const publicKey = activeWallet?.publicKey

  // Get blend positions for current prices and balances
  const { blndPrice, lpTokenPrice, data: blendSnapshot, totalBackstopUsd, isLoading: isLoadingPositions } = useBlendPositions(publicKey)

  // Build SDK prices map
  const sdkPricesMap = useMemo(() => {
    const map: Record<string, number> = {}
    if (blendSnapshot?.positions) {
      blendSnapshot.positions.forEach(pos => {
        if (pos.assetId && pos.price?.usdPrice && pos.price.usdPrice > 0) {
          map[pos.assetId] = pos.price.usdPrice
        }
      })
    }
    if (lpTokenPrice && lpTokenPrice > 0) {
      map[LP_TOKEN_ADDRESS] = lpTokenPrice
    }
    return map
  }, [blendSnapshot?.positions, lpTokenPrice])

  // Wait for SDK prices to be ready before fetching performance data
  // This prevents a flash of incorrect values when prices load
  const sdkReady = !isLoadingPositions && blendSnapshot !== undefined

  const { data, isLoading } = useRealizedYield({
    publicKey,
    sdkBlndPrice: blndPrice ?? 0,
    sdkLpPrice: lpTokenPrice ?? 0,
    sdkPrices: sdkPricesMap,
    enabled: !!publicKey && sdkReady,
  })

  const formatUsd = (value: number) => {
    if (!Number.isFinite(value)) return formatInCurrency(0)
    return formatInCurrency(value, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  // Calculate running net for transactions display
  const transactionsWithRunningNet = useMemo(() => {
    if (!data?.transactions) return []

    let runningNet = 0
    const txsWithNet = data.transactions.map(tx => {
      if (tx.type === "deposit") {
        runningNet -= tx.valueUsd
      } else {
        runningNet += tx.valueUsd
      }
      return { ...tx, runningNet }
    })

    // Apply filters and reverse
    return txsWithNet.filter(tx => {
      if (typeFilter !== "all" && tx.type !== typeFilter) return false
      if (sourceFilter !== "all" && tx.source !== sourceFilter) return false
      return true
    }).reverse()
  }, [data?.transactions, typeFilter, sourceFilter])

  // Aggregate by pool for per-pool breakdown
  const perPoolBreakdown = useMemo(() => {
    if (!data?.transactions) return []

    const poolMap = new Map<string, {
      poolId: string
      poolName: string | null
      deposited: number
      withdrawn: number
      source: 'pool' | 'backstop'
    }>()

    for (const tx of data.transactions) {
      // Skip claims for per-pool breakdown (they're shown separately)
      if (tx.type === 'claim') continue

      const key = `${tx.poolId}-${tx.source}`
      const existing = poolMap.get(key) || {
        poolId: tx.poolId,
        poolName: tx.poolName,
        deposited: 0,
        withdrawn: 0,
        source: tx.source,
      }

      if (tx.type === 'deposit') {
        existing.deposited += tx.valueUsd
      } else {
        existing.withdrawn += tx.valueUsd
      }

      poolMap.set(key, existing)
    }

    return Array.from(poolMap.values())
      .filter(p => p.deposited > 0 || p.withdrawn > 0)
      .sort((a, b) => (b.deposited + b.withdrawn) - (a.deposited + a.withdrawn))
  }, [data?.transactions])

  // Calculate current positions and unrealized P&L from SDK
  const unrealizedData = useMemo(() => {
    if (!data || !blendSnapshot) {
      return {
        poolsCurrentUsd: 0,
        poolsCostBasis: 0,
        poolsUnrealized: 0,
        backstopCurrentUsd: 0,
        backstopCostBasis: 0,
        backstopUnrealized: 0,
        totalCurrentUsd: 0,
        totalCostBasis: 0,
        totalUnrealized: 0,
        totalPnl: 0,
      }
    }

    // Current pool positions from SDK (supply only, excluding borrows)
    const poolsCurrentUsd = blendSnapshot.positions?.reduce(
      (sum, pos) => sum + (pos.supplyUsdValue || 0),
      0
    ) ?? 0

    // Cost basis = what's still "in" = deposited - withdrawn (excluding emissions)
    const poolsCostBasis = data.pools.deposited - data.pools.withdrawn
    const poolsUnrealized = poolsCurrentUsd - poolsCostBasis

    // Current backstop from SDK
    const backstopCurrentUsd = totalBackstopUsd ?? 0
    const backstopCostBasis = data.backstop.deposited - data.backstop.withdrawn
    const backstopUnrealized = backstopCurrentUsd - backstopCostBasis

    // Totals
    const totalCurrentUsd = poolsCurrentUsd + backstopCurrentUsd
    const totalCostBasis = poolsCostBasis + backstopCostBasis
    const totalUnrealized = totalCurrentUsd - totalCostBasis

    // Total P&L = (Current Balance + Total Withdrawn) - Total Deposited
    // This represents actual profit: what you have now + what you took out - what you put in
    const totalPnl = totalCurrentUsd + data.totalWithdrawnUsd - data.totalDepositedUsd

    return {
      poolsCurrentUsd,
      poolsCostBasis,
      poolsUnrealized,
      backstopCurrentUsd,
      backstopCostBasis,
      backstopUnrealized,
      totalCurrentUsd,
      totalCostBasis,
      totalUnrealized,
      totalPnl,
    }
  }, [data, blendSnapshot, totalBackstopUsd])

  // Export transactions as CSV
  const handleExportCSV = () => {
    if (!data?.transactions) return

    const headers = ["Date", "Type", "Source", "Asset", "Amount", "Price (USD)", "Value (USD)", "Pool", "Tx Hash"]
    const rows = data.transactions.map(tx => [
      tx.date,
      tx.type,
      tx.source,
      tx.asset,
      tx.amount.toString(),
      tx.priceUsd.toString(),
      tx.valueUsd.toString(),
      tx.poolName || tx.poolId,
      tx.txHash,
    ])

    const csv = [headers.join(","), ...rows.map(row => row.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `performance-${publicKey?.slice(0, 8)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Determine display state based on whether user has current positions
  const hasCurrentPositions = unrealizedData.totalCurrentUsd > 0
  const totalPnlPositive = unrealizedData.totalPnl >= 0

  if (!activeWallet) {
    return (
      <DashboardLayout
        wallets={wallets}
        activeWallet={activeWallet}
        onSelectWallet={handleSelectWallet}
        onConnectWallet={handleConnectWallet}
        onDisconnect={handleDisconnect}
      >
        <div className="text-center py-12 px-4">
          <Wallet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-xl font-semibold mb-2">Connect a wallet</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Connect a wallet to view your realized yield and P&L history.
          </p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout
      wallets={wallets}
      activeWallet={activeWallet}
      onSelectWallet={handleSelectWallet}
      onConnectWallet={handleConnectWallet}
      onDisconnect={handleDisconnect}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">Performance</h1>
            <p className="text-xs text-muted-foreground">
              Track your P&L and activity over time
            </p>
          </div>
        </div>

        {(isLoading || !sdkReady) ? (
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-10 w-48" />
                  <Skeleton className="h-4 w-64" />
                </div>
              </CardContent>
            </Card>
            <div className="grid grid-cols-2 gap-3">
              {[...Array(4)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="pt-4 pb-4">
                    <Skeleton className="h-4 w-20 mb-2" />
                    <Skeleton className="h-6 w-28" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : !data || (data.totalDepositedUsd === 0 && data.totalWithdrawnUsd === 0) ? (
          <Card>
            <CardContent className="py-12 text-center">
              <TrendingUp className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <h3 className="font-semibold mb-1">No Activity Yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                No deposit or withdrawal activity found for this wallet. Start earning by depositing assets into Blend pools.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Hero Summary Card */}
            <Card>
              <CardContent className="pt-6">
                {hasCurrentPositions ? (
                  // User has active positions - show Total P&L as primary metric
                  <>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">
                          <InfoLabel
                            label="Total P&L"
                            tooltip="(Current Balance + Withdrawn) - Deposited. Your total profit from Blend protocol."
                          />
                        </p>
                        <div className="flex items-baseline gap-3">
                          <p className={`text-3xl font-bold tabular-nums ${totalPnlPositive ? "text-green-500" : "text-red-500"}`}>
                            {totalPnlPositive ? "+" : ""}{formatUsd(unrealizedData.totalPnl)}
                          </p>
                          {data.totalDepositedUsd > 0 && (
                            <Badge variant="outline" className={totalPnlPositive ? "text-green-500 border-green-500/30" : "text-red-500 border-red-500/30"}>
                              {totalPnlPositive ? "+" : ""}{((unrealizedData.totalPnl / data.totalDepositedUsd) * 100).toFixed(1)}%
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className={`p-2 rounded-full ${totalPnlPositive ? "bg-green-500/10" : "bg-red-500/10"}`}>
                        {totalPnlPositive ? (
                          <TrendingUp className="h-5 w-5 text-green-500" />
                        ) : (
                          <TrendingDown className="h-5 w-5 text-red-500" />
                        )}
                      </div>
                    </div>
                    <Separator className="my-4" />
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">
                          <InfoLabel label="Deposited" tooltip="Total USD value of all deposits at the time each deposit was made." />
                        </p>
                        <p className="text-base font-semibold tabular-nums">{formatUsd(data.totalDepositedUsd)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">
                          <InfoLabel label="Withdrawn" tooltip="Total USD value of all withdrawals and claims at the time they were made." />
                        </p>
                        <p className="text-base font-semibold tabular-nums">{formatUsd(data.totalWithdrawnUsd)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">
                          <InfoLabel label="Current Value" tooltip="Current market value of your positions in Blend protocol." />
                        </p>
                        <p className="text-base font-semibold tabular-nums">{formatUsd(unrealizedData.totalCurrentUsd)}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  // User has fully withdrawn - show realized P&L
                  <>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">
                          {data.realizedPnl >= 0 ? "Realized Profits" : "Net Cash Flow"}
                        </p>
                        <p className={`text-3xl font-bold tabular-nums ${data.realizedPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                          {data.realizedPnl >= 0 ? "+" : ""}{formatUsd(data.realizedPnl)}
                        </p>
                      </div>
                      <div className={`p-2 rounded-full ${data.realizedPnl >= 0 ? "bg-green-500/10" : "bg-blue-500/10"}`}>
                        {data.realizedPnl >= 0 ? (
                          <TrendingUp className="h-5 w-5 text-green-500" />
                        ) : (
                          <Wallet className="h-5 w-5 text-blue-500" />
                        )}
                      </div>
                    </div>
                    <Separator className="my-4" />
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Total Deposited</p>
                        <p className="text-lg font-semibold tabular-nums">{formatUsd(data.totalDepositedUsd)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Total Withdrawn</p>
                        <p className="text-lg font-semibold tabular-nums">{formatUsd(data.totalWithdrawnUsd)}</p>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Strategy Performance Stats */}
            {data.firstActivityDate && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">First Activity</p>
                    </div>
                    <p className="font-semibold text-sm">{formatDate(data.firstActivityDate)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground mb-1">Days Active</p>
                    <p className="font-semibold text-sm">{data.daysActive} days</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground mb-1">Capital Deployed</p>
                    <p className="font-semibold text-sm tabular-nums">{formatUsd(data.totalDepositedUsd)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground mb-1">
                      {hasCurrentPositions ? (
                        <InfoLabel label="Total ROI" tooltip="Total P&L as a percentage of capital deployed." />
                      ) : (
                        <InfoLabel label="Withdrawn %" tooltip="Percentage of deposited capital that has been withdrawn." />
                      )}
                    </p>
                    {hasCurrentPositions ? (
                      <p className={`font-semibold text-sm tabular-nums ${totalPnlPositive ? "text-green-500" : "text-red-500"}`}>
                        {totalPnlPositive ? "+" : ""}{((unrealizedData.totalPnl / data.totalDepositedUsd) * 100).toFixed(1)}%
                      </p>
                    ) : (
                      <p className="font-semibold text-sm tabular-nums">
                        {((data.totalWithdrawnUsd / data.totalDepositedUsd) * 100).toFixed(1)}%
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Cash Flow Chart */}
            {data.cumulativeRealized.length > 1 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Cumulative Cash Flow</CardTitle>
                  <CardDescription className="text-xs">
                    Net deposits vs withdrawals over time
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="h-40 w-full">
                    <AreaChart
                      data={data.cumulativeRealized}
                      margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="realizedGradientPositive" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="rgb(34, 197, 94)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="rgb(34, 197, 94)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="realizedGradientNegative" x1="0" y1="1" x2="0" y2="0">
                          <stop offset="5%" stopColor="rgb(59, 130, 246)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="rgb(59, 130, 246)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={formatShortDate}
                        tick={{ fontSize: 10 }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => {
                          const absValue = Math.abs(value)
                          if (absValue >= 1000) {
                            return `${value < 0 ? "-" : ""}$${formatNumber(absValue / 1000, 0)}k`
                          }
                          return `${value < 0 ? "-" : ""}$${formatNumber(absValue, 0)}`
                        }}
                        tick={{ fontSize: 10 }}
                        width={55}
                      />
                      <ChartTooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const chartData = payload[0].payload
                            const netFlow = chartData.cumulativeRealized
                            const isPositiveFlow = netFlow >= 0
                            return (
                              <div className="bg-background border rounded-lg p-2.5 shadow-lg text-xs">
                                <p className="font-medium mb-1.5">{formatDate(chartData.date)}</p>
                                <div className="space-y-0.5">
                                  <p className="text-muted-foreground">Deposited: {formatUsd(chartData.cumulativeDeposited)}</p>
                                  <p className="text-muted-foreground">Withdrawn: {formatUsd(chartData.cumulativeWithdrawn)}</p>
                                  <Separator className="my-1" />
                                  <p className={`font-medium ${isPositiveFlow ? "text-green-500" : "text-blue-500"}`}>
                                    Net: {isPositiveFlow ? "+" : ""}{formatUsd(netFlow)}
                                  </p>
                                </div>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      <Area
                        type="stepAfter"
                        dataKey="cumulativeRealized"
                        stroke={data.realizedPnl >= 0 ? "rgb(34, 197, 94)" : "rgb(59, 130, 246)"}
                        strokeWidth={2}
                        fill={data.realizedPnl >= 0 ? "url(#realizedGradientPositive)" : "url(#realizedGradientNegative)"}
                      />
                    </AreaChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            {/* Breakdown by Source */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Breakdown by Source</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Pools */}
                {(data.pools.deposited > 0 || data.pools.withdrawn > 0) && (
                  <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-full bg-blue-500/10">
                        <PiggyBank className="h-3.5 w-3.5 text-blue-500" />
                      </div>
                      <p className="font-medium text-sm">Lending Pools</p>
                    </div>
                    <div className="pl-7 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Deposited</span>
                        <span className="tabular-nums">{formatUsd(data.pools.deposited)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Withdrawn</span>
                        <span className="tabular-nums">{formatUsd(data.pools.withdrawn)}</span>
                      </div>
                      {unrealizedData.poolsCurrentUsd > 0 && (
                        <>
                          <div className="flex justify-between pt-1 border-t border-border/50">
                            <span className="text-muted-foreground">Current Balance</span>
                            <span className="tabular-nums">{formatUsd(unrealizedData.poolsCurrentUsd)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              <InfoLabel label="Unrealized P&L" tooltip="Current Balance minus Cost Basis. Profit still in the protocol." />
                            </span>
                            <span className={`tabular-nums ${unrealizedData.poolsUnrealized >= 0 ? "text-green-500" : "text-red-500"}`}>
                              {unrealizedData.poolsUnrealized >= 0 ? "+" : ""}{formatUsd(unrealizedData.poolsUnrealized)}
                            </span>
                          </div>
                        </>
                      )}
                      {unrealizedData.poolsCurrentUsd > 0 && (
                        <div className="flex justify-between font-medium pt-1 border-t border-border/50">
                          <span>P&L</span>
                          <span className={`tabular-nums ${unrealizedData.poolsUnrealized >= 0 ? "text-green-500" : "text-red-500"}`}>
                            {unrealizedData.poolsUnrealized >= 0 ? "+" : ""}{formatUsd(unrealizedData.poolsUnrealized)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Backstop */}
                {(data.backstop.deposited > 0 || data.backstop.withdrawn > 0) && (
                  <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-full bg-purple-500/10">
                        <Shield className="h-3.5 w-3.5 text-purple-500" />
                      </div>
                      <p className="font-medium text-sm">Backstop</p>
                    </div>
                    <div className="pl-7 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Deposited</span>
                        <span className="tabular-nums">{formatUsd(data.backstop.deposited)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Withdrawn</span>
                        <span className="tabular-nums">{formatUsd(data.backstop.withdrawn)}</span>
                      </div>
                      {unrealizedData.backstopCurrentUsd > 0 && (
                        <>
                          <div className="flex justify-between pt-1 border-t border-border/50">
                            <span className="text-muted-foreground">Current Balance</span>
                            <span className="tabular-nums">{formatUsd(unrealizedData.backstopCurrentUsd)}</span>
                          </div>
                          <div className="flex justify-between font-medium">
                            <span>P&L</span>
                            <span className={`tabular-nums ${unrealizedData.backstopUnrealized >= 0 ? "text-green-500" : "text-red-500"}`}>
                              {unrealizedData.backstopUnrealized >= 0 ? "+" : ""}{formatUsd(unrealizedData.backstopUnrealized)}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Emissions */}
                {data.emissions.usdValue > 0 && (
                  <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-full bg-yellow-500/10">
                        <Flame className="h-3.5 w-3.5 text-yellow-500" />
                      </div>
                      <p className="font-medium text-sm">
                        <InfoLabel label="Emissions Claimed" tooltip="BLND and LP tokens received as rewards from pool and backstop positions." />
                      </p>
                    </div>
                    <div className="pl-7 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">BLND Received</span>
                        <span className="tabular-nums">{formatNumber(data.emissions.blndClaimed, 0)} BLND</span>
                      </div>
                      {data.emissions.lpClaimed > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">LP Received</span>
                          <span className="tabular-nums">{formatNumber(data.emissions.lpClaimed, 2)} LP</span>
                        </div>
                      )}
                      <div className="flex justify-between font-medium pt-1 border-t border-border/50">
                        <span>USD Value</span>
                        <span className="tabular-nums text-green-500">+{formatUsd(data.emissions.usdValue)}</span>
                      </div>
                    </div>
                  </div>
                )}

                <Separator />

                {/* Summary */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-sm">
                    <p className="text-muted-foreground">Total Deposited</p>
                    <p className="font-medium tabular-nums">{formatUsd(data.totalDepositedUsd)}</p>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <p className="text-muted-foreground">Total Withdrawn</p>
                    <p className="font-medium tabular-nums">{formatUsd(data.totalWithdrawnUsd)}</p>
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
                        <p className={`text-lg font-bold tabular-nums ${unrealizedData.totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                          {unrealizedData.totalPnl >= 0 ? "+" : ""}{formatUsd(unrealizedData.totalPnl)}
                        </p>
                      </div>
                    </>
                  )}
                  {unrealizedData.totalCurrentUsd === 0 && (
                    <>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <p className="font-semibold">{data.realizedPnl >= 0 ? "Realized Profit" : "Net Cash Flow"}</p>
                        <p className={`text-lg font-bold tabular-nums ${data.realizedPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                          {data.realizedPnl >= 0 ? "+" : ""}{formatUsd(data.realizedPnl)}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Per-Pool Breakdown */}
            {perPoolBreakdown.length > 1 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Activity by Pool</CardTitle>
                  <CardDescription className="text-xs">
                    Deposits and withdrawals per pool
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {perPoolBreakdown.map((poolData) => {
                    return (
                      <div
                        key={`${poolData.poolId}-${poolData.source}`}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 text-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${poolData.source === 'pool' ? 'bg-blue-500' : 'bg-purple-500'}`} />
                          <div className="min-w-0">
                            <p className="font-medium truncate">
                              {poolData.poolName || poolData.poolId.slice(0, 8) + '...'}
                            </p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {poolData.source}
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2 text-xs">
                          <p className="tabular-nums">
                            <span className="text-muted-foreground">In:</span> {formatUsd(poolData.deposited)}
                          </p>
                          <p className="tabular-nums">
                            <span className="text-muted-foreground">Out:</span> {formatUsd(poolData.withdrawn)}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            )}

            {/* Transaction History */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-medium">Transaction History</CardTitle>
                    <CardDescription className="text-xs">
                      {data.transactions.length} total transactions
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger className="w-24 h-7 text-xs">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="deposit">Deposits</SelectItem>
                        <SelectItem value="withdraw">Withdrawals</SelectItem>
                        <SelectItem value="claim">Claims</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={sourceFilter} onValueChange={setSourceFilter}>
                      <SelectTrigger className="w-24 h-7 text-xs">
                        <SelectValue placeholder="Source" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="pool">Pools</SelectItem>
                        <SelectItem value="backstop">Backstop</SelectItem>
                      </SelectContent>
                    </Select>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="sm" onClick={handleExportCSV} className="h-7 px-2">
                            <Download className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Export to CSV</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <div className="border-t">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs h-9 pl-6">Date</TableHead>
                        <TableHead className="text-xs h-9">Type</TableHead>
                        <TableHead className="text-xs h-9">Asset</TableHead>
                        <TableHead className="text-xs h-9 text-right">Amount</TableHead>
                        <TableHead className="text-xs h-9 text-right">Price</TableHead>
                        <TableHead className="text-xs h-9 text-right">Value</TableHead>
                        <TableHead className="text-xs h-9 text-right pr-6">
                          <InfoLabel label="Running Net" tooltip="Cumulative Withdrawn minus Deposited at each point in time." />
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactionsWithRunningNet.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8 text-sm">
                            No transactions match the filters
                          </TableCell>
                        </TableRow>
                      ) : (
                        transactionsWithRunningNet.slice(0, 50).map((tx, i) => (
                          <TableRow key={`${tx.txHash}-${i}`} className="text-xs">
                            <TableCell className="pl-6 py-2">{formatShortDate(tx.date)}</TableCell>
                            <TableCell className="py-2">
                              <Badge
                                variant="outline"
                                className={`text-[10px] px-1.5 py-0 ${
                                  tx.type === "deposit"
                                    ? "text-blue-500 border-blue-500/30 bg-blue-500/5"
                                    : tx.type === "withdraw"
                                    ? "text-green-500 border-green-500/30 bg-green-500/5"
                                    : "text-yellow-500 border-yellow-500/30 bg-yellow-500/5"
                                }`}
                              >
                                {tx.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-2">
                              <span>{tx.asset}</span>
                              <span className="text-muted-foreground ml-1">({tx.source})</span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums py-2">
                              {formatNumber(tx.amount, tx.asset === "BLND" ? 0 : 2)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums py-2 text-muted-foreground">
                              ${formatNumber(tx.priceUsd, tx.priceUsd < 0.01 ? 4 : 2)}
                            </TableCell>
                            <TableCell className={`text-right tabular-nums py-2 font-medium ${tx.type === "deposit" ? "" : "text-green-500"}`}>
                              {tx.type === "deposit" ? "-" : "+"}{formatUsd(tx.valueUsd)}
                            </TableCell>
                            <TableCell className={`text-right tabular-nums py-2 pr-6 ${tx.runningNet >= 0 ? "text-green-500" : "text-red-500"}`}>
                              {tx.runningNet >= 0 ? "+" : ""}{formatUsd(tx.runningNet)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                  {transactionsWithRunningNet.length > 50 && (
                    <div className="p-3 text-center text-xs text-muted-foreground border-t bg-muted/30">
                      Showing first 50 of {transactionsWithRunningNet.length} transactions.
                      <Button variant="link" onClick={handleExportCSV} className="ml-1 p-0 h-auto text-xs">
                        Export all to CSV
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

export default function RealizedYieldPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <RealizedYieldContent />
    </Suspense>
  )
}
