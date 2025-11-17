"use client"

import * as React from "react"
import Image from "next/image"
import { TrendingUp, Activity, MoreVertical, ArrowDownToLine, ArrowUpFromLine, Eye, Trash2 } from "lucide-react"
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

interface AssetCardProps {
  data: AssetCardData
  onAction?: (action: AssetAction, assetId: string) => void
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

const AssetCardComponent = ({ data, onAction }: AssetCardProps) => {
  const handleAction = React.useCallback((action: AssetAction) => {
    onAction?.(action, data.id)
  }, [onAction, data.id])

  const initialBalance = Number.isFinite(data.rawBalance) ? Math.max(data.rawBalance, 0) : 0
  const apyDecimal = Number.isFinite(data.apyPercentage)
    ? Math.max(data.apyPercentage, 0) / 100
    : 0

  const { displayBalance } = useLiveBalance(initialBalance, apyDecimal, null, 0)

  const balanceFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 7,
    maximumFractionDigits: 7,
  })

  const yieldFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "always",
  })

  const formattedLiveBalance = balanceFormatter.format(displayBalance)

  // Use actual earned yield from balance history if available
  const hasActualYield = data.earnedYield !== undefined && data.earnedYield > 0
  const yieldToShow: number = hasActualYield ? (data.earnedYield ?? 0) : 0

  const formattedYield = yieldFormatter.format(yieldToShow)
  const hasSignificantYield = Math.abs(yieldToShow) >= 0.01

  // Calculate percentage increase: (yield / initial balance) * 100
  const initialBalanceValue = Number.isFinite(data.rawBalance) ? Math.max(data.rawBalance, 0) : 0
  const yieldPercentage = initialBalanceValue > 0 ? (yieldToShow / initialBalanceValue) * 100 : 0
  const formattedYieldPercentage = yieldPercentage !== 0 ? ` (${yieldPercentage >= 0 ? '+' : ''}${yieldPercentage.toFixed(2)}%)` : ''

  return (
    <Card className="@container/asset-card">
      <CardContent className="flex items-center gap-4">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
          <Image
            src={data.logoUrl}
            alt={`${data.assetName} logo`}
            fill
            className="object-cover"
          />
        </div>

        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <h3 className="text-base font-semibold truncate">{data.protocolName}</h3>
            <span className="text-sm text-muted-foreground shrink-0">{data.assetName}</span>
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
                      {formatPercentage(data.apyPercentage)}% APY
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Annual Percentage Yield</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {hasNonZeroPercentage(data.growthPercentage) && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge variant="secondary" className="text-xs">
                        <Activity className="mr-1 h-3 w-3" />
                        {formatSignedPercentage(data.growthPercentage)}% BLND APY
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
    prevProps.onAction === nextProps.onAction
  )
})
