"use client"

import { Suspense, useEffect } from "react"
import { CurrencySelector } from "@/components/currency-selector"
import { Switch } from "@/components/ui/switch"
import { useCurrencyPreference } from "@/hooks/use-currency-preference"
import { useDisplayPreferences } from "@/contexts/display-preferences-context"
import { useAnalytics } from "@/hooks/use-analytics"
import { DashboardLayout } from "@/components/dashboard-layout"
import { LandingPage } from "@/components/landing-page"
import { useWalletState } from "@/hooks/use-wallet-state"
import { Skeleton } from "@/components/ui/skeleton"
import { PageTitle } from "@/components/page-title"

function SettingsContent() {
  const { capture } = useAnalytics()
  const { currency, setCurrency } = useCurrencyPreference()
  const { preferences, setShowPriceChanges, setUseHistoricalBlndPrices } = useDisplayPreferences()
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
    capture('page_viewed', { page: 'settings' })
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
        <PageTitle>Settings</PageTitle>

        <div className="space-y-4">
          {/* Currency Section */}
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-medium">Display Currency</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose your preferred currency for displaying values
                </p>
              </div>
              <CurrencySelector value={currency} onChange={setCurrency} />
            </div>
          </div>

          {/* Price Changes Toggle */}
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-medium">Include price changes in earnings</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When enabled, earnings include asset price changes. When disabled, only protocol yield at current price is shown.
                </p>
              </div>
              <Switch
                checked={preferences.showPriceChanges}
                onCheckedChange={setShowPriceChanges}
              />
            </div>
          </div>

          {/* BLND Historical Prices Toggle */}
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-medium">Use historical BLND prices</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When enabled, claimed BLND is valued at the price when claimed. When disabled, all BLND uses current price.
                </p>
              </div>
              <Switch
                checked={preferences.useHistoricalBlndPrices}
                onCheckedChange={setUseHistoricalBlndPrices}
              />
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

function SettingsLoading() {
  return (
    <div className="px-4 py-4 space-y-4">
      <div>
        <Skeleton className="h-6 w-24 mb-2" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <SettingsContent />
    </Suspense>
  )
}
