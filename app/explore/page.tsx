"use client"

import { useState, Suspense, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PiggyBank, ShieldCheck } from "lucide-react"
import { ExploreFilters } from "@/components/explore/explore-filters"
import { TopTokensChart } from "@/components/explore/top-tokens-chart"
import { BackstopChart } from "@/components/explore/backstop-chart"
import { SupplyResults } from "@/components/explore/supply-results"
import { BackstopResults } from "@/components/explore/backstop-results"
import { useExplore } from "@/hooks/use-explore"
import { DashboardLayout } from "@/components/dashboard-layout"
import { LandingPage } from "@/components/landing-page"
import { useWalletState } from "@/hooks/use-wallet-state"
import { useAnalytics } from "@/hooks/use-analytics"
import { Skeleton } from "@/components/ui/skeleton"
import type { ExploreFilters as ExploreFiltersType } from "@/types/explore"
import { PageTitle } from "@/components/page-title"

function ExploreContent() {
  const { capture } = useAnalytics()
  const [activeTab, setActiveTab] = useState<"supply" | "backstops">("supply")
  const [filters, setFilters] = useState<ExploreFiltersType>({
    period: "current",
    tokenFilter: "all",
    sortBy: "total",
  })

  const { isLoading, supplyItems, backstopItems } = useExplore(filters)
  const {
    wallets,
    activeWallet,
    handleSelectWallet,
    handleConnectWallet,
    handleDisconnect,
    isHydrated,
  } = useWalletState()

  // Track page view
  useEffect(() => {
    capture('page_viewed', { page: 'explore' })
  }, [capture])

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as "supply" | "backstops")
    capture('tab_changed', { tab, page: 'explore' })
  }

  // Show landing page for non-logged-in users
  if (!activeWallet) {
    return (
      <LandingPage
        wallets={wallets}
        activeWallet={activeWallet}
        onSelectWallet={handleSelectWallet}
        onConnectWallet={handleConnectWallet}
        onDisconnect={handleDisconnect}
        isHydrated={isHydrated}
      />
    )
  }

  return (
    <DashboardLayout
      wallets={wallets}
      activeWallet={activeWallet}
      onSelectWallet={handleSelectWallet}
      onConnectWallet={handleConnectWallet}
      onDisconnect={handleDisconnect}
      isHydrated={isHydrated}
    >
      <div>
        <PageTitle>Explore</PageTitle>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="grid w-full grid-cols-2 h-10 sm:h-11 mb-6 bg-transparent border border-gray-500/20 rounded-lg">
            <TabsTrigger value="supply" className="gap-1.5 text-xs sm:text-sm">
              <PiggyBank className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Supply
            </TabsTrigger>
            <TabsTrigger value="backstops" className="gap-1.5 text-xs sm:text-sm">
              <ShieldCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Backstops
            </TabsTrigger>
          </TabsList>

          <TabsContent value="supply" className="space-y-6">
            <ExploreFilters filters={filters} onFiltersChange={setFilters} />
            <TopTokensChart items={supplyItems} isLoading={isLoading} sortBy={filters.sortBy} />
            <SupplyResults items={supplyItems} isLoading={isLoading} sortBy={filters.sortBy} />
          </TabsContent>

          <TabsContent value="backstops" className="space-y-6">
            <ExploreFilters filters={filters} onFiltersChange={setFilters} />
            <BackstopChart items={backstopItems} isLoading={isLoading} />
            <BackstopResults items={backstopItems} isLoading={isLoading} sortBy={filters.sortBy} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  )
}

function ExploreLoading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header skeleton */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between px-4">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-9 w-32 rounded-full" />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Page title skeleton */}
        <Skeleton className="h-8 w-24" />

        {/* Tabs skeleton */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-lg border">
          <Skeleton className="h-10 rounded-md" />
          <Skeleton className="h-10 rounded-md" />
        </div>

        {/* Filters skeleton */}
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>

        {/* Chart skeleton */}
        <div className="rounded-xl border bg-card p-6">
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>

        {/* Results list skeleton */}
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <Skeleton className="h-5 w-20 ml-auto" />
                  <Skeleton className="h-3 w-16 ml-auto" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<ExploreLoading />}>
      <ExploreContent />
    </Suspense>
  )
}
