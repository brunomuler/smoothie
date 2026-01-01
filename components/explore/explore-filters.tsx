"use client"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ApyPeriod, ExploreFilters, SortBy } from "@/types/explore"

interface ExploreFiltersProps {
  filters: ExploreFilters
  onFiltersChange: (filters: ExploreFilters) => void
}

const PERIOD_OPTIONS: { value: ApyPeriod; label: string }[] = [
  { value: "current", label: "Current" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "3mo" },
  { value: "180d", label: "6mo" },
]

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "total", label: "Total" },
  { value: "apy", label: "APY" },
  { value: "blnd", label: "BLND" },
]

export function ExploreFilters({ filters, onFiltersChange }: ExploreFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
      {/* Period Selector */}
      <div className="flex items-center justify-between gap-2 sm:justify-start">
        <span className="text-sm text-muted-foreground shrink-0">Period</span>
        <Tabs
          value={filters.period}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, period: value as ApyPeriod })
          }
        >
          <TabsList className="h-8">
            {PERIOD_OPTIONS.map((option) => (
              <TabsTrigger key={option.value} value={option.value} className="text-xs px-2 sm:text-sm sm:px-3">
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Sort By Selector */}
      <div className="flex items-center justify-between gap-2 sm:justify-start">
        <span className="text-sm text-muted-foreground shrink-0">Sort by</span>
        <Tabs
          value={filters.sortBy}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, sortBy: value as SortBy })
          }
        >
          <TabsList className="h-8">
            {SORT_OPTIONS.map((option) => (
              <TabsTrigger key={option.value} value={option.value} className="text-xs px-2 sm:text-sm sm:px-3">
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
    </div>
  )
}
