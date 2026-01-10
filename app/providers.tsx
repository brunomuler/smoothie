"use client"

import * as React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { CurrencyProvider } from "@/contexts/currency-context"
import { DisplayPreferencesProvider } from "@/contexts/display-preferences-context"
import { WalletProvider } from "@/contexts/wallet-context"
import { NavigationWrapper } from "@/components/navigation-wrapper"
import posthog from "posthog-js"

if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    person_profiles: "always",
    capture_pageview: true,
    autocapture: false, // Disable automatic event capture (clicks, inputs, etc.)
    disable_session_recording: true, // Disable session recording and heatmaps
    loaded: (posthog) => {
      if (process.env.NODE_ENV === "development") posthog.debug()
    },
  })
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30 seconds for general data
            refetchOnWindowFocus: false,
            retry: 2,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <NextThemesProvider
        attribute="class"
        defaultTheme="dark"
        forcedTheme="dark"
        disableTransitionOnChange
      >
        <CurrencyProvider>
          <DisplayPreferencesProvider>
            <WalletProvider>
              <React.Suspense fallback={<div className="min-h-screen bg-background" />}>
                <NavigationWrapper>
                  {children}
                </NavigationWrapper>
              </React.Suspense>
            </WalletProvider>
          </DisplayPreferencesProvider>
        </CurrencyProvider>
      </NextThemesProvider>
    </QueryClientProvider>
  )
}
