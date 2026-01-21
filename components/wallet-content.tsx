"use client"

import { memo, useMemo, useState, useEffect } from "react"
import { useQueries, useQuery } from "@tanstack/react-query"
import { useWalletState } from "@/hooks/use-wallet-state"
import { useHorizonBalances, type TokenBalance, type TokenPriceInfo } from "@/hooks/use-horizon-balances"
import { useTokenBalance } from "@/hooks/use-token-balance"
import { useBlendPositions } from "@/hooks/use-blend-positions"
import { useCurrencyPreference } from "@/hooks/use-currency-preference"
import { TokenLogo } from "@/components/token-logo"
import { TokenSparkline, Token30dChange } from "@/components/token-sparkline-bg"
import { WalletAllocationBar } from "@/components/wallet-allocation-bar"
import { Card, CardContent } from "@/components/ui/card"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Droplets } from "lucide-react"
import { WalletTokensSkeleton } from "@/components/wallet-tokens/skeleton"
import type { Wallet } from "@/types/wallet"

// LP Token contract ID to check
const LP_TOKEN_CONTRACT_ID = "CAS3FL6TLZKDGGSISDBWGGPXT3NRR4DYTZD7YOD3HMYO6LTJUVGRVEAM"

// Period type for sparkline display
type SparklinePeriod = "24h" | "7d" | "1mo"

// localStorage keys for persisting wallet state
const STORAGE_KEY_PERIOD = "wallet-selected-period"
const STORAGE_KEY_SHOW_PRICE = "wallet-show-price"

