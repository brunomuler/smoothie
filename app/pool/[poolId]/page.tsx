"use client"

import { useState, useEffect, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { fetchWalletBlendSnapshot, type BlendWalletSnapshot, type BlendReservePosition, type BlendPoolEstimate } from "@/lib/blend/positions"

const WALLETS_STORAGE_KEY = "stellar-wallet-tracked-addresses"
const ACTIVE_WALLET_STORAGE_KEY = "stellar-wallet-active-id"

interface Wallet {
  id: string
  publicKey: string
  name?: string
  isActive: boolean
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

function PoolHealthCard({ estimate }: { estimate: BlendPoolEstimate }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Pool Health & Borrow Capacity
        </CardTitle>
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
            {formatPercent(position.borrowApy)}
          </Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
    </TableRow>
  )
}

// Mobile-friendly position card
function MobilePositionCard({ position }: { position: BlendReservePosition }) {
  const hasCollateral = position.collateralAmount > 0
  const hasNonCollateral = position.nonCollateralAmount > 0
  const hasBorrow = position.borrowAmount > 0

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-lg">{position.symbol}</span>
        <div className="flex gap-1 flex-wrap justify-end">
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
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-muted-foreground text-xs">Total Supply</p>
          <p className="font-medium">{formatNumber(position.supplyAmount)}</p>
          <p className="text-xs text-muted-foreground">{formatUsd(position.supplyUsdValue)}</p>
        </div>

        {hasCollateral && (
          <div>
            <p className="text-muted-foreground text-xs flex items-center gap-1">
              <Lock className="h-3 w-3 text-amber-500" />
              Collateral
            </p>
            <p className="font-medium">{formatNumber(position.collateralAmount)}</p>
            <p className="text-xs text-muted-foreground">{formatUsd(position.collateralUsdValue)}</p>
          </div>
        )}

        {hasNonCollateral && (
          <div>
            <p className="text-muted-foreground text-xs flex items-center gap-1">
              <Unlock className="h-3 w-3 text-green-500" />
              Non-Collateral
            </p>
            <p className="font-medium">{formatNumber(position.nonCollateralAmount)}</p>
            <p className="text-xs text-muted-foreground">{formatUsd(position.nonCollateralUsdValue)}</p>
          </div>
        )}

        {hasBorrow && (
          <div>
            <p className="text-muted-foreground text-xs">Borrowed</p>
            <p className="font-medium text-red-600">{formatNumber(position.borrowAmount)}</p>
            <p className="text-xs text-red-600">{formatUsd(position.borrowUsdValue)}</p>
            <Badge variant="destructive" className="text-xs mt-1">
              {formatPercent(position.borrowApy)} APY
            </Badge>
          </div>
        )}
      </div>
    </div>
  )
}

function PositionBreakdownCard({ poolName, poolId, positions }: { poolName: string; poolId: string; positions: BlendReservePosition[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{poolName}</CardTitle>
        <CardDescription className="font-mono text-xs truncate">
          {poolId}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Mobile card view */}
        <div className="md:hidden space-y-3">
          {positions.map((position) => (
            <MobilePositionCard key={position.id} position={position} />
          ))}
        </div>

        {/* Desktop table view */}
        <div className="hidden md:block overflow-x-auto">
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
        </div>
      </CardContent>
    </Card>
  )
}

