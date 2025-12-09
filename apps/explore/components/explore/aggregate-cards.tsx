"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ArrowDownRight,
  ArrowUpRight,
  TrendingUp,
  Users,
  Activity,
} from "lucide-react"
import type { AggregateMetrics } from "@/types/explore"

interface AggregateCardsProps {
  aggregates?: AggregateMetrics
  isLoading?: boolean
}

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`
  }
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(2)}K`
  }
  return `$${value.toFixed(2)}`
}

function formatNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`
  }
  return value.toLocaleString()
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  isLoading,
}: {
  title: string
  value: string
  subtitle?: string
  icon: typeof ArrowDownRight
  trend?: "positive" | "negative" | "neutral"
  isLoading?: boolean
}) {
  const trendColors = {
    positive: "text-green-600 dark:text-green-400",
    negative: "text-red-600 dark:text-red-400",
    neutral: "text-muted-foreground",
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
        ) : (
          <>
            <div className={`text-2xl font-bold ${trend ? trendColors[trend] : ""}`}>
              {value}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function AggregateCards({ aggregates, isLoading }: AggregateCardsProps) {
  const netFlowTrend = aggregates
    ? aggregates.netFlowUsd > 0
      ? "positive"
      : aggregates.netFlowUsd < 0
      ? "negative"
      : "neutral"
    : "neutral"

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total Deposits"
        value={formatCurrency(aggregates?.totalDepositsUsd || 0)}
        subtitle={`${formatNumber(aggregates?.totalDeposits || 0)} tokens`}
        icon={ArrowDownRight}
        trend="positive"
        isLoading={isLoading}
      />
      <StatCard
        title="Total Withdrawals"
        value={formatCurrency(aggregates?.totalWithdrawalsUsd || 0)}
        subtitle={`${formatNumber(aggregates?.totalWithdrawals || 0)} tokens`}
        icon={ArrowUpRight}
        trend="negative"
        isLoading={isLoading}
      />
      <StatCard
        title="Net Flow"
        value={formatCurrency(aggregates?.netFlowUsd || 0)}
        subtitle={`${formatNumber(aggregates?.netFlow || 0)} tokens`}
        icon={TrendingUp}
        trend={netFlowTrend}
        isLoading={isLoading}
      />
      <StatCard
        title="Active Accounts"
        value={formatNumber(aggregates?.activeAccounts || 0)}
        subtitle={`${formatNumber(aggregates?.totalEvents || 0)} events`}
        icon={Users}
        isLoading={isLoading}
      />
    </div>
  )
}
