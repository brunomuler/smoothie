"use client"

import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"
import { CurrencySelector } from "@/components/currency-selector"
import { Switch } from "@/components/ui/switch"
import { useCurrencyPreference } from "@/hooks/use-currency-preference"
import { useDisplayPreferences } from "@/contexts/display-preferences-context"

export default function SettingsPage() {
  const router = useRouter()
  const { currency, setCurrency } = useCurrencyPreference()
  const { preferences, setShowPriceChanges, setUseHistoricalBlndPrices } = useDisplayPreferences()

  return (
    <div className="min-h-screen bg-background">
      {/* Header with back button */}
      <header className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="container max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
      </header>

      {/* Content */}
      <main className="container max-w-4xl mx-auto px-4 py-6">
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
      </main>
    </div>
  )
}
