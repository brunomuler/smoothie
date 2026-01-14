"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { WalletSelector } from "@/components/wallet-selector"
import { PullToRefresh } from "@/components/pull-to-refresh"
import { Footer } from "@/components/footer"
import { useWalletState } from "@/hooks/use-wallet-state"
import { navItems } from "@/components/navigation/nav-config"

interface DashboardLayoutProps {
  onRefresh?: () => Promise<void>
  error?: Error | null
  children: React.ReactNode
}

export function DashboardLayout({
  onRefresh,
  error,
  children,
}: DashboardLayoutProps) {
  const pathname = usePathname()
  const {
    wallets,
    activeWallet,
    handleSelectWallet,
    handleConnectWallet,
    handleDisconnect,
    isHydrated,
  } = useWalletState()

  // Get page title for non-home pages
  const isHomePage = pathname === "/"
  const isSettingsPage = pathname === "/settings" || pathname.startsWith("/settings/")
  const showFooter = isHomePage || isSettingsPage
  const currentNavItem = navItems.find(
    (item) => item.href !== "/" && pathname.startsWith(item.href)
  )
  const pageTitle = currentNavItem?.title

  const walletSelectorElement = (
    <WalletSelector
      wallets={wallets}
      activeWallet={activeWallet}
      onSelectWallet={handleSelectWallet}
      onConnectWallet={handleConnectWallet}
      onDisconnect={handleDisconnect}
      isHydrated={isHydrated}
    />
  )

  const pageContent = (
    <div className="space-y-6">
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
          <p className="text-destructive text-sm">
            Error loading positions: {error instanceof Error ? error.message : "Unknown error"}
          </p>
        </div>
      )}

      {!error && children}
    </div>
  )

  return (
    <div className="min-h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom))] md:min-h-dvh flex flex-col">
      {/* Fixed header - Mobile */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-[60] bg-background shadow-[0_4px_6px_0px_oklch(0.145_0_0),0_8px_20px_-2px_oklch(0.145_0_0)] dark:shadow-[0_4px_6px_0px_oklch(0.145_0_0),0_8px_20px_-2px_oklch(0.145_0_0)]">
        <div className="px-4 pt-1.5 pb-1 flex items-center justify-between gap-2">
          {isHomePage ? (
            <Link href="/">
              <Image
                src="/logo/logo-icon.png"
                alt="Smoothie"
                width={0}
                height={0}
                sizes="100vw"
                className="h-12 w-auto"
                priority
              />
            </Link>
          ) : (
            <h1 className="text-xl font-medium h-12 flex items-center">
              {pageTitle}
            </h1>
          )}

          <WalletSelector
            wallets={wallets}
            activeWallet={activeWallet}
            onSelectWallet={handleSelectWallet}
            onConnectWallet={handleConnectWallet}
            onDisconnect={handleDisconnect}
            isHydrated={isHydrated}
          />
        </div>
      </header>

      {/* Spacer for fixed header - Mobile only */}
      <div className="md:hidden h-[52px]" />

      {/* Fixed header - Desktop only */}
      <div className="hidden md:block fixed top-0 left-56 right-0 z-[60] bg-background shadow-[0_4px_6px_0px_oklch(0.145_0_0),0_8px_20px_-2px_oklch(0.145_0_0)] dark:shadow-[0_4px_6px_0px_oklch(0.145_0_0),0_8px_20px_-2px_oklch(0.145_0_0)] [clip-path:inset(0_-100%_-100%_0)]">
        <div className="container max-w-3xl mx-auto px-4 pt-3 pb-2">
          <div className="flex items-center justify-between gap-2">
            {!isHomePage && (
              <h1 className="text-2xl font-medium">
                {pageTitle}
              </h1>
            )}
            <div className={isHomePage ? "ml-auto" : ""}>
              {walletSelectorElement}
            </div>
          </div>
        </div>
      </div>

      {/* Spacer for fixed header - Desktop only */}
      <div className="hidden md:block h-[60px]" />

      {/* Main content */}
      <main className={`flex-1 container max-w-3xl mx-auto px-4 py-3 sm:py-4 md:pb-6 ${isHomePage ? "md:pt-0" : "md:pt-4"}`}>
        {onRefresh ? (
          <PullToRefresh onRefresh={onRefresh}>{pageContent}</PullToRefresh>
        ) : (
          pageContent
        )}
      </main>

      {showFooter && <Footer />}
    </div>
  )
}
