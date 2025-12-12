"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Search, RotateCcw, DollarSign, Flame } from "lucide-react"
import type { Token, Pool, ActionType } from "@/lib/db/types"
import type { ExploreQueryType, TimeRangePreset } from "@/types/explore"

interface ExploreFiltersProps {
  tokens: Token[]
  pools: Pool[]
  onApplyFilters: (filters: FilterState) => void
  isLoading?: boolean
}

export interface FilterState {
  query: ExploreQueryType
  assetAddress?: string
  poolId?: string
  minAmount?: number
  minCount?: number
  inUsd: boolean
  eventTypes: string[]
  timeRange: TimeRangePreset
  orderDir: "asc" | "desc"
  hasBorrows?: boolean
  hasDeposits?: boolean
}

const DEFAULT_FILTERS: FilterState = {
  query: "aggregates",
  inUsd: false,
  eventTypes: ["supply", "supply_collateral"],
  timeRange: "30d",
  orderDir: "desc",
}

const TIME_RANGE_OPTIONS: { value: TimeRangePreset; label: string }[] = [
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
  { value: "1y", label: "1 Year" },
  { value: "all", label: "All Time" },
]

const EVENT_TYPES: { value: string; label: string }[] = [
  { value: "supply", label: "Supply" },
  { value: "supply_collateral", label: "Collateral" },
  { value: "withdraw", label: "Withdraw" },
  { value: "withdraw_collateral", label: "Withdraw Collateral" },
  { value: "borrow", label: "Borrow" },
  { value: "repay", label: "Repay" },
  { value: "claim", label: "Claim" },
  { value: "liquidate", label: "Liquidate" },
  { value: "new_auction", label: "Liquidation Started" },
  { value: "fill_auction", label: "Liquidation Filled" },
]

