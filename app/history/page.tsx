"use client"

import { Suspense, useEffect } from "react"
import { TransactionHistory } from "@/components/transaction-history"
import { PageTitle } from "@/components/page-title"
import { useWalletState } from "@/hooks/use-wallet-state"
import { useAnalytics } from "@/hooks/use-analytics"
import { DashboardLayout } from "@/components/dashboard-layout"
import { LandingPage } from "@/components/landing-page"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"

function HistoryContent() {
  const { capture } = useAnalytics()
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
    capture('page_viewed', { page: 'history' })
  }, [capture])

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
        <TransactionHistory
          publicKey={activeWallet.publicKey}
          limit={50}
          showControls={true}
          title={<PageTitle>History</PageTitle>}
        />
      </div>
    </DashboardLayout>
  )
}

function HistoryLoading() {
  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <Skeleton className="h-6 w-24 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>
      <Card className="py-0">
        <CardContent className="p-0">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="py-3 px-4 border-b border-border/50 last:border-b-0">
              <div className="h-14 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<HistoryLoading />}>
      <HistoryContent />
    </Suspense>
  )
}
