"use client"

import { useState } from "react"
import {
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  Gift,
  RefreshCw,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useUserActions } from "@/hooks/use-user-actions"
import type { UserAction, ActionType } from "@/lib/db/types"

interface TransactionHistoryProps {
  publicKey: string
  assetAddress?: string
  poolId?: string
  limit?: number
  defaultOpen?: boolean
  hideToggle?: boolean
}

// Action type display configuration
const ACTION_CONFIG: Record<
  ActionType,
  {
    label: string
    icon: typeof ArrowUpRight
    color: string
    bgColor: string
  }
> = {
  supply: {
    label: "Supply",
    icon: ArrowDownRight,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
  },
  supply_collateral: {
    label: "Collateral",
    icon: ArrowDownRight,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
  },
  withdraw: {
    label: "Withdraw",
    icon: ArrowUpRight,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
  },
  withdraw_collateral: {
    label: "Withdraw",
    icon: ArrowUpRight,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
  },
  borrow: {
    label: "Borrow",
    icon: ArrowUpRight,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
  },
  repay: {
    label: "Repay",
    icon: ArrowDownRight,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
  claim: {
    label: "Claim",
    icon: Gift,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
  },
  liquidate: {
    label: "Liquidate",
    icon: RefreshCw,
    color: "text-gray-600 dark:text-gray-400",
    bgColor: "bg-gray-100 dark:bg-gray-900/30",
  },
}

function formatAmount(amount: number | null, decimals: number = 7): string {
  if (amount === null) return "-"
  const value = amount / Math.pow(10, decimals)
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}K`
  }
  return value.toFixed(2)
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function ActionBadge({ action }: { action: UserAction }) {
  const config = ACTION_CONFIG[action.action_type] || ACTION_CONFIG.supply
  const Icon = config.icon

  return (
    <Badge variant="secondary" className={`${config.bgColor} ${config.color} gap-1`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  )
}

function TransactionRow({ action }: { action: UserAction }) {
  const config = ACTION_CONFIG[action.action_type] || ACTION_CONFIG.supply
  const explorerUrl = `https://stellar.expert/explorer/public/tx/${action.transaction_hash}`

  // For claims, use claim_amount; otherwise use amount_underlying
  const amount =
    action.action_type === "claim" ? action.claim_amount : action.amount_underlying
  const symbol = action.action_type === "claim" ? "BLND" : action.asset_symbol

  return (
    <TableRow>
      <TableCell>
        <ActionBadge action={action} />
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{action.pool_short_name || action.pool_id?.slice(0, 8)}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className={`font-mono font-medium ${config.color}`}>
          {formatAmount(amount, action.asset_decimals || 7)} {symbol || ""}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col text-sm">
          <span>{formatDate(action.ledger_closed_at)}</span>
          <span className="text-muted-foreground text-xs">
            {formatTime(action.ledger_closed_at)}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="font-mono text-xs">{action.transaction_hash.slice(0, 8)}...</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      </TableCell>
    </TableRow>
  )
}

function MobileTransactionCard({ action }: { action: UserAction }) {
  const config = ACTION_CONFIG[action.action_type] || ACTION_CONFIG.supply
  const explorerUrl = `https://stellar.expert/explorer/public/tx/${action.transaction_hash}`

  const amount =
    action.action_type === "claim" ? action.claim_amount : action.amount_underlying
  const symbol = action.action_type === "claim" ? "BLND" : action.asset_symbol

  return (
    <div className="py-4 space-y-2 border-b last:border-b-0">
      <div className="flex justify-between items-start">
        <ActionBadge action={action} />
        <div className="flex items-center gap-2">
          <div className="text-right text-xs text-muted-foreground">
            {formatDate(action.ledger_closed_at)} {formatTime(action.ledger_closed_at)}
          </div>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <div className="font-medium">
          {action.pool_short_name || action.pool_id?.slice(0, 8)}
        </div>
        <div className="text-right">
          <div className={`font-mono font-medium ${config.color}`}>
            {formatAmount(amount, action.asset_decimals || 7)} {symbol || ""}
          </div>
        </div>
      </div>
    </div>
  )
}

export function TransactionHistory({
  publicKey,
  assetAddress,
  poolId,
  limit = 20,
  defaultOpen = false,
  hideToggle = false,
}: TransactionHistoryProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen || hideToggle)

  const { isLoading, error, actions } = useUserActions({
    publicKey,
    limit,
    assetAddress,
    poolId,
    enabled: (hideToggle || isOpen) && !!publicKey,
  })

  if (!publicKey) {
    return null
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="flex items-center gap-2">
          Transaction History
        </CardTitle>
        {!hideToggle && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1"
          >
            {isOpen ? (
              <>
                <ChevronUp className="h-4 w-4" />
                Hide
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                Show
              </>
            )}
          </Button>
        )}
      </CardHeader>

      {(hideToggle || isOpen) && (
        <CardContent>
          {error && (
            <div className="text-sm text-destructive mb-4">
              Error loading transactions: {error.message}
            </div>
          )}

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="h-16 rounded-lg bg-muted animate-pulse"
                />
              ))}
            </div>
          ) : actions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No transactions found
            </p>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-3 max-h-[500px] overflow-y-auto">
                {actions.map((action) => (
                  <MobileTransactionCard key={action.id} action={action} />
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block relative w-full overflow-auto">
                <div className="max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="w-[120px]">Action</TableHead>
                        <TableHead className="w-[100px]">Pool</TableHead>
                        <TableHead className="w-[150px]">Amount</TableHead>
                        <TableHead className="w-[120px]">Date</TableHead>
                        <TableHead className="w-[150px]">Transaction</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {actions.map((action) => (
                        <TransactionRow key={action.id} action={action} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  )
}
