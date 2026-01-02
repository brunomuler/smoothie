"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import {
  Loader2,
  Download,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { format } from "date-fns"
import { useQuery } from "@tanstack/react-query"
import { useInfiniteUserActions } from "@/hooks/use-user-actions"
import type { ActionType } from "@/lib/db/types"
import { useCurrencyPreference } from "@/hooks/use-currency-preference"
import { useTokensOnly } from "@/hooks/use-metadata"
import type { HistoricalPricesResponse } from "@/app/api/historical-prices/route"
import type { TransactionHistoryProps, GroupedAction } from "./types"
import { LP_TOKEN_ADDRESS } from "./constants"
import { TransactionRow, MobileTransactionCard } from "./transaction-row"
import { Filters } from "./filters"

interface TransactionHistoryFullProps extends TransactionHistoryProps {
  showControls?: boolean
  title?: React.ReactNode
}

export function TransactionHistory({
  publicKey,
  assetAddress,
  poolId,
  limit = 50,
  hideToggle = false,
  showControls = true,
  title,
}: TransactionHistoryFullProps) {
  const [selectedActionTypes, setSelectedActionTypes] = useState<ActionType[]>([])
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [endDate, setEndDate] = useState<Date | undefined>(undefined)
  const [isExporting, setIsExporting] = useState(false)
  const mobileLoadMoreRef = useRef<HTMLDivElement>(null)
  const desktopLoadMoreRef = useRef<HTMLDivElement>(null)

  // Currency preference and token metadata for currency conversion
  const { currency, format: formatCurrency } = useCurrencyPreference()
  const { tokens } = useTokensOnly()

  // Build tokens map for pegged currency lookup and find BLND token address
  const tokensMap = new Map<string, { pegged_currency: string | null }>()
  let blndTokenAddress: string | undefined
  tokens.forEach((t) => {
    tokensMap.set(t.asset_address, { pegged_currency: t.pegged_currency })
    if (t.symbol === 'BLND') {
      blndTokenAddress = t.asset_address
    }
  })

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
    enabled: !!publicKey,
  })

  // Group actions by transaction_hash to merge related events (e.g., claim + deposit)
  const groupedActions = actions.reduce<GroupedAction[]>((acc, action) => {
    const lastGroup = acc[acc.length - 1]
    if (lastGroup && lastGroup.key === action.transaction_hash) {
      lastGroup.actions.push(action)
    } else {
      acc.push({ key: action.transaction_hash, actions: [action] })
    }
    return acc
  }, [])

  // Extract unique token addresses and dates from actions for historical price fetch
  const priceQueryParams = useMemo(() => {
    const tokenSet = new Set<string>()
    const dateSet = new Set<string>()

    actions.forEach((action) => {
      // Skip auction events (complex multi-token buy/sell)
      if (action.action_type === "fill_auction" || action.action_type === "new_auction") {
        return
      }

      const date = action.ledger_closed_at.split('T')[0]
      const isBackstopEvent = action.action_type.startsWith("backstop_")
      const isClaimEvent = action.action_type === "claim"

      if (isBackstopEvent) {
        // For backstop events, use the LP token address (BLND-USDC Comet LP)
        tokenSet.add(LP_TOKEN_ADDRESS)
        dateSet.add(date)
      } else if (isClaimEvent) {
        // For BLND claims, use the BLND token address
        if (blndTokenAddress) {
          tokenSet.add(blndTokenAddress)
          dateSet.add(date)
        }
      } else if (action.asset_address) {
        // Regular supply/withdraw/borrow events
        // Skip if token is pegged to user's currency
        const token = tokensMap.get(action.asset_address)
        if (token?.pegged_currency?.toUpperCase() !== currency.toUpperCase()) {
          tokenSet.add(action.asset_address)
          dateSet.add(date)
        }
      }
    })

    return {
      tokens: Array.from(tokenSet),
      dates: Array.from(dateSet),
    }
  }, [actions, tokensMap, currency, blndTokenAddress])

  // Fetch historical prices for visible actions
  const { data: historicalPricesData } = useQuery({
    queryKey: ['historical-prices', priceQueryParams.tokens.join(','), priceQueryParams.dates.join(',')],
    queryFn: async () => {
      if (priceQueryParams.tokens.length === 0 || priceQueryParams.dates.length === 0) {
        return { prices: {} } as HistoricalPricesResponse
      }

      const params = new URLSearchParams({
        tokens: priceQueryParams.tokens.join(','),
        dates: priceQueryParams.dates.join(','),
      })

      const response = await fetch(`/api/historical-prices?${params}`)
      if (!response.ok) {
        throw new Error('Failed to fetch historical prices')
      }
      return response.json() as Promise<HistoricalPricesResponse>
    },
    enabled: priceQueryParams.tokens.length > 0 && priceQueryParams.dates.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

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

  const handleExport = async () => {
    if (isExporting || !publicKey) return

    setIsExporting(true)
    try {
      const params = new URLSearchParams({ user: publicKey })
      if (startDateStr) params.set('startDate', startDateStr)
      if (endDateStr) params.set('endDate', endDateStr)
      if (actionTypes?.length) params.set('actionTypes', actionTypes.join(','))
      if (poolId) params.set('pool', poolId)
      if (assetAddress) params.set('asset', assetAddress)

      const response = await fetch(`/api/export/transactions?${params.toString()}`)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Export failed')
      }

      // Get filename from Content-Disposition header or generate one
      const contentDisposition = response.headers.get('Content-Disposition')
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/)
      const filename = filenameMatch?.[1] || `transactions_${publicKey.slice(0, 8)}.csv`

      // Download the file
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Export failed:', error)
    } finally {
      setIsExporting(false)
    }
  }

  if (!publicKey) {
    return null
  }

  if (error) {
    return (
      <div className="text-sm text-destructive py-8 text-center">
        Error loading transactions: {error.message}
      </div>
    )
  }

  if (isLoading) {
    return (
      <>
        {(showControls || title) && (
          <div className={`flex items-center mb-4 ${title ? 'justify-between' : 'justify-end'}`}>
            {title}
            {showControls && (
              <div className="flex items-center gap-2 ml-auto md:ml-0">
                <Button variant="outline" size="icon" className="h-8 w-8" disabled>
                  <Download className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" disabled>
                  <span className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
        <Card className="py-0">
          <CardContent className="p-0">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="py-3 px-4 border-b border-border/50 last:border-b-0">
                <div className="h-14 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </CardContent>
        </Card>
      </>
    )
  }

  if (actions.length === 0) {
    return (
      <>
        {(showControls || title) && (
          <div className={`flex items-center mb-4 ${title ? 'justify-between' : 'justify-end'}`}>
            {title}
            {showControls && (
              <div className="flex items-center gap-2 ml-auto md:ml-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled>
                      <Download className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-black text-white border-black" arrowClassName="bg-black fill-black">
                    Download CSV
                  </TooltipContent>
                </Tooltip>
                <Filters
                  selectedActionTypes={selectedActionTypes}
                  onToggleActionType={toggleActionType}
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                  onClear={clearFilters}
                />
              </div>
            )}
          </div>
        )}
        <p className="text-sm text-muted-foreground text-center py-12">
          No transactions found
        </p>
      </>
    )
  }

  return (
    <>
      {/* Controls - outside the card */}
      {(showControls || title) && (
        <div className={`flex items-center mb-4 ${title ? 'justify-between' : 'justify-end'}`}>
          {title}
          {showControls && (
            <div className="flex items-center gap-2 ml-auto md:ml-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleExport}
                    disabled={isExporting || actions.length === 0}
                  >
                    {isExporting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-black text-white border-black" arrowClassName="bg-black fill-black">
                  Download CSV
                </TooltipContent>
              </Tooltip>
              <Filters
                selectedActionTypes={selectedActionTypes}
                onToggleActionType={toggleActionType}
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
                onClear={clearFilters}
              />
            </div>
          )}
        </div>
      )}

      {/* Transaction list - clean card */}
      <Card className="py-0">
        <CardContent className="p-0">
          {/* Mobile Card View */}
          <div className="md:hidden">
            {groupedActions.map((group) => (
              <MobileTransactionCard
                key={group.key}
                actions={group.actions}
                currentUserAddress={publicKey}
                historicalPrices={historicalPricesData?.prices}
                currency={currency}
                formatCurrency={formatCurrency}
                tokensMap={tokensMap}
                blndTokenAddress={blndTokenAddress}
              />
            ))}
            {/* Load more trigger */}
            <div ref={mobileLoadMoreRef} className="h-1" />
            {isFetchingNextPage && (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block">
            <Table>
              <TableBody>
                {groupedActions.map((group) => (
                  <TransactionRow
                    key={group.key}
                    actions={group.actions}
                    currentUserAddress={publicKey}
                    historicalPrices={historicalPricesData?.prices}
                    currency={currency}
                    formatCurrency={formatCurrency}
                    tokensMap={tokensMap}
                    blndTokenAddress={blndTokenAddress}
                  />
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
        </CardContent>
      </Card>
    </>
  )
}
