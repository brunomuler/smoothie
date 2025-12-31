"use client"

import Link from "next/link"
import { TrendingUp, TrendingDown, ChevronRight } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useRealizedYield } from "@/hooks/use-realized-yield"
import { useCurrencyPreference } from "@/hooks/use-currency-preference"

interface RealizedProfitsLinkProps {
  publicKey: string
  blndPrice?: number
  lpTokenPrice?: number
  sdkPrices?: Record<string, number>
}

export function RealizedProfitsLink({
  publicKey,
  blndPrice = 0,
  lpTokenPrice = 0,
  sdkPrices = {},
}: RealizedProfitsLinkProps) {
  const { format: formatInCurrency } = useCurrencyPreference()

  const { data, isLoading } = useRealizedYield({
    publicKey,
    sdkBlndPrice: blndPrice,
    sdkLpPrice: lpTokenPrice,
    sdkPrices,
    enabled: !!publicKey,
  })

  const formatUsd = (value: number) => {
    if (!Number.isFinite(value)) return formatInCurrency(0)
    return formatInCurrency(value, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  if (isLoading) {
    return (
      <Card className="p-0 gap-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <div className="space-y-1">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
          <Skeleton className="h-4 w-4" />
        </div>
      </Card>
    )
  }

  // Don't show if no data or no activity
  if (!data || (data.totalDepositedUsd === 0 && data.totalWithdrawnUsd === 0)) {
    return null
  }

  const isPositive = data.realizedPnl >= 0

  return (
    <Link href="/performance">
      <Card className="overflow-hidden p-0 gap-0 hover:bg-accent/50 transition-colors cursor-pointer">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            {isPositive ? (
              <TrendingUp className="h-5 w-5 text-green-500" />
            ) : (
              <TrendingDown className="h-5 w-5 text-red-500" />
            )}
            <div>
              <div className="text-base font-semibold">
                <span className={isPositive ? "text-green-500" : "text-red-500"}>
                  {isPositive ? "+" : ""}{formatUsd(data.realizedPnl)}
                </span>
                <span className="text-muted-foreground text-sm font-normal ml-1.5">realized</span>
              </div>
              <div className="text-sm text-muted-foreground">
                {formatUsd(data.totalWithdrawnUsd)} withdrawn of {formatUsd(data.totalDepositedUsd)} deposited
              </div>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </Card>
    </Link>
  )
}
