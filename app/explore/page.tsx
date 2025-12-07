"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { DollarSign, Coins, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useMetadata } from "@/hooks/use-metadata"
import { useExplore } from "@/hooks/use-explore"
import { ExploreFilters, FilterState } from "@/components/explore/explore-filters"
import { ExploreResults } from "@/components/explore/explore-results"
import { AggregateCards } from "@/components/explore/aggregate-cards"
import type { ExploreQueryType, TimeRangePreset } from "@/types/explore"

export default function ExplorePage() {
  const { tokens, pools, isLoading: isMetadataLoading } = useMetadata()
  const [showUsdPrimary, setShowUsdPrimary] = useState(false)
  const [offset, setOffset] = useState(0)
  const limit = 50

  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    query: "aggregates",
    inUsd: false,
    eventTypes: ["supply", "supply_collateral"],
    timeRange: "30d",
    orderDir: "desc",
  })

  // Fetch explore data
  const { data, isLoading, isFetching, error } = useExplore({
    query: filters.query,
    assetAddress: filters.assetAddress,
    poolId: filters.poolId,
    minAmount: filters.minAmount,
    minCount: filters.minCount,
    inUsd: filters.inUsd,
    eventTypes: filters.eventTypes,
    timeRange: filters.timeRange,
    orderDir: filters.orderDir,
    limit,
    offset,
    enabled: true,
  })

  const handleFiltersChange = useCallback((newFilters: FilterState) => {
    setFilters(newFilters)
    setOffset(0) // Reset pagination when filters change
  }, [])

  const handlePageChange = useCallback((newOffset: number) => {
    setOffset(newOffset)
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Explore</h1>
              <p className="text-muted-foreground mt-1">
                Analyze aggregate data and find accounts by deposits, balances, and activity
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowUsdPrimary(!showUsdPrimary)}
            className="flex items-center gap-2"
          >
            {showUsdPrimary ? (
              <>
                <DollarSign className="h-4 w-4" />
                USD Primary
              </>
            ) : (
              <>
                <Coins className="h-4 w-4" />
                Token Primary
              </>
            )}
          </Button>
        </div>

        {/* Aggregate Cards */}
        <div className="mb-8">
          <AggregateCards
            aggregates={data?.aggregates}
            isLoading={isLoading || isFetching}
          />
        </div>

        {/* Main Content */}
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          {/* Filters Sidebar */}
          <div className="lg:sticky lg:top-4 lg:self-start">
            <ExploreFilters
              tokens={tokens}
              pools={pools}
              onApplyFilters={handleFiltersChange}
              isLoading={isMetadataLoading}
            />
          </div>

          {/* Results */}
          <div>
            {error && (
              <div className="mb-4 p-4 rounded-lg bg-destructive/10 text-destructive">
                Error loading data: {error.message}
              </div>
            )}
            <ExploreResults
              data={data}
              isLoading={isLoading || isFetching}
              showUsdPrimary={showUsdPrimary}
              onPageChange={handlePageChange}
              limit={limit}
              offset={offset}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
