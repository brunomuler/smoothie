"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import {
  TrendingUp,
  TrendingDown,
  Lock,
  Unlock,
  AlertTriangle,
  Info,
  PiggyBank,
} from "lucide-react"
import type { BlendReservePosition, BlendPoolEstimate, BlendWalletSnapshot } from "@/lib/blend/positions"

interface PositionFullInfoProps {
  snapshot: BlendWalletSnapshot
  isLoading?: boolean
}

function formatUsd(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "$0.00"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

function formatNumber(value: number, decimals = 4): string {
  if (!Number.isFinite(value)) return "0"
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function formatPercent(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "0.00%"
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`
}

function HealthIndicator({ borrowLimit }: { borrowLimit: number }) {
  // borrowLimit is 0-1, where 1 means at liquidation threshold
  const healthPercent = Math.min(borrowLimit * 100, 100)
  const isHealthy = borrowLimit < 0.5
  const isWarning = borrowLimit >= 0.5 && borrowLimit < 0.8
  const isDanger = borrowLimit >= 0.8

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Borrow Limit Used</span>
        <span className={
          isDanger ? "text-red-500 font-medium" :
          isWarning ? "text-yellow-500 font-medium" :
          "text-green-500 font-medium"
        }>
          {formatPercent(healthPercent)}
        </span>
      </div>
      <Progress
        value={healthPercent}
        className={`h-2 ${
          isDanger ? "[&>div]:bg-red-500" :
          isWarning ? "[&>div]:bg-yellow-500" :
          "[&>div]:bg-green-500"
        }`}
      />
      {isDanger && (
        <div className="flex items-center gap-1 text-xs text-red-500">
          <AlertTriangle className="h-3 w-3" />
          <span>High liquidation risk</span>
        </div>
      )}
    </div>
  )
}

function PoolEstimateCard({ estimate }: { estimate: BlendPoolEstimate }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{estimate.poolName}</CardTitle>
        <CardDescription className="font-mono text-xs truncate">
          {estimate.poolId}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <HealthIndicator borrowLimit={estimate.borrowLimit} />

        <Separator />

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Total Supplied</p>
            <p className="font-medium">{formatUsd(estimate.totalSupplied)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Total Borrowed</p>
            <p className="font-medium">{formatUsd(estimate.totalBorrowed)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Effective Collateral</p>
            <p className="font-medium">{formatUsd(estimate.totalEffectiveCollateral)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Effective Liabilities</p>
            <p className="font-medium">{formatUsd(estimate.totalEffectiveLiabilities)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Borrow Capacity</p>
            <p className="font-medium text-green-600">{formatUsd(estimate.borrowCap)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Net APY</p>
            <p className={`font-medium ${estimate.netApy >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatPercent(estimate.netApy)}
            </p>
          </div>
        </div>

        <Separator />

        <div className="flex gap-4 text-sm">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="text-xs">
                  <TrendingUp className="mr-1 h-3 w-3 text-green-500" />
                  Supply: {formatPercent(estimate.supplyApy)}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Average supply APY across reserves</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {estimate.totalBorrowed > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="text-xs">
                    <TrendingDown className="mr-1 h-3 w-3 text-red-500" />
                    Borrow: {formatPercent(estimate.borrowApy)}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Average borrow APY across reserves</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function PositionDetailRow({ position }: { position: BlendReservePosition }) {
  const hasCollateral = position.collateralAmount > 0
  const hasNonCollateral = position.nonCollateralAmount > 0
  const hasBorrow = position.borrowAmount > 0

  return (
    <TableRow>
      <TableCell>
        <span className="font-medium">{position.symbol}</span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-col items-end">
          <span>{formatNumber(position.supplyAmount)}</span>
          <span className="text-xs text-muted-foreground">{formatUsd(position.supplyUsdValue)}</span>
        </div>
      </TableCell>
      <TableCell className="text-right">
        {hasCollateral ? (
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1">
              <Lock className="h-3 w-3 text-amber-500" />
              <span>{formatNumber(position.collateralAmount)}</span>
            </div>
            <span className="text-xs text-muted-foreground">{formatUsd(position.collateralUsdValue)}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        {hasNonCollateral ? (
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1">
              <Unlock className="h-3 w-3 text-green-500" />
              <span>{formatNumber(position.nonCollateralAmount)}</span>
            </div>
            <span className="text-xs text-muted-foreground">{formatUsd(position.nonCollateralUsdValue)}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        {hasBorrow ? (
          <div className="flex flex-col items-end text-red-600">
            <span>{formatNumber(position.borrowAmount)}</span>
            <span className="text-xs">{formatUsd(position.borrowUsdValue)}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-col items-end gap-1">
          <Badge variant="secondary" className="text-xs">
            <TrendingUp className="mr-1 h-3 w-3" />
            {formatPercent(position.supplyApy)}
          </Badge>
          {position.blndApy > 0 && (
            <Badge variant="outline" className="text-xs">
              <PiggyBank className="mr-1 h-3 w-3" />
              +{formatPercent(position.blndApy)}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        {hasBorrow ? (
          <Badge variant="destructive" className="text-xs">
            <TrendingDown className="mr-1 h-3 w-3" />
            {formatPercent(position.borrowApy)}
          </Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
    </TableRow>
  )
}

function ReserveDetailsTable({ positions }: { positions: BlendReservePosition[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info className="h-5 w-5" />
          Reserve Details
        </CardTitle>
        <CardDescription>
          Detailed information about each reserve including rates and factors
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">b_rate</TableHead>
              <TableHead className="text-right">d_rate</TableHead>
              <TableHead className="text-right">Collateral Factor</TableHead>
              <TableHead className="text-right">Liability Factor</TableHead>
              <TableHead className="text-right">Utilization</TableHead>
              <TableHead className="text-right">Pool Supply</TableHead>
              <TableHead className="text-right">Pool Borrow</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position) => (
              <TableRow key={position.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{position.symbol}</span>
                    <span className="text-xs text-muted-foreground">{position.poolName}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {position.price?.usdPrice ? formatUsd(position.price.usdPrice, 4) : "-"}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {formatNumber(position.bRate, 9)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {formatNumber(position.dRate, 9)}
                </TableCell>
                <TableCell className="text-right">
                  {formatPercent(position.collateralFactor * 100)}
                </TableCell>
                <TableCell className="text-right">
                  {formatPercent(position.liabilityFactor * 100)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Progress value={position.reserveUtilization * 100} className="w-16 h-2" />
                    <span className="text-xs">{formatPercent(position.reserveUtilization * 100)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-col items-end">
                    <span>{formatNumber(position.reserveTotalSupply, 2)}</span>
                    <span className="text-xs text-muted-foreground">{position.symbol}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-col items-end">
                    <span>{formatNumber(position.reserveTotalBorrow, 2)}</span>
                    <span className="text-xs text-muted-foreground">{position.symbol}</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function PositionFullInfo({ snapshot, isLoading }: PositionFullInfoProps) {
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-48 bg-muted animate-pulse rounded-lg" />
        <div className="h-96 bg-muted animate-pulse rounded-lg" />
      </div>
    )
  }

  if (snapshot.positions.length === 0) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Pool Estimates */}
      {snapshot.poolEstimates.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Pool Health & Borrow Capacity</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {snapshot.poolEstimates.map((estimate) => (
              <PoolEstimateCard key={estimate.poolId} estimate={estimate} />
            ))}
          </div>
        </div>
      )}

      {/* Position Details Grouped by Pool */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Position Breakdown</h3>
        {Object.entries(
          snapshot.positions.reduce((acc, position) => {
            if (!acc[position.poolId]) {
              acc[position.poolId] = {
                poolName: position.poolName,
                positions: []
              }
            }
            acc[position.poolId].positions.push(position)
            return acc
          }, {} as Record<string, { poolName: string; positions: BlendReservePosition[] }>)
        ).map(([poolId, { poolName, positions }]) => (
          <Card key={poolId}>
            <CardHeader>
              <CardTitle>{poolName}</CardTitle>
              <CardDescription className="font-mono text-xs truncate">
                {poolId}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead className="text-right">Total Supply</TableHead>
                    <TableHead className="text-right">Collateral</TableHead>
                    <TableHead className="text-right">Non-Collateral</TableHead>
                    <TableHead className="text-right">Borrowed</TableHead>
                    <TableHead className="text-right">Supply APY</TableHead>
                    <TableHead className="text-right">Borrow APY</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions.map((position) => (
                    <PositionDetailRow key={position.id} position={position} />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Reserve Details */}
      <ReserveDetailsTable positions={snapshot.positions} />
    </div>
  )
}
