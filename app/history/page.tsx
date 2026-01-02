"use client"

import { Suspense, useEffect } from "react"
import { TransactionHistory } from "@/components/transaction-history"
import { PageTitle } from "@/components/page-title"
import { useWalletState } from "@/hooks/use-wallet-state"
import { useAnalytics } from "@/hooks/use-analytics"
import { AuthenticatedPage } from "@/components/authenticated-page"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"

function HistoryContent() {
  const { capture } = useAnalytics()
  const { activeWallet } = useWalletState()

  // Track page view
  useEffect(() => {
    capture('page_viewed', { page: 'history' })
  }, [capture])

  return (
    <AuthenticatedPage>
      <div>
        <PageTitle>History</PageTitle>
        <TransactionHistory
          publicKey={activeWallet!.publicKey}
          limit={50}
          showControls={true}
        />
      </div>
    </AuthenticatedPage>
  )
}

function HistoryLoading() {
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
        {/* Page title and controls skeleton */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-24" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </div>

        {/* Transaction list skeleton */}
        <div className="rounded-xl border bg-card">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-4 border-b border-border/50 last:border-b-0">
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

export default function HistoryPage() {
  return (
    <Suspense fallback={<HistoryLoading />}>
      <HistoryContent />
    </Suspense>
  )
}
