"use client"

import { useState, useEffect, useMemo } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, TrendingUp, TrendingDown, AlertTriangle, ExternalLink, Lock, Unlock, PiggyBank } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { fetchWalletBlendSnapshot, type BlendReservePosition, type BlendPoolEstimate } from "@/lib/blend/positions"
import { toTrackedPools } from "@/lib/blend/pools"
import { useMetadata } from "@/hooks/use-metadata"
import { TokenLogo } from "@/components/token-logo"

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

function formatNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "0"
  if (value >= 1000000) {
    return (value / 1000000).toLocaleString("en-US", { maximumFractionDigits: 2 }) + "M"
  }
  if (value >= 1000) {
    return (value / 1000).toLocaleString("en-US", { maximumFractionDigits: 2 }) + "K"
  }
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function formatPercent(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "0%"
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`
}

// Summary stats at top
function PoolSummary({ estimate }: { estimate: BlendPoolEstimate }) {
  const healthPercent = Math.min(estimate.borrowLimit * 100, 100)
  const isDanger = estimate.borrowLimit >= 0.8
  const isWarning = estimate.borrowLimit >= 0.5 && estimate.borrowLimit < 0.8

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card className="py-3">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Supplied</p>
          <p className="text-xl font-semibold">{formatUsd(estimate.totalSupplied)}</p>
          <div className="flex items-center gap-1 mt-1">
            <TrendingUp className="h-3 w-3 text-green-500" />
            <span className="text-xs text-green-500">{formatPercent(estimate.supplyApy)} APY</span>
          </div>
        </CardContent>
      </Card>

      <Card className="py-3">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Borrowed</p>
          <p className="text-xl font-semibold">{formatUsd(estimate.totalBorrowed)}</p>
          {estimate.totalBorrowed > 0 && (
            <div className="flex items-center gap-1 mt-1">
              <TrendingDown className="h-3 w-3 text-red-500" />
              <span className="text-xs text-red-500">{formatPercent(estimate.borrowApy)} APY</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="py-3">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Net APY</p>
          <p className={`text-xl font-semibold ${estimate.netApy >= 0 ? "text-green-500" : "text-red-500"}`}>
            {formatPercent(estimate.netApy)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Capacity: {formatUsd(estimate.borrowCap)}
          </p>
        </CardContent>
      </Card>

      <Card className="py-3">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Borrow Limit</p>
          <div className="flex items-center gap-2">
            <p className={`text-xl font-semibold ${isDanger ? "text-red-500" : isWarning ? "text-yellow-500" : "text-green-500"}`}>
              {formatPercent(healthPercent)}
            </p>
            {isDanger && <AlertTriangle className="h-4 w-4 text-red-500" />}
          </div>
          <Progress
            value={healthPercent}
            className={`h-1.5 mt-2 ${
              isDanger ? "[&>div]:bg-red-500" :
              isWarning ? "[&>div]:bg-yellow-500" :
              "[&>div]:bg-green-500"
            }`}
          />
        </CardContent>
      </Card>
    </div>
  )
}

// Asset row for the positions table
function AssetRow({ position }: { position: BlendReservePosition }) {
  const hasCollateral = position.collateralAmount > 0
  const hasNonCollateral = position.nonCollateralAmount > 0
  const hasBorrow = position.borrowAmount > 0

  return (
    <div className="py-4 border-b last:border-0">
      {/* Top row: Token info and APY badges */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <TokenLogo
            src={`/tokens/${position.symbol.toLowerCase()}.png`}
            symbol={position.symbol}
            size={32}
          />
          <div>
            <p className="font-medium">{position.symbol}</p>
            <p className="text-xs text-muted-foreground">
              {position.price?.usdPrice ? formatUsd(position.price.usdPrice, 4) : "-"}
            </p>
          </div>
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          <Badge variant="secondary" className="text-xs">
            <TrendingUp className="mr-1 h-3 w-3 text-green-500" />
            {formatPercent(position.supplyApy)}
          </Badge>
          {position.blndApy > 0 && (
            <Badge variant="outline" className="text-xs">
              <PiggyBank className="mr-1 h-3 w-3" />
              +{formatPercent(position.blndApy)}
            </Badge>
          )}
          {hasBorrow && (
            <Badge variant="destructive" className="text-xs">
              {formatPercent(position.borrowApy)} borrow
            </Badge>
          )}
        </div>
      </div>

      {/* Position details grid */}
      <div className="grid grid-cols-4 gap-4 text-sm">
        {/* Collateral */}
        <div>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <Lock className="h-3 w-3 text-amber-500" />
            Collateral
          </p>
          {hasCollateral ? (
            <>
              <p className="font-mono text-white">{formatNumber(position.collateralAmount)}</p>
              <p className="text-xs text-muted-foreground">{formatUsd(position.collateralUsdValue)}</p>
            </>
          ) : (
            <p className="text-muted-foreground">-</p>
          )}
        </div>

        {/* Non-Collateral */}
        <div>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <Unlock className="h-3 w-3 text-green-500" />
            Non-Collateral
          </p>
          {hasNonCollateral ? (
            <>
              <p className="font-mono text-white">{formatNumber(position.nonCollateralAmount)}</p>
              <p className="text-xs text-muted-foreground">{formatUsd(position.nonCollateralUsdValue)}</p>
            </>
          ) : (
            <p className="text-muted-foreground">-</p>
          )}
        </div>

        {/* Borrowed */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Borrowed</p>
          {hasBorrow ? (
            <>
              <p className="font-mono text-red-400">{formatNumber(position.borrowAmount)}</p>
              <p className="text-xs text-red-400">{formatUsd(position.borrowUsdValue)}</p>
            </>
          ) : (
            <p className="text-muted-foreground">-</p>
          )}
        </div>

        {/* Reserve Info */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Utilization</p>
          <div className="flex items-center gap-2">
            <Progress value={position.reserveUtilization * 100} className="h-1.5 flex-1" />
            <span className="text-xs">{formatPercent(position.reserveUtilization * 100)}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            CF: {formatPercent(position.collateralFactor * 100)} · LF: {formatPercent(position.liabilityFactor * 100)}
          </p>
        </div>
      </div>
    </div>
  )
}

// Mobile asset card
function MobileAssetCard({ position }: { position: BlendReservePosition }) {
  const hasCollateral = position.collateralAmount > 0
  const hasNonCollateral = position.nonCollateralAmount > 0
  const hasBorrow = position.borrowAmount > 0

  return (
    <div className="py-4 border-b last:border-0">
      {/* Header with token and APY badges */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <TokenLogo
            src={`/tokens/${position.symbol.toLowerCase()}.png`}
            symbol={position.symbol}
            size={32}
          />
          <div>
            <p className="font-medium">{position.symbol}</p>
            <p className="text-xs text-muted-foreground">
              {position.price?.usdPrice ? formatUsd(position.price.usdPrice, 4) : "-"}
            </p>
          </div>
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          <Badge variant="secondary" className="text-xs">
            <TrendingUp className="mr-1 h-3 w-3 text-green-500" />
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

      {/* Position details */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        {hasCollateral && (
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
              <Lock className="h-3 w-3 text-amber-500" />
              Collateral
            </p>
            <p className="font-mono text-white">{formatNumber(position.collateralAmount)}</p>
            <p className="text-xs text-muted-foreground">{formatUsd(position.collateralUsdValue)}</p>
          </div>
        )}

        {hasNonCollateral && (
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
              <Unlock className="h-3 w-3 text-green-500" />
              Non-Collateral
            </p>
            <p className="font-mono text-white">{formatNumber(position.nonCollateralAmount)}</p>
            <p className="text-xs text-muted-foreground">{formatUsd(position.nonCollateralUsdValue)}</p>
          </div>
        )}

        {hasBorrow && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Borrowed</p>
            <p className="font-mono text-red-400">{formatNumber(position.borrowAmount)}</p>
            <p className="text-xs text-red-400">{formatUsd(position.borrowUsdValue)}</p>
            <Badge variant="destructive" className="text-xs mt-1">
              {formatPercent(position.borrowApy)} APY
            </Badge>
          </div>
        )}
      </div>

      {/* Reserve info */}
      <div className="mt-3 pt-3 border-t border-border/50">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Utilization</span>
          <div className="flex items-center gap-2">
            <Progress value={position.reserveUtilization * 100} className="w-16 h-1.5" />
            <span>{formatPercent(position.reserveUtilization * 100)}</span>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs mt-1">
          <span className="text-muted-foreground">Collateral Factor</span>
          <span>{formatPercent(position.collateralFactor * 100)}</span>
        </div>
        <div className="flex items-center justify-between text-xs mt-1">
          <span className="text-muted-foreground">Liability Factor</span>
          <span>{formatPercent(position.liabilityFactor * 100)}</span>
        </div>
      </div>
    </div>
  )
}

// Page header component to reduce duplication
function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="border-b">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold truncate">{title}</h1>
            {subtitle && (
              <p className="text-xs text-muted-foreground font-mono truncate">{subtitle}</p>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

export default function PoolDetailsPage() {
  const params = useParams()
  const poolId = decodeURIComponent(params.poolId as string)
  const [activeWallet, setActiveWallet] = useState<Wallet | null>(null)

  const { pools: dbPools } = useMetadata()
  const trackedPools = useMemo(() => toTrackedPools(dbPools), [dbPools])

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

  const { data: snapshot, isLoading, error } = useQuery({
    queryKey: ["blend-wallet-snapshot", activeWallet?.publicKey, trackedPools.map(p => p.id).join(',')],
    enabled: !!activeWallet?.publicKey && trackedPools.length > 0,
    queryFn: () => fetchWalletBlendSnapshot(activeWallet?.publicKey, trackedPools),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })

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

  // Get pool info from tracked pools for explorer link
  const poolInfo = trackedPools.find(p => p.id === poolId)

  if (!activeWallet) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader title="Pool Details" />
        <main className="container mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <h2 className="text-2xl font-semibold mb-4">No Wallet Connected</h2>
            <p className="text-muted-foreground mb-8 max-w-md">
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
        <PageHeader title="Pool Details" />
        <main className="container mx-auto px-4 py-8">
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
            <div className="h-64 bg-muted animate-pulse rounded-lg" />
          </div>
        </main>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader title="Pool Details" />
        <main className="container mx-auto px-4 py-8">
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
        <PageHeader title="Pool Details" />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-8 text-muted-foreground">
            <p>No data found for this pool.</p>
            <p className="text-sm mt-2">
              The pool ID might be invalid or you don&apos;t have positions in this pool.
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
      <PageHeader title={`${poolData.poolName} Pool`} />

      <main className="container mx-auto px-4 py-6">
        <div className="space-y-6">
          {/* Summary Stats */}
          <PoolSummary estimate={poolData.estimate} />

          {/* Positions */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Your Positions</CardTitle>
                <a
                  href={`https://stellar.expert/explorer/public/contract/${poolId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  View on Explorer
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </CardHeader>
            <CardContent>
              {/* Desktop */}
              <div className="hidden md:block">
                {poolData.positions.map((position) => (
                  <AssetRow key={position.id} position={position} />
                ))}
              </div>

              {/* Mobile */}
              <div className="md:hidden">
                {poolData.positions.map((position) => (
                  <MobileAssetCard key={position.id} position={position} />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
