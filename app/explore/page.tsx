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
            <BackstopChart items={backstopItems} isLoading={isLoading} />
            <BackstopResults items={backstopItems} isLoading={isLoading} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  )
}

function ExploreLoading() {
  return (
    <div className="px-4 py-4 space-y-4">
      <div>
        <Skeleton className="h-6 w-24 mb-2" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-10 w-48" />
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
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
