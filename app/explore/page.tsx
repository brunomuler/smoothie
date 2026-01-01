"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ExploreFilters } from "@/components/explore/explore-filters"
import { TopTokensChart } from "@/components/explore/top-tokens-chart"
import { SupplyResults } from "@/components/explore/supply-results"
import { BackstopResults } from "@/components/explore/backstop-results"
import { useExplore } from "@/hooks/use-explore"
import type { ExploreFilters as ExploreFiltersType } from "@/types/explore"

export default function ExplorePage() {
  const [activeTab, setActiveTab] = useState<"supply" | "backstops">("supply")
  const [filters, setFilters] = useState<ExploreFiltersType>({
    period: "current",
    tokenFilter: "all",
    sortBy: "total",
  })

  const { isLoading, supplyItems, backstopItems } = useExplore(filters)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" className="shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold">Explore</h1>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container max-w-4xl mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "supply" | "backstops")}>
          <TabsList className="mb-6">
            <TabsTrigger value="supply">Supply</TabsTrigger>
            <TabsTrigger value="backstops">Backstops</TabsTrigger>
          </TabsList>

          <TabsContent value="supply" className="space-y-6">
            <ExploreFilters filters={filters} onFiltersChange={setFilters} />
            <TopTokensChart items={supplyItems} isLoading={isLoading} sortBy={filters.sortBy} />
            <SupplyResults items={supplyItems} isLoading={isLoading} sortBy={filters.sortBy} />
          </TabsContent>

          <TabsContent value="backstops">
            <BackstopResults items={backstopItems} isLoading={isLoading} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
