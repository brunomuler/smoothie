"use client"

import * as React from "react"
import { TrendingUp, Flame, MoreVertical, ArrowDownToLine, ArrowUpFromLine, Eye, Trash2 } from "lucide-react"
import { TokenLogo } from "@/components/token-logo"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { AssetCardData, AssetAction } from "@/types/asset-card"
import { FormattedBalance } from "@/components/formatted-balance"
import { useLiveBalance } from "@/hooks/use-live-balance"
import { useCurrencyPreference } from "@/hooks/use-currency-preference"

interface AssetCardProps {
  data: AssetCardData
  onAction?: (action: AssetAction, assetId: string) => void
  isDemoMode?: boolean
}

function formatPercentage(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.00"
  }
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatSignedPercentage(value: number): string {
  const formatted = formatPercentage(Math.abs(value))
  return value >= 0 ? `+${formatted}` : `-${formatted}`
}

function hasNonZeroPercentage(value: number): boolean {
  if (!Number.isFinite(value)) {
    return false
  }
  return Math.abs(value) >= 0.005
}

// Generate dummy data for each asset card based on index
function generateDummyAssetData(originalData: AssetCardData, index: number): AssetCardData {
  const baseAmounts = [5000, 3500, 2800, 1500]
  const baseAmount = baseAmounts[index % baseAmounts.length]

  return {
    ...originalData,
    rawBalance: baseAmount + (baseAmount * 0.08), // Add 8% yield
    apyPercentage: 7.5 + (index * 0.5), // Varying APYs
    growthPercentage: index % 2 === 0 ? 2.5 : 0, // Some have BLND APY
    earnedYield: baseAmount * 0.08,
    yieldPercentage: 8.0,
  }
}

const AssetCardComponent = ({ data, onAction, isDemoMode = false }: AssetCardProps) => {
  // Use dummy data in demo mode - generate based on data.id to maintain consistency
  const cardIndex = React.useMemo(() => {
    return parseInt(data.id.split('-')[0].slice(-1)) || 0
  }, [data.id])

  const activeData = isDemoMode ? generateDummyAssetData(data, cardIndex) : data
  const handleAction = React.useCallback((action: AssetAction) => {
    onAction?.(action, activeData.id)
  }, [onAction, activeData.id])

  const initialBalance = Number.isFinite(activeData.rawBalance) ? Math.max(activeData.rawBalance, 0) : 0
  const apyDecimal = Number.isFinite(activeData.apyPercentage)
    ? Math.max(activeData.apyPercentage, 0) / 100
    : 0

  const { displayBalance } = useLiveBalance(initialBalance, apyDecimal, null, 0)

  // Currency preference for multi-currency display
  const { format: formatInCurrency } = useCurrencyPreference()

  const formattedLiveBalance = formatInCurrency(displayBalance, {
    minimumFractionDigits: 7,
    maximumFractionDigits: 7,
  })

  // Use yield calculated as: SDK Balance - Dune Cost Basis
  const yieldToShow = activeData.earnedYield ?? 0
  const formattedYield = formatInCurrency(yieldToShow, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    showSign: true,
  })
  const hasSignificantYield = Math.abs(yieldToShow) >= 0.01

  // Use yield percentage: (Yield / Cost Basis) * 100
  const yieldPercentage = activeData.yieldPercentage ?? 0
  const formattedYieldPercentage = yieldPercentage !== 0 ? ` (${yieldPercentage >= 0 ? '+' : ''}${yieldPercentage.toFixed(2)}%)` : ''

  return (
    <Card className="@container/asset-card">
      <CardContent className="flex items-center gap-4">
        <TokenLogo
          src={activeData.logoUrl}
          symbol={activeData.assetName}
          size={48}
        />

        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <h3 className="text-base font-semibold truncate">{activeData.protocolName}</h3>
            <span className="text-sm text-muted-foreground shrink-0">{activeData.assetName}</span>
          </div>

          <div className="flex flex-col gap-1.5 @[400px]/asset-card:flex-row @[400px]/asset-card:items-center @[400px]/asset-card:gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-xl font-semibold tabular-nums font-mono">
                <FormattedBalance value={formattedLiveBalance} />
              </span>
              {hasSignificantYield && (
                <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {formattedYield} yield{formattedYieldPercentage}
                </span>
              )}
            </div>

            <div className="flex gap-1.5">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="secondary" className="text-xs">
                      <TrendingUp className="mr-1 h-3 w-3" />
                      {formatPercentage(activeData.apyPercentage)}% APY
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Annual Percentage Yield</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {hasNonZeroPercentage(activeData.growthPercentage) && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge variant="secondary" className="text-xs">
                        <Flame className="mr-1 h-3 w-3" />
                        {formatSignedPercentage(activeData.growthPercentage)}% BLND APY
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>BLND emissions APY</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                aria-label="Asset options"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => handleAction('deposit')}>
                <ArrowDownToLine className="mr-2 h-4 w-4" />
                Deposit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAction('withdraw')}>
                <ArrowUpFromLine className="mr-2 h-4 w-4" />
                Withdraw
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAction('view-details')}>
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleAction('remove')}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  )
}

// Memoize component to prevent unnecessary re-renders when parent updates
// Only re-render if data properties or onAction callback change
export const AssetCard = React.memo(AssetCardComponent, (prevProps, nextProps) => {
  // Custom comparison: only re-render if essential data changed
  return (
    prevProps.data.id === nextProps.data.id &&
    prevProps.data.rawBalance === nextProps.data.rawBalance &&
    prevProps.data.apyPercentage === nextProps.data.apyPercentage &&
    prevProps.data.growthPercentage === nextProps.data.growthPercentage &&
    prevProps.data.earnedYield === nextProps.data.earnedYield &&
    prevProps.data.yieldPercentage === nextProps.data.yieldPercentage &&
    prevProps.onAction === nextProps.onAction &&
    prevProps.isDemoMode === nextProps.isDemoMode
  )
})
