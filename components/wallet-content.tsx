"use client"

import { memo, useMemo } from "react"
import { useWalletState } from "@/hooks/use-wallet-state"
import { useHorizonBalances, type TokenBalance, type TokenPriceInfo } from "@/hooks/use-horizon-balances"
import { useTokenBalance } from "@/hooks/use-token-balance"
import { TokenLogo } from "@/components/token-logo"
import { TokenSparklineBg } from "@/components/token-sparkline-bg"
import { Card, CardContent } from "@/components/ui/card"
import { Droplets } from "lucide-react"
import { WalletTokensSkeleton } from "@/components/wallet-tokens/skeleton"

// LP Token contract ID to check
const LP_TOKEN_CONTRACT_ID = "CAS3FL6TLZKDGGSISDBWGGPXT3NRR4DYTZD7YOD3HMYO6LTJUVGRVEAM"

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

// Format USD value - always 2 decimals
function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// Generate token icon URL
function getTokenIconUrl(assetCode: string, assetIssuer: string | null): string | null {
  // Native XLM - use local icon
  if (!assetIssuer) {
    return "/tokens/xlm.png"
  }

  // Use our API endpoint that fetches from stellar.toml
  return `/api/token-icon?code=${encodeURIComponent(assetCode)}&issuer=${encodeURIComponent(assetIssuer)}`
}

// Memoized token item to prevent unnecessary re-renders
interface TokenItemProps {
  token: TokenBalance
}

const TokenItem = memo(function TokenItem({ token }: TokenItemProps) {
  const logoUrl = getTokenIconUrl(token.assetCode, token.assetIssuer)
  const balance = parseFloat(token.balance)

  // Display: prefer home_domain, fallback to shortened issuer
  const issuerDisplay = token.assetType === "native"
    ? "Native"
    : token.assetType === "liquidity_pool_shares"
    ? "LP Shares"
    : token.homeDomain
    ? token.homeDomain
    : token.assetIssuer
    ? `${token.assetIssuer.slice(0, 4)}...${token.assetIssuer.slice(-4)}`
    : "Unknown"

  return (
    <div className="relative flex items-center justify-between py-2 gap-3">
      {/* Background sparkline for tokens with price data */}
      {token.tokenAddress && (
        <TokenSparklineBg tokenAddress={token.tokenAddress} />
      )}

      <div className="relative flex items-center gap-3 min-w-0">
        <TokenLogo
          src={logoUrl}
          symbol={token.assetCode}
          size={36}
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{token.assetCode}</p>
          <p className="text-xs text-muted-foreground truncate">
            {issuerDisplay}
          </p>
        </div>
      </div>
      <div className="relative text-right shrink-0">
        {token.usdValue !== undefined && token.usdValue > 0 && (
          <p className="font-medium">
            ${formatUsd(token.usdValue)}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{formatBalance(balance)}</p>
      </div>
    </div>
  )
})

// LP Token item component
interface LpTokenItemProps {
  balance: string
  usdValue?: number
  isLoading: boolean
}

const LpTokenItem = memo(function LpTokenItem({ balance, usdValue, isLoading }: LpTokenItemProps) {
  const balanceNum = parseFloat(balance) / 1e7 // Soroban tokens have 7 decimals

  if (isLoading) {
    return (
      <div className="flex items-center justify-between py-2 gap-3 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-muted" />
          <div className="space-y-1.5">
            <div className="h-4 w-16 bg-muted rounded" />
            <div className="h-3 w-24 bg-muted rounded" />
          </div>
        </div>
        <div className="text-right space-y-1.5">
          <div className="h-4 w-20 bg-muted rounded" />
          <div className="h-3 w-16 bg-muted rounded ml-auto" />
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex items-center justify-between py-2 gap-3">
      {/* Background sparkline for LP token */}
      <TokenSparklineBg tokenAddress={LP_TOKEN_CONTRACT_ID} />

      <div className="relative flex items-center gap-3 min-w-0">
        <div className="h-9 w-9 rounded-full bg-purple-500/10 flex items-center justify-center">
          <Droplets className="h-5 w-5 text-purple-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">BLND-USDC LP</p>
          <p className="text-xs text-muted-foreground truncate">
            blend.capital
          </p>
        </div>
      </div>
      <div className="relative text-right shrink-0">
        {usdValue !== undefined && usdValue > 0 && (
          <p className="font-medium">${formatUsd(usdValue)}</p>
        )}
        <p className="text-xs text-muted-foreground">{formatBalance(balanceNum)}</p>
      </div>
    </div>
  )
})

// Helper to find LP token price from price map by address
function findLpTokenPrice(priceMap: Map<string, TokenPriceInfo> | undefined): number | null {
  if (!priceMap) return null
  for (const priceInfo of priceMap.values()) {
    if (priceInfo.address === LP_TOKEN_CONTRACT_ID) {
      return priceInfo.price
    }
  }
  return null
}

export function WalletContent() {
  const { activeWallet, isHydrated } = useWalletState()
  const publicKey = activeWallet?.publicKey

  // Fetch all tokens from Horizon (returns balances and price map)
  const {
    data: horizonData,
    isLoading: isLoadingHorizon,
  } = useHorizonBalances(publicKey)

  // Fetch LP token balance via RPC
  const {
    data: lpTokenBalance,
    isLoading: isLoadingLpToken,
  } = useTokenBalance(LP_TOKEN_CONTRACT_ID, publicKey)

  // Extract balances and LP token price from horizon data
  const horizonBalances = horizonData?.balances
  const lpTokenPrice = useMemo(
    () => findLpTokenPrice(horizonData?.priceMap),
    [horizonData?.priceMap]
  )

  // Show skeleton while loading
  if (!isHydrated || isLoadingHorizon) {
    return <WalletTokensSkeleton />
  }

  // Sort balances by amount (highest first)
  const sortedBalances = (horizonBalances || [])
    .sort((a, b) => parseFloat(b.balance) - parseFloat(a.balance))

  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 className="text-lg font-semibold">Token Balances</h2>

      <Card className="py-2 gap-0">
        <CardContent className="px-4 py-2">
          {sortedBalances.length === 0 && !isLoadingLpToken ? (
            <div className="py-4 text-center text-muted-foreground">
              No tokens found in this wallet
            </div>
          ) : (
            <div className="space-y-1">
              {sortedBalances.map((token, index) => (
                <TokenItem
                  key={`${token.assetCode}-${token.assetIssuer || "native"}-${index}`}
                  token={token}
                />
              ))}

              {/* LP Token from RPC */}
              <LpTokenItem
                balance={lpTokenBalance || "0"}
                usdValue={lpTokenPrice && lpTokenBalance ? (parseFloat(lpTokenBalance) / 1e7) * lpTokenPrice : undefined}
                isLoading={isLoadingLpToken}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