export function ExploreFilters({
  tokens,
  pools,
  onApplyFilters,
  isLoading,
}: ExploreFiltersProps) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)

  // Apply filters when they change
  useEffect(() => {
    onApplyFilters(filters)
  }, [filters, onApplyFilters])

  const handleReset = () => {
    setFilters(DEFAULT_FILTERS)
  }

  const toggleEventType = (eventType: string) => {
    setFilters((prev) => {
      const newEventTypes = prev.eventTypes.includes(eventType)
        ? prev.eventTypes.filter((t) => t !== eventType)
        : [...prev.eventTypes, eventType]
      return { ...prev, eventTypes: newEventTypes }
    })
  }

  const showAssetFilter = ["deposits", "balance", "top-depositors"].includes(filters.query)
  const showPoolFilter = ["top-depositors"].includes(filters.query)
  const showAmountFilter = ["deposits", "balance"].includes(filters.query)
  const showCountFilter = ["events"].includes(filters.query)
  const showEventTypes = ["events"].includes(filters.query)
  const showPositionFilters = ["balance"].includes(filters.query)

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Filters</CardTitle>
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Query Type Tabs */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Query Type
          </label>
          <Tabs
            value={filters.query}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, query: value as ExploreQueryType }))
            }
          >
            <TabsList className="w-full flex-wrap h-auto gap-1 p-1">
              <TabsTrigger value="aggregates" className="flex-1 min-w-[80px]">
                Overview
              </TabsTrigger>
              <TabsTrigger value="deposits" className="flex-1 min-w-[80px]">
                By Deposits
              </TabsTrigger>
              <TabsTrigger value="balance" className="flex-1 min-w-[80px]">
                By Balance
              </TabsTrigger>
              <TabsTrigger value="events" className="flex-1 min-w-[80px]">
                By Events
              </TabsTrigger>
              <TabsTrigger value="top-depositors" className="flex-1 min-w-[80px]">
                Top Depositors
              </TabsTrigger>
              <TabsTrigger value="pools" className="flex-1 min-w-[80px]">
                Pools
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Time Range */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Time Range
          </label>
          <div className="flex flex-wrap gap-2">
            {TIME_RANGE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                variant={filters.timeRange === option.value ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  setFilters((prev) => ({ ...prev, timeRange: option.value }))
                }
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Token Filter */}
        {showAssetFilter && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Token
            </label>
            <Select
              value={filters.assetAddress || ""}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  assetAddress: value || undefined,
                }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select token..." />
              </SelectTrigger>
              <SelectContent>
                {tokens.map((token) => (
                  <SelectItem key={token.asset_address} value={token.asset_address}>
                    {token.symbol} - {token.name || token.symbol}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Pool Filter */}
        {showPoolFilter && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Pool
            </label>
            <Select
              value={filters.poolId || ""}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  poolId: value || undefined,
                }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select pool..." />
              </SelectTrigger>
              <SelectContent>
                {pools.map((pool) => (
                  <SelectItem key={pool.pool_id} value={pool.pool_id}>
                    {pool.short_name || pool.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Amount Filter */}
        {showAmountFilter && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Minimum Amount
            </label>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Enter amount..."
                value={filters.minAmount || ""}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    minAmount: e.target.value ? parseFloat(e.target.value) : undefined,
                  }))
                }
                className="flex-1"
              />
              <Button
                variant={filters.inUsd ? "default" : "outline"}
                size="icon"
                onClick={() => setFilters((prev) => ({ ...prev, inUsd: !prev.inUsd }))}
                title={filters.inUsd ? "Filtering by USD" : "Filtering by token amount"}
              >
                {filters.inUsd ? (
                  <DollarSign className="h-4 w-4" />
                ) : (
                  <Flame className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {filters.inUsd ? "Filtering by USD value" : "Filtering by token amount"}
            </p>
          </div>
        )}

        {/* Position Filters */}
        {showPositionFilters && (
          <div className="space-y-3">
            <label className="text-sm font-medium text-muted-foreground">
              Position Filters
            </label>
            <div className="space-y-2">
              <div className="flex gap-2">
                <span className="text-sm text-muted-foreground w-20">Deposits:</span>
                <Button
                  variant={filters.hasDeposits === true ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      hasDeposits: prev.hasDeposits === true ? undefined : true,
                    }))
                  }
                >
                  Has Deposits
                </Button>
                <Button
                  variant={filters.hasDeposits === false ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      hasDeposits: prev.hasDeposits === false ? undefined : false,
                    }))
                  }
                >
                  No Deposits
                </Button>
              </div>
              <div className="flex gap-2">
                <span className="text-sm text-muted-foreground w-20">Borrows:</span>
                <Button
                  variant={filters.hasBorrows === true ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      hasBorrows: prev.hasBorrows === true ? undefined : true,
                    }))
                  }
                >
                  Has Borrows
                </Button>
                <Button
                  variant={filters.hasBorrows === false ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      hasBorrows: prev.hasBorrows === false ? undefined : false,
                    }))
                  }
                >
                  No Borrows
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Event Count Filter */}
        {showCountFilter && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Minimum Event Count
            </label>
            <Input
              type="number"
              placeholder="Enter count..."
              value={filters.minCount || ""}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  minCount: e.target.value ? parseInt(e.target.value, 10) : undefined,
                }))
              }
            />
          </div>
        )}

        {/* Event Types */}
        {showEventTypes && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Event Types
            </label>
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPES.map((type) => (
                <Badge
                  key={type.value}
                  variant={filters.eventTypes.includes(type.value) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleEventType(type.value)}
                >
                  {type.label}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Order Direction */}
        {filters.query !== "aggregates" && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Order
            </label>
            <div className="flex gap-2">
              <Button
                variant={filters.orderDir === "desc" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilters((prev) => ({ ...prev, orderDir: "desc" }))}
              >
                Highest First
              </Button>
              <Button
                variant={filters.orderDir === "asc" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilters((prev) => ({ ...prev, orderDir: "asc" }))}
              >
                Lowest First
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
