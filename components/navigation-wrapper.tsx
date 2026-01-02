"use client"

import { Suspense } from "react"
import { usePathname } from "next/navigation"
import { Sidebar, BottomNav } from "@/components/navigation"
import { useWalletState } from "@/hooks/use-wallet-state"

interface NavigationWrapperProps {
  children: React.ReactNode
}

export function NavigationWrapper({ children }: NavigationWrapperProps) {
  const pathname = usePathname()
  const { activeWallet, isHydrated } = useWalletState()

  // Pages that don't need navigation (privacy, terms, etc.)
  const noNavigationPages = ["/privacy", "/terms"]
  const isNoNavPage = noNavigationPages.some(page => pathname.startsWith(page))

  // Don't show navigation if on a no-nav page OR if user is not signed in (after hydration)
  // We must wait for hydration to avoid flash of no-navigation on page load
  if (isNoNavPage || (isHydrated && !activeWallet)) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <Suspense fallback={null}>
        <Sidebar />
      </Suspense>

      {/* Main content area */}
      <div className="md:pl-56 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav />
    </div>
  )
}