// Mobile-friendly reserve details card
function MobileReserveCard({ position }: { position: BlendReservePosition }) {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-medium text-lg">{position.symbol}</span>
          <p className="text-xs text-muted-foreground">{position.poolName}</p>
        </div>
        <span className="font-mono text-sm">
          {position.price?.usdPrice ? formatUsd(position.price.usdPrice, 4) : "-"}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Utilization</span>
          <div className="flex items-center gap-2">
            <Progress value={position.reserveUtilization * 100} className="w-20 h-2" />
            <span className="text-xs">{formatPercent(position.reserveUtilization * 100)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-muted-foreground text-xs">Collateral Factor</p>
          <p className="font-medium">{formatPercent(position.collateralFactor * 100)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Liability Factor</p>
          <p className="font-medium">{formatPercent(position.liabilityFactor * 100)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Pool Supply</p>
          <p className="font-medium">{formatNumber(position.reserveTotalSupply, 2)} {position.symbol}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Pool Borrow</p>
          <p className="font-medium">{formatNumber(position.reserveTotalBorrow, 2)} {position.symbol}</p>
        </div>
      </div>
    </div>
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
        {/* Mobile card view */}
        <div className="md:hidden space-y-3">
          {positions.map((position) => (
            <MobileReserveCard key={position.id} position={position} />
          ))}
        </div>

        {/* Desktop table view */}
        <div className="hidden md:block overflow-x-auto">
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
        </div>
      </CardContent>
    </Card>
  )
}

export default function PoolDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const poolId = decodeURIComponent(params.poolId as string)
  const [activeWallet, setActiveWallet] = useState<Wallet | null>(null)

  // Load active wallet from localStorage
  useEffect(() => {
    try {
      const savedWallets = localStorage.getItem(WALLETS_STORAGE_KEY)
      const savedActiveId = localStorage.getItem(ACTIVE_WALLET_STORAGE_KEY)

      if (savedWallets && savedActiveId) {
        const parsedWallets = JSON.parse(savedWallets) as Wallet[]
        const active = parsedWallets.find((w) => w.id === savedActiveId)
        if (active) {
          setActiveWallet(active)
        }
      }
    } catch (error) {
      console.error("Error loading wallet from localStorage:", error)
    }
  }, [])

  // Fetch blend snapshot for the active wallet
  const { data: snapshot, isLoading, error } = useQuery({
    queryKey: ["blend-wallet-snapshot", activeWallet?.publicKey],
    enabled: !!activeWallet?.publicKey,
    queryFn: () => fetchWalletBlendSnapshot(activeWallet?.publicKey),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  // Filter data for this specific pool
  const poolData = useMemo(() => {
    if (!snapshot) return null

    const poolEstimate = snapshot.poolEstimates.find(e => e.poolId === poolId)
    const poolPositions = snapshot.positions.filter(p => p.poolId === poolId)

    if (!poolEstimate || poolPositions.length === 0) return null

    return {
      estimate: poolEstimate,
      positions: poolPositions,
      poolName: poolPositions[0]?.poolName || "Unknown Pool"
    }
  }, [snapshot, poolId])

  if (!activeWallet) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b">
          <div className="container mx-auto px-4 py-3 sm:py-4">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </Link>
              <h1 className="text-xl sm:text-2xl font-bold">Pool Details</h1>
            </div>
          </div>
        </header>
        <main className="container mx-auto px-4 py-6 sm:py-8">
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
            <h2 className="text-2xl sm:text-3xl font-semibold mb-4">
              No Wallet Connected
            </h2>
            <p className="text-muted-foreground mb-8 max-w-md text-sm sm:text-base">
              Please connect a wallet to view pool details.
            </p>
            <Link href="/">
              <Button>Go to Home</Button>
            </Link>
          </div>
        </main>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b">
          <div className="container mx-auto px-4 py-3 sm:py-4">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </Link>
              <h1 className="text-xl sm:text-2xl font-bold">Pool Details</h1>
            </div>
          </div>
        </header>
        <main className="container mx-auto px-4 py-6 sm:py-8">
          <div className="space-y-6">
            <div className="h-48 bg-muted animate-pulse rounded-lg" />
            <div className="h-96 bg-muted animate-pulse rounded-lg" />
          </div>
        </main>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b">
          <div className="container mx-auto px-4 py-3 sm:py-4">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </Link>
              <h1 className="text-xl sm:text-2xl font-bold">Pool Details</h1>
            </div>
          </div>
        </header>
        <main className="container mx-auto px-4 py-6 sm:py-8">
          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
            <p className="text-destructive text-sm">
              Error loading pool data: {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        </main>
      </div>
    )
  }

  if (!poolData) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b">
          <div className="container mx-auto px-4 py-3 sm:py-4">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </Link>
              <h1 className="text-xl sm:text-2xl font-bold">Pool Details</h1>
            </div>
          </div>
        </header>
        <main className="container mx-auto px-4 py-6 sm:py-8">
          <div className="text-center py-8 text-muted-foreground">
            <p>No data found for this pool.</p>
            <p className="text-sm mt-2">
              The pool ID might be invalid or you don't have positions in this pool.
            </p>
            <Link href="/">
              <Button className="mt-4">Go to Home</Button>
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-3 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm" className="px-2 sm:px-3">
                <ArrowLeft className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Back</span>
              </Button>
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold truncate">{poolData.poolName}</h1>
              <p className="text-xs text-muted-foreground font-mono truncate">
                {poolId}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 sm:py-8">
        <div className="space-y-6">
          {/* Pool Health & Borrow Capacity */}
          <div className="space-y-4">
            <PoolHealthCard estimate={poolData.estimate} />
          </div>

          {/* Position Breakdown */}
          <div className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold">Position Breakdown</h2>
            <PositionBreakdownCard
              poolName={poolData.poolName}
              poolId={poolId}
              positions={poolData.positions}
            />
          </div>

          {/* Reserve Details */}
          <div className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold">Reserve Details</h2>
            <ReserveDetailsTable positions={poolData.positions} />
          </div>
        </div>
      </main>
    </div>
  )
}