// Format balance - only show extra decimals if value is non-zero but small
function formatBalance(value: number): string {
  if (value === 0) {
    return "0.00"
  }
  // For small non-zero values, show more decimals
  if (value > 0 && value < 0.01) {
    // Find how many decimals we need to show the value
    const str = value.toFixed(8)
    // Trim trailing zeros but keep at least 2 decimals worth of significant digits
    return parseFloat(str).toString()
  }
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// Local token icons available in /public/tokens/
const LOCAL_TOKEN_ICONS = new Set([
  "xlm", "blnd", "usdc", "aqua", "gbpx", "ustry", "ousd",
  "usdglo", "eurc", "eurx", "pyusd", "tesouro", "cetes", "usdx"
])

// Generate token icon URL
function getTokenIconUrl(assetCode: string, assetIssuer: string | null, assetType?: string): string | null {
  // LP shares don't have icons via this method - handled separately
  if (assetType === "liquidity_pool_shares") {
    return null
  }

  // Check for local icon first (case-insensitive)
  const codeLower = assetCode.toLowerCase()
  if (LOCAL_TOKEN_ICONS.has(codeLower)) {
    return `/tokens/${codeLower}.png`
  }

  // Native XLM without issuer - already handled above, but keep as fallback
  if (!assetIssuer) {
    return "/tokens/xlm.png"
  }

  // Fall back to API endpoint that fetches from stellar.toml
  return `/api/token-icon?code=${encodeURIComponent(assetCode)}&issuer=${encodeURIComponent(assetIssuer)}`
}

// Generate stellar.expert URL for a token
function getStellarExpertUrl(token: TokenBalance): string {
  if (token.assetType === "native") {
    return "https://stellar.expert/explorer/public/asset/XLM"
  }
  if (token.assetType === "liquidity_pool_shares" && token.liquidityPoolId) {
    return `https://stellar.expert/explorer/public/liquidity-pool/${token.liquidityPoolId}`
  }
  if (token.assetIssuer) {
    return `https://stellar.expert/explorer/public/asset/${token.assetCode}-${token.assetIssuer}`
  }
  return "https://stellar.expert/explorer/public"
}

// Memoized token item to prevent unnecessary re-renders
interface TokenItemProps {
  token: TokenBalance
  formatCurrency: (amountUsd: number) => string
  currentPrice?: number // Current oracle price for live data
  period: SparklinePeriod
  showPrice: boolean // Show current price instead of percentage change
  onPriceToggle: () => void // Callback to toggle price/percentage display
}

const TokenItem = memo(function TokenItem({ token, formatCurrency, currentPrice, period, showPrice, onPriceToggle }: TokenItemProps) {
  const logoUrl = getTokenIconUrl(token.assetCode, token.assetIssuer, token.assetType)
  const balance = parseFloat(token.balance)
  const isLpShare = token.assetType === "liquidity_pool_shares"
  const explorerUrl = getStellarExpertUrl(token)

  return (
    <div className="flex items-center py-2 gap-3">
      {/* Left: Logo, name, balance */}
      <div className="flex items-center gap-3 min-w-0 w-32 shrink-0">
        {isLpShare ? (
          <div className="h-9 w-9 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
            <Droplets className="h-5 w-5 text-blue-500" />
          </div>
        ) : (
          <TokenLogo
            src={logoUrl}
            symbol={token.assetCode}
            size={36}
          />
        )}
        <div className="min-w-0 flex-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm sm:text-base font-medium truncate block hover:underline"
              >
                {isLpShare ? "LP" : token.assetCode}
              </a>
            </TooltipTrigger>
            {isLpShare && token.liquidityPoolId && (
              <TooltipContent>Pool: {token.liquidityPoolId.slice(0, 8)}...</TooltipContent>
            )}
          </Tooltip>
          <p className="text-xs text-muted-foreground truncate">
            {formatBalance(balance)}
          </p>
        </div>
      </div>

      {/* Middle: Sparkline - centered */}
      <div className="flex-1 flex justify-center">
        {token.tokenAddress && (
          <TokenSparkline tokenAddress={token.tokenAddress} currentPrice={currentPrice} period={period} />
        )}
      </div>

      {/* Right: Value, 30d change */}
      <div className="flex flex-col items-end shrink-0 w-24">
        {token.usdValue !== undefined ? (
          <p className="text-sm sm:text-base font-medium">
            {formatCurrency(token.usdValue)}
          </p>
        ) : (
          <p className="text-sm sm:text-base font-medium text-muted-foreground">—</p>
        )}
        {token.tokenAddress ? (
          <Token30dChange tokenAddress={token.tokenAddress} currentPrice={currentPrice} period={period} showPrice={showPrice} onToggle={onPriceToggle} />
        ) : (
          <p className="text-xs text-muted-foreground">—</p>
        )}
      </div>
    </div>
  )
})

// LP Token item component
interface LpTokenItemProps {
  balance: string
  usdValue?: number
  isLoading: boolean
  formatCurrency: (amountUsd: number) => string
  currentPrice?: number // Current LP token price
  period: SparklinePeriod
  showPrice: boolean // Show current price instead of percentage change
  onPriceToggle: () => void // Callback to toggle price/percentage display
}

const LpTokenItem = memo(function LpTokenItem({ balance, usdValue, isLoading, formatCurrency, currentPrice, period, showPrice, onPriceToggle }: LpTokenItemProps) {
  const balanceNum = parseFloat(balance) / 1e7 // Soroban tokens have 7 decimals

  if (isLoading) {
    return (
      <div className="flex items-center py-2 gap-3 animate-pulse">
        <div className="flex items-center gap-3 w-32 shrink-0">
          <div className="h-9 w-9 rounded-full bg-muted shrink-0" />
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="h-4 w-full bg-muted rounded" />
            <div className="h-3 w-16 bg-muted rounded" />
          </div>
        </div>
        <div className="flex-1 flex justify-center">
          <div className="h-8 w-full max-w-48 bg-muted rounded" />
        </div>
        <div className="flex flex-col items-end shrink-0 w-24 space-y-1.5">
          <div className="h-4 w-16 bg-muted rounded" />
          <div className="h-3 w-12 bg-muted rounded" />
        </div>
      </div>
    )
  }

  // Link to the LP token contract on stellar.expert
  const explorerUrl = `https://stellar.expert/explorer/public/contract/${LP_TOKEN_CONTRACT_ID}`

  return (
    <div className="flex items-center py-2 gap-3">
      {/* Left: Logo, name, balance */}
      <div className="flex items-center gap-3 min-w-0 w-32 shrink-0">
        <div className="h-9 w-9 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0">
          <Droplets className="h-5 w-5 text-purple-500" />
        </div>
        <div className="min-w-0 flex-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm sm:text-base font-medium truncate block hover:underline"
              >
                LP
              </a>
            </TooltipTrigger>
            <TooltipContent>BLND-USDC LP</TooltipContent>
          </Tooltip>
          <p className="text-xs text-muted-foreground truncate">
            {formatBalance(balanceNum)}
          </p>
        </div>
      </div>

      {/* Middle: Sparkline - centered */}
      <div className="flex-1 flex justify-center">
        <TokenSparkline tokenAddress={LP_TOKEN_CONTRACT_ID} currentPrice={currentPrice} period={period} />
      </div>

      {/* Right: Value, 30d change */}
      <div className="flex flex-col items-end shrink-0 w-24">
        {usdValue !== undefined ? (
          <p className="text-sm sm:text-base font-medium">{formatCurrency(usdValue)}</p>
        ) : (
          <p className="text-sm sm:text-base font-medium text-muted-foreground">—</p>
        )}
        <Token30dChange tokenAddress={LP_TOKEN_CONTRACT_ID} currentPrice={currentPrice} period={period} showPrice={showPrice} onToggle={onPriceToggle} />
      </div>
    </div>
  )
})


interface WalletContentProps {
  // Multi-wallet mode props
  selectedWalletAddresses?: Array<{ walletId: string; publicKey: string }>
  wallets?: Wallet[]
  isMultiWallet?: boolean
  walletSelector?: React.ReactNode
}

export function WalletContent({
  selectedWalletAddresses,
  wallets,
  isMultiWallet = false,
  walletSelector,
}: WalletContentProps = {}) {
  const { activeWallet, isHydrated } = useWalletState()
  const publicKey = activeWallet?.publicKey
  const { format: formatCurrency } = useCurrencyPreference()

  // Initialize state with defaults (avoid localStorage in useState to prevent hydration mismatch)
  const [selectedPeriod, setSelectedPeriod] = useState<SparklinePeriod>("1mo")
  const [showPrice, setShowPrice] = useState(false)
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false)

  // Load from localStorage after mount (client-side only)
  useEffect(() => {
    const savedPeriod = localStorage.getItem(STORAGE_KEY_PERIOD)
    if (savedPeriod === "24h" || savedPeriod === "7d" || savedPeriod === "1mo") {
      setSelectedPeriod(savedPeriod)
    }
    setShowPrice(localStorage.getItem(STORAGE_KEY_SHOW_PRICE) === "true")
    setHasLoadedFromStorage(true)
  }, [])

  // Persist selectedPeriod to localStorage (only after initial load)
  useEffect(() => {
    if (hasLoadedFromStorage) {
      localStorage.setItem(STORAGE_KEY_PERIOD, selectedPeriod)
    }
  }, [selectedPeriod, hasLoadedFromStorage])

  // Persist showPrice to localStorage (only after initial load)
  useEffect(() => {
    if (hasLoadedFromStorage) {
      localStorage.setItem(STORAGE_KEY_SHOW_PRICE, String(showPrice))
    }
  }, [showPrice, hasLoadedFromStorage])

  // Toggle between showing price and percentage for all items
  const handlePriceToggle = () => setShowPrice((prev) => !prev)

  // Single wallet mode: Fetch all tokens from Horizon
  const {
    data: singleHorizonData,
    isLoading: isLoadingSingleHorizon,
  } = useHorizonBalances(isMultiWallet ? undefined : publicKey)

  // Multi-wallet mode: Fetch raw balances for all selected wallets (no price enrichment)
  // Prices are fetched separately in a single query to avoid duplicate API calls
  const multiWalletQueries = useQueries({
    queries: (isMultiWallet && selectedWalletAddresses ? selectedWalletAddresses : []).map(
      ({ walletId, publicKey: pk }) => ({
        queryKey: ["multiWalletRawBalances", pk],
        queryFn: async () => {
          const response = await fetch(
            `/api/horizon-balances?user=${encodeURIComponent(pk)}`
          )
          if (!response.ok) {
            throw new Error("Failed to fetch balances")
          }
          const data = await response.json()
          return {
            walletId,
            publicKey: pk,
            balances: (data.balances as TokenBalance[]) || [],
          }
        },
        enabled: !!pk,
        staleTime: 30 * 1000,
      })
    ),
  })

  const isLoadingMultiBalances = multiWalletQueries.some((q) => q.isLoading)

  // Collect unique assets from all wallets for price fetching
  const allUniqueAssets = useMemo(() => {
    if (!isMultiWallet || isLoadingMultiBalances) return []

    const assetMap = new Map<string, { code: string; issuer?: string }>()
    for (const query of multiWalletQueries) {
      if (!query.data) continue
      for (const balance of query.data.balances) {
        if (balance.assetType === "liquidity_pool_shares") continue
        const key = `${balance.assetCode}-${balance.assetIssuer ?? "native"}`
        if (!assetMap.has(key)) {
          assetMap.set(key, { code: balance.assetCode, issuer: balance.assetIssuer ?? undefined })
        }
      }
    }
    return Array.from(assetMap.values())
  }, [isMultiWallet, isLoadingMultiBalances, multiWalletQueries])

  // Fetch prices once for all unique assets across all wallets
  const { data: sharedPriceMap, isLoading: isLoadingSharedPrices } = useQuery({
    queryKey: ["multiWalletPrices", allUniqueAssets.map(a => `${a.code}-${a.issuer}`).sort().join(",")],
    queryFn: async () => {
      const priceMap = new Map<string, { price: number; address: string }>()

      try {
        // 1. Fetch DB prices (single call - includes LP token and fallbacks)
        const dbResponse = await fetch("/api/token-prices-current")
        if (dbResponse.ok) {
          const dbData = await dbResponse.json()
          const prices = dbData.prices || {}
          for (const [symbol, info] of Object.entries(prices)) {
            const priceInfo = info as { price?: number; address?: string }
            if (typeof priceInfo.price === "number" && typeof priceInfo.address === "string") {
              priceMap.set(symbol, { price: priceInfo.price, address: priceInfo.address })
            }
          }
        }

        // 2. Fetch oracle prices (single call with all unique assets)
        if (allUniqueAssets.length > 0) {
          const oracleResponse = await fetch("/api/oracle-prices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assets: allUniqueAssets }),
          })
          if (oracleResponse.ok) {
            const oracleData = await oracleResponse.json()
            const oraclePrices = oracleData.prices || {}
            for (const [symbol, info] of Object.entries(oraclePrices)) {
              const priceInfo = info as { price?: number; contractId?: string }
              if (typeof priceInfo.price === "number" && typeof priceInfo.contractId === "string") {
                priceMap.set(symbol, { price: priceInfo.price, address: priceInfo.contractId })
              }
            }
          }
        }
      } catch (error) {
        console.error("[WalletContent] Error fetching shared prices:", error)
      }

      return priceMap
    },
    enabled: isMultiWallet && !isLoadingMultiBalances && allUniqueAssets.length > 0,
    staleTime: 30 * 1000,
  })

  const isLoadingMultiHorizon = isLoadingMultiBalances || isLoadingSharedPrices

  // Helper to get price info from shared price map
  const getPriceInfo = (assetCode: string): { price: number; address: string } | undefined => {
    if (!sharedPriceMap) return undefined
    // Try exact match first
    let priceInfo = sharedPriceMap.get(assetCode)
    if (priceInfo) return priceInfo
    // Try case-insensitive match
    const upperCode = assetCode.toUpperCase()
    for (const [symbol, info] of sharedPriceMap.entries()) {
      if (symbol.toUpperCase() === upperCode) {
        return info
      }
    }
    return undefined
  }

  // Aggregate multi-wallet data and enrich with shared prices
  const multiWalletData = useMemo(() => {
    if (!isMultiWallet || isLoadingMultiHorizon || !sharedPriceMap) {
      return null
    }

    const tokenMap = new Map<string, TokenBalance & { perWalletAmounts: Array<{ walletId: string; publicKey: string; balance: string; usdValue: number }> }>()
    const priceMap = new Map<string, TokenPriceInfo>()
    const perWalletTotals: Array<{ walletId: string; publicKey: string; totalUsdValue: number }> = []
    let totalValue = 0

    for (const query of multiWalletQueries) {
      if (!query.data) continue

      const { walletId, publicKey: pk, balances } = query.data
      let walletTotal = 0

      for (const balance of balances) {
        const tokenKey =
          balance.assetType === "liquidity_pool_shares"
            ? `lp-${balance.liquidityPoolId}`
            : `${balance.assetCode}-${balance.assetIssuer ?? "native"}`

        const balanceNum = parseFloat(balance.balance)

        // Enrich balance with price from shared price map
        const priceInfo = getPriceInfo(balance.assetCode)
        const usdValue = priceInfo && priceInfo.price > 0 && !isNaN(balanceNum)
          ? balanceNum * priceInfo.price
          : 0
        const tokenAddress = priceInfo?.address

        walletTotal += usdValue

        // Store price info for the output priceMap
        if (priceInfo && priceInfo.price > 0) {
          priceMap.set(balance.assetCode, {
            price: priceInfo.price,
            address: priceInfo.address,
          })
        }

        const existing = tokenMap.get(tokenKey)
        if (existing) {
          const existingBalance = parseFloat(existing.balance)
          existing.balance = (existingBalance + balanceNum).toString()
          existing.usdValue = (existing.usdValue ?? 0) + usdValue
          existing.perWalletAmounts.push({ walletId, publicKey: pk, balance: balance.balance, usdValue })
        } else {
          tokenMap.set(tokenKey, {
            ...balance,
            usdValue,
            tokenAddress,
            perWalletAmounts: [{ walletId, publicKey: pk, balance: balance.balance, usdValue }],
          })
        }
      }

      perWalletTotals.push({ walletId, publicKey: pk, totalUsdValue: walletTotal })
      totalValue += walletTotal
    }

    const balances = Array.from(tokenMap.values()).sort((a, b) => {
      if (a.assetType === "native") return -1
      if (b.assetType === "native") return 1
      if (a.assetType === "liquidity_pool_shares") return 1
      if (b.assetType === "liquidity_pool_shares") return -1
      return (b.usdValue ?? 0) - (a.usdValue ?? 0)
    })

    return { balances, priceMap, perWalletTotals, totalValue }
  }, [isMultiWallet, isLoadingMultiHorizon, sharedPriceMap, multiWalletQueries])

  // Unified data based on mode
  const horizonData = isMultiWallet ? (multiWalletData ? { balances: multiWalletData.balances, priceMap: multiWalletData.priceMap } : undefined) : singleHorizonData
  const isLoadingHorizon = isMultiWallet ? isLoadingMultiHorizon : isLoadingSingleHorizon
  const perWalletTotals = multiWalletData?.perWalletTotals

  // Fetch LP token balance via RPC (single wallet mode only for now)
  const {
    data: lpTokenBalance,
    isLoading: isLoadingLpToken,
  } = useTokenBalance(LP_TOKEN_CONTRACT_ID, isMultiWallet ? undefined : publicKey)

  // Get LP token price from Blend SDK (live price from the protocol)
  const { lpTokenPrice, isLoading: isLoadingBlend } = useBlendPositions(isMultiWallet ? undefined : publicKey)

  // Extract balances and priceMap from horizon data
  const horizonBalances = horizonData?.balances
  const priceMap = horizonData?.priceMap

  // Calculate total USD value (must be before early return to follow Rules of Hooks)
  const totalUsdValue = useMemo(() => {
    if (isMultiWallet && multiWalletData) {
      return multiWalletData.totalValue
    }
    let total = 0
    // Sum all token USD values
    for (const token of horizonBalances || []) {
      if (token.usdValue) {
        total += token.usdValue
      }
    }
    // Add LP token value if present
    if (lpTokenPrice && lpTokenBalance) {
      total += (parseFloat(lpTokenBalance) / 1e7) * lpTokenPrice
    }
    return total
  }, [isMultiWallet, multiWalletData, horizonBalances, lpTokenPrice, lpTokenBalance])

  // Sort balances (must be memoized to follow Rules of Hooks)
  const sortedBalances = useMemo(() => {
    return [...(horizonBalances || [])].sort((a, b) => {
      // XLM (native) always first
      if (a.assetType === "native") return -1
      if (b.assetType === "native") return 1
      // LP shares always last
      if (a.assetType === "liquidity_pool_shares") return 1
      if (b.assetType === "liquidity_pool_shares") return -1
      // Then sort by USD value if available, otherwise by balance
      const aValue = a.usdValue ?? parseFloat(a.balance)
      const bValue = b.usdValue ?? parseFloat(b.balance)
      return bValue - aValue
    })
  }, [horizonBalances])

  // Check if we're still waiting for LP price (only matters if user has LP tokens)
  const hasLpTokens = lpTokenBalance && parseFloat(lpTokenBalance) > 0
  const isLoadingTotalValue = !isMultiWallet && hasLpTokens && (isLoadingLpToken || isLoadingBlend || lpTokenPrice === null)

  // Show skeleton while loading
  if (!isHydrated || isLoadingHorizon) {
    return <WalletTokensSkeleton />
  }

  return (
    <div className="flex flex-col gap-4 pb-4 @container/card">
      {/* Total Portfolio Value and Period Selector */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 mb-2 pt-4 sm:pt-0">
        {/* Balance - takes available space */}
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground mb-1">Total Balance</p>
          {isLoadingTotalValue ? (
            <div className="h-10 w-40 bg-accent rounded-md animate-pulse" />
          ) : (
            <p className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl @[400px]/card:text-4xl">{formatCurrency(totalUsdValue)}</p>
          )}
        </div>

        {/* Wallet selector - stays on first row */}
        {walletSelector}

        {/* Period tabs - wraps to second row on small mobile, right-aligned */}
        <div className="max-[400px]:order-last max-[400px]:w-full max-[400px]:flex max-[400px]:justify-end">
          <Tabs
            value={selectedPeriod}
            onValueChange={(value) => setSelectedPeriod(value as SparklinePeriod)}
          >
            <TabsList className="h-8">
              <TabsTrigger value="24h" className="text-xs px-2 sm:text-sm sm:px-3">
                24h
              </TabsTrigger>
              <TabsTrigger value="7d" className="text-xs px-2 sm:text-sm sm:px-3">
                7d
              </TabsTrigger>
              <TabsTrigger value="1mo" className="text-xs px-2 sm:text-sm sm:px-3">
                1mo
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Wallet allocation bar - only shown in multi-wallet mode */}
      {isMultiWallet && wallets && perWalletTotals && perWalletTotals.length > 1 && (
        <WalletAllocationBar
          wallets={wallets}
          perWalletTotals={perWalletTotals}
          isLoading={isLoadingHorizon}
        />
      )}

      <Card className="py-2 gap-0">
        <CardContent className="px-4 py-2">
          {sortedBalances.length === 0 && !isLoadingLpToken ? (
            <div className="py-4 text-center text-muted-foreground">
              No tokens found in this wallet
            </div>
          ) : (
            <div className="space-y-3">
              {sortedBalances.map((token, index) => {
                // Get current oracle price for this token
                const currentPrice = priceMap?.get(token.assetCode)?.price
                return (
                  <TokenItem
                    key={`${token.assetCode}-${token.assetIssuer || "native"}-${index}`}
                    token={token}
                    formatCurrency={formatCurrency}
                    currentPrice={currentPrice}
                    period={selectedPeriod}
                    showPrice={showPrice}
                    onPriceToggle={handlePriceToggle}
                  />
                )
              })}

              {/* LP Token from RPC - only show if balance > 0 or still loading */}
              {(isLoadingLpToken || (lpTokenBalance && parseFloat(lpTokenBalance) > 0)) && (
                <LpTokenItem
                  balance={lpTokenBalance || "0"}
                  usdValue={lpTokenPrice && lpTokenBalance ? (parseFloat(lpTokenBalance) / 1e7) * lpTokenPrice : undefined}
                  isLoading={isLoadingLpToken}
                  formatCurrency={formatCurrency}
                  currentPrice={lpTokenPrice || undefined}
                  period={selectedPeriod}
                  showPrice={showPrice}
                  onPriceToggle={handlePriceToggle}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
