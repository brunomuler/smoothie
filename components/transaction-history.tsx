"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import {
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  Flame,
  RefreshCw,
  Loader2,
  Gavel,
  AlertTriangle,
  Filter,
  CalendarIcon,
  Shield,
  Clock,
  XCircle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format } from "date-fns"
import { useInfiniteUserActions } from "@/hooks/use-user-actions"
import type { UserAction, ActionType } from "@/lib/db/types"
import { TokenLogo } from "@/components/token-logo"

// Token logo map - matches the one in use-blend-positions.ts
const ASSET_LOGO_MAP: Record<string, string> = {
  USDC: "/tokens/usdc.png",
  USDT: "/tokens/usdc.png",
  XLM: "/tokens/xlm.png",
  AQUA: "/tokens/aqua.png",
  EURC: "/tokens/eurc.png",
  CETES: "/tokens/cetes.png",
  USDGLO: "/tokens/usdglo.png",
  USTRY: "/tokens/ustry.png",
  BLND: "/tokens/blnd.png",
}

function resolveAssetLogo(symbol: string | undefined): string | null {
  if (!symbol) return null
  const normalized = symbol.toUpperCase()
  return ASSET_LOGO_MAP[normalized] ?? null
}

// All available action types for filtering
const ACTION_TYPE_OPTIONS: { value: ActionType; label: string }[] = [
  { value: "supply", label: "Supply" },
  { value: "supply_collateral", label: "Add Collateral" },
  { value: "withdraw", label: "Withdraw" },
  { value: "withdraw_collateral", label: "Withdraw Collateral" },
  { value: "borrow", label: "Borrow" },
  { value: "repay", label: "Repay" },
  { value: "claim", label: "Claim BLND" },
  { value: "new_auction", label: "Liquidation Started" },
  { value: "fill_auction", label: "Liquidation" },
  { value: "delete_auction", label: "Liquidation Cancelled" },
  // Backstop actions
  { value: "backstop_deposit", label: "Backstop Deposit" },
  { value: "backstop_withdraw", label: "Backstop Withdraw" },
  { value: "backstop_queue_withdrawal", label: "Queue Withdrawal" },
  { value: "backstop_dequeue_withdrawal", label: "Cancel Queue" },
  { value: "backstop_claim", label: "Backstop Claim" },
]

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
    label: "Supplied",
    icon: ArrowDownRight,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
  },
  supply_collateral: {
    label: "Added Collateral",
    icon: ArrowDownRight,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
  },
  withdraw: {
    label: "Withdrew",
    icon: ArrowUpRight,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
  },
  withdraw_collateral: {
    label: "Withdrew Collateral",
    icon: ArrowUpRight,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
  },
  borrow: {
    label: "Borrowed",
    icon: ArrowUpRight,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
  },
  repay: {
    label: "Repaid",
    icon: ArrowDownRight,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
  claim: {
    label: "Claimed BLND",
    icon: Flame,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
  },
  liquidate: {
    label: "Liquidated",
    icon: RefreshCw,
    color: "text-gray-600 dark:text-gray-400",
    bgColor: "bg-gray-100 dark:bg-gray-900/30",
  },
  new_auction: {
    label: "Liquidation Started",
    icon: AlertTriangle,
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
  },
  fill_auction: {
    label: "Liquidation",
    icon: Gavel,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
  },
  delete_auction: {
    label: "Liquidation Cancelled",
    icon: RefreshCw,
    color: "text-gray-600 dark:text-gray-400",
    bgColor: "bg-gray-100 dark:bg-gray-900/30",
  },
  // Backstop actions
  backstop_deposit: {
    label: "Backstop Deposit",
    icon: Shield,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
  },
  backstop_withdraw: {
    label: "Backstop Withdraw",
    icon: Shield,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
  },
  backstop_queue_withdrawal: {
    label: "Queued Withdrawal",
    icon: Clock,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
  },
  backstop_dequeue_withdrawal: {
    label: "Cancelled Queue",
    icon: XCircle,
    color: "text-gray-600 dark:text-gray-400",
    bgColor: "bg-gray-100 dark:bg-gray-900/30",
  },
  backstop_claim: {
    label: "Backstop Claim",
    icon: Flame,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
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

function ActionBadge({ action, currentUserAddress }: { action: UserAction; currentUserAddress?: string }) {
  const config = ACTION_CONFIG[action.action_type] || ACTION_CONFIG.supply
  const Icon = config.icon

  // For fill_auction, show different label based on user's role
  let label = config.label
  if (action.action_type === "fill_auction" && currentUserAddress) {
    const isLiquidator = action.filler_address === currentUserAddress
    label = isLiquidator ? "Filled Liquidation" : "Liquidated"
  }

  return (
    <Badge variant="secondary" className={`${config.bgColor} ${config.color} gap-1`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  )
}

function TransactionRow({ actions, currentUserAddress }: { actions: UserAction[]; currentUserAddress?: string }) {
  const firstAction = actions[0]
  const explorerUrl = `https://stellar.expert/explorer/public/tx/${firstAction.transaction_hash}`

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{firstAction.pool_name || firstAction.pool_short_name || firstAction.pool_id?.slice(0, 8)}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          {actions.map((action) => (
            <ActionBadge key={action.id} action={action} currentUserAddress={currentUserAddress} />
          ))}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          {actions.map((action) => (
            <div key={action.id}>{getAmountDisplay(action, currentUserAddress)}</div>
          ))}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col text-sm">
          <span>{formatDate(firstAction.ledger_closed_at)}</span>
          <span className="text-muted-foreground text-xs">
            {formatTime(firstAction.ledger_closed_at)}
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
          <span className="font-mono text-xs">{firstAction.transaction_hash.slice(0, 8)}...</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      </TableCell>
    </TableRow>
  )
}

function getAmountDisplay(action: UserAction, currentUserAddress?: string): React.ReactNode {
  const isAuctionEvent = action.action_type === "fill_auction" || action.action_type === "new_auction"
  const isBackstopEvent = action.action_type.startsWith("backstop_")
  const isLiquidator = action.filler_address === currentUserAddress

  if (isAuctionEvent && action.lot_amount && action.bid_amount) {
    const lotValue = action.lot_amount / 10000000
    const bidValue = action.bid_amount / 10000000
    const lotSymbol = action.lot_asset_symbol || "LOT"
    const bidSymbol = action.bid_asset_symbol || "BID"

    if (isLiquidator) {
      return (
        <div className="flex flex-col text-xs text-right">
          <span className="text-green-600 dark:text-green-400">+{lotValue.toFixed(2)} {lotSymbol}</span>
          <span className="text-orange-600 dark:text-orange-400">+{bidValue.toFixed(2)} {bidSymbol} debt</span>
        </div>
      )
    } else {
      return (
        <div className="flex flex-col text-xs text-right">
          <span className="text-red-600 dark:text-red-400">-{lotValue.toFixed(2)} {lotSymbol}</span>
          <span className="text-blue-600 dark:text-blue-400">-{bidValue.toFixed(2)} {bidSymbol} debt</span>
        </div>
      )
    }
  } else if (isBackstopEvent && action.lp_tokens !== null) {
    const lpValue = action.lp_tokens / 10000000
    // Format LP amount the same way as tokens (with K/M abbreviations)
    const formattedLp = lpValue >= 1000000
      ? `${(lpValue / 1000000).toFixed(2)}M`
      : lpValue >= 1000
        ? `${(lpValue / 1000).toFixed(2)}K`
        : lpValue.toFixed(2)
    // Positive: deposit, claim, dequeue (cancel queue returns LP to available)
    // Negative: withdraw, queue_withdrawal (LP moving out or being locked)
    const isPositive = action.action_type === "backstop_deposit" ||
                       action.action_type === "backstop_claim" ||
                       action.action_type === "backstop_dequeue_withdrawal"
    const sign = isPositive ? "" : "-"
    const textColor = isPositive ? "text-white" : "text-red-400"
    return (
      <div className={`flex items-center gap-0.5 font-mono text-xs font-medium ${textColor}`}>
        <div
          className="flex items-center justify-center mx-0.5 rounded-full bg-purple-500/20 shrink-0"
          style={{ width: 16, height: 16 }}
        >
          <Shield className="h-3 w-3 text-purple-500" />
        </div>
        <span>{sign}{formattedLp}</span>
        <span>LP</span>
      </div>
    )
  } else {
    const amount = action.action_type === "claim" ? action.claim_amount : action.amount_underlying
    const symbol = action.action_type === "claim" ? "BLND" : action.asset_symbol
    const iconUrl = resolveAssetLogo(symbol ?? undefined)
    // Negative: withdraw, withdraw_collateral, borrow (money going out)
    // Positive: supply, supply_collateral, repay, claim
    const isNegative = action.action_type === "withdraw" ||
                       action.action_type === "withdraw_collateral" ||
                       action.action_type === "borrow"
    const sign = isNegative ? "-" : ""
    const textColor = isNegative ? "text-red-400" : "text-white"
    const isBlnd = symbol === "BLND"
    return (
      <div className={`flex items-center gap-0.5 font-mono text-xs font-medium ${textColor}`}>
        {symbol && (
          isBlnd ? (
            <TokenLogo src={iconUrl} symbol={symbol} size={16} noPadding className="mx-0.5 !bg-zinc-800" />
          ) : (
            <TokenLogo src={iconUrl} symbol={symbol} size={16} noPadding className="mx-0.5" />
          )
        )}
        <span>{sign}{formatAmount(amount, action.asset_decimals || 7)}</span>
        <span>{symbol || ""}</span>
      </div>
    )
  }
}

function MobileTransactionCard({ actions, currentUserAddress }: { actions: UserAction[]; currentUserAddress?: string }) {
  const firstAction = actions[0]
  const explorerUrl = `https://stellar.expert/explorer/public/tx/${firstAction.transaction_hash}`

  return (
    <div className="py-3 space-y-3 border-b last:border-0">
      <div className="flex justify-between items-center">
        <div className="text-sm font-medium">
          {firstAction.pool_name || firstAction.pool_short_name || firstAction.pool_id?.slice(0, 8)}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right text-xs text-muted-foreground">
            {formatDate(firstAction.ledger_closed_at)} {formatTime(firstAction.ledger_closed_at)}
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

      {actions.map((action) => (
        <div key={action.id} className="flex justify-between items-center">
          <ActionBadge action={action} currentUserAddress={currentUserAddress} />
          <div className="text-right">
            {getAmountDisplay(action, currentUserAddress)}
          </div>
        </div>
      ))}
    </div>
  )
}

export function TransactionHistory({
  publicKey,
  assetAddress,
  poolId,
  limit = 50,
  defaultOpen = false,
  hideToggle = false,
}: TransactionHistoryProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen || hideToggle)
  const [selectedActionTypes, setSelectedActionTypes] = useState<ActionType[]>([])
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [endDate, setEndDate] = useState<Date | undefined>(undefined)
  const mobileLoadMoreRef = useRef<HTMLDivElement>(null)
  const desktopLoadMoreRef = useRef<HTMLDivElement>(null)

  // Convert filter values to API parameters
  const actionTypes = selectedActionTypes.length === 0 ? undefined : selectedActionTypes
  const startDateStr = startDate ? format(startDate, "yyyy-MM-dd") : undefined
  const endDateStr = endDate ? format(endDate, "yyyy-MM-dd") : undefined

  const { isLoading, isFetchingNextPage, error, actions, fetchNextPage, hasNextPage } = useInfiniteUserActions({
    publicKey,
    limit,
    assetAddress,
    poolId,
    actionTypes,
    startDate: startDateStr,
    endDate: endDateStr,
    enabled: (hideToggle || isOpen) && !!publicKey,
  })

  // Group actions by transaction_hash to merge related events (e.g., claim + deposit)
  const groupedActions = actions.reduce<{ key: string; actions: UserAction[] }[]>((acc, action) => {
    const lastGroup = acc[acc.length - 1]
    if (lastGroup && lastGroup.key === action.transaction_hash) {
      lastGroup.actions.push(action)
    } else {
      acc.push({ key: action.transaction_hash, actions: [action] })
    }
    return acc
  }, [])

  // Infinite scroll observer
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [target] = entries
      if (target.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage]
  )

  useEffect(() => {
    const observer = new IntersectionObserver(handleObserver, {
      root: null,
      rootMargin: "100px",
      threshold: 0,
    })

    if (mobileLoadMoreRef.current) {
      observer.observe(mobileLoadMoreRef.current)
    }
    if (desktopLoadMoreRef.current) {
      observer.observe(desktopLoadMoreRef.current)
    }

    return () => observer.disconnect()
  }, [handleObserver])

  if (!publicKey) {
    return null
  }

  // Check if any filter is active
  const hasActiveFilters = selectedActionTypes.length > 0 || !!startDate || !!endDate
  const activeFilterCount = [
    selectedActionTypes.length > 0,
    !!startDate,
    !!endDate,
  ].filter(Boolean).length

  const clearFilters = () => {
    setSelectedActionTypes([])
    setStartDate(undefined)
    setEndDate(undefined)
  }

  const toggleActionType = (type: ActionType) => {
    setSelectedActionTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  return (
    <Card className="py-2 gap-0">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3 px-4">
        <CardTitle className="flex items-center gap-2">
          Transaction History
        </CardTitle>
        <div className="flex items-center gap-2">
          {/* Filter Button with Popover */}
          {(hideToggle || isOpen) && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="relative h-8 w-8"
                >
                  <Filter className="h-4 w-4" />
                  {hasActiveFilters && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end" sideOffset={8}>
                <div className="p-3 border-b">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">Filters</h4>
                    {hasActiveFilters && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearFilters}
                        className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Clear all
                      </Button>
                    )}
                  </div>
                </div>

                <div className="p-3 border-b">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-muted-foreground">Event Type</label>
                    {selectedActionTypes.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {selectedActionTypes.length} selected
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {ACTION_TYPE_OPTIONS.map((type) => (
                      <label
                        key={type.value}
                        className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent rounded px-2 py-1.5"
                      >
                        <Checkbox
                          checked={selectedActionTypes.includes(type.value)}
                          onCheckedChange={() => toggleActionType(type.value)}
                        />
                        <span className="truncate">{type.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="p-3">
                  <label className="text-sm text-muted-foreground mb-2 block">Date Range</label>

                  {/* Mobile: Native date inputs */}
                  <div className="grid grid-cols-2 gap-2 md:hidden">
                    <Button
                      variant="outline"
                      className="relative justify-start text-left font-normal h-9 px-3"
                      asChild
                    >
                      <label>
                        <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                        <span className={startDate ? "" : "text-muted-foreground"}>
                          {startDate ? format(startDate, "MMM d") : "From"}
                        </span>
                        <input
                          type="date"
                          value={startDate ? format(startDate, "yyyy-MM-dd") : ""}
                          onChange={(e) => {
                            if (!e.target.value) {
                              setStartDate(undefined)
                              return
                            }
                            const [year, month, day] = e.target.value.split("-").map(Number)
                            setStartDate(new Date(year, month - 1, day))
                          }}
                          max={endDate ? format(endDate, "yyyy-MM-dd") : undefined}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </label>
                    </Button>
                    <Button
                      variant="outline"
                      className="relative justify-start text-left font-normal h-9 px-3"
                      asChild
                    >
                      <label>
                        <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                        <span className={endDate ? "" : "text-muted-foreground"}>
                          {endDate ? format(endDate, "MMM d") : "To"}
                        </span>
                        <input
                          type="date"
                          value={endDate ? format(endDate, "yyyy-MM-dd") : ""}
                          onChange={(e) => {
                            if (!e.target.value) {
                              setEndDate(undefined)
                              return
                            }
                            const [year, month, day] = e.target.value.split("-").map(Number)
                            setEndDate(new Date(year, month - 1, day))
                          }}
                          min={startDate ? format(startDate, "yyyy-MM-dd") : undefined}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </label>
                    </Button>
                  </div>

                  {/* Desktop: Calendar popovers side by side */}
                  <div className="hidden md:flex gap-2">
                    <Popover modal>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="flex-1 justify-start text-left font-normal"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startDate ? format(startDate, "MMM d") : <span className="text-muted-foreground">From</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start" sideOffset={4}>
                        <Calendar
                          mode="single"
                          selected={startDate}
                          onSelect={setStartDate}
                          disabled={(date) => endDate ? date > endDate : false}
                          fixedWeeks
                        />
                      </PopoverContent>
                    </Popover>

                    <Popover modal>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="flex-1 justify-start text-left font-normal"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {endDate ? format(endDate, "MMM d") : <span className="text-muted-foreground">To</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end" sideOffset={4}>
                        <Calendar
                          mode="single"
                          selected={endDate}
                          onSelect={setEndDate}
                          disabled={(date) => startDate ? date < startDate : false}
                          fixedWeeks
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Toggle Button */}
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
        </div>
      </CardHeader>

      {(hideToggle || isOpen) && (
        <CardContent className="px-4 pt-0 pb-3">
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
              <div className="md:hidden">
                <div className="[&>*:last-child]:border-0">
                  {groupedActions.map((group) => (
                    <MobileTransactionCard key={group.key} actions={group.actions} currentUserAddress={publicKey} />
                  ))}
                </div>
                {/* Load more trigger */}
                <div ref={mobileLoadMoreRef} className="h-1" />
                {isFetchingNextPage && (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-hidden">
                <div className="max-h-[500px] overflow-auto">
                  <Table>
                    <TableBody>
                      {groupedActions.map((group) => (
                        <TransactionRow key={group.key} actions={group.actions} currentUserAddress={publicKey} />
                      ))}
                    </TableBody>
                  </Table>
                  {/* Load more trigger */}
                  <div ref={desktopLoadMoreRef} className="h-1" />
                  {isFetchingNextPage && (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  )
}
