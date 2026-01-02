"use client"

import Image from "next/image"
import Link from "next/link"
import { WalletSelector } from "@/components/wallet-selector"
import { PullToRefresh } from "@/components/pull-to-refresh"
import { Footer } from "@/components/footer"
import type { Wallet } from "@/types/wallet"

interface DashboardLayoutProps {
  wallets: Wallet[]
  activeWallet: Wallet | null
  onSelectWallet: (walletId: string) => void
  onConnectWallet: (address: string, walletName?: string) => void
  onDisconnect: (walletId: string) => void
  onRefresh?: () => Promise<void>
  error?: Error | null
  children: React.ReactNode
  isHydrated?: boolean
}

export function DashboardLayout({
  wallets,
  activeWallet,
  onSelectWallet,
  onConnectWallet,
  onDisconnect,
  onRefresh,
  error,
  children,
  isHydrated = true,
}: DashboardLayoutProps) {
  const mainContent = (
    <main className="py-3 sm:py-4">
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
    </main>
  )

  return (
    <div className="min-h-screen flex flex-col">
      {/* Fixed header - Mobile only (desktop has wallet selector in sidebar) */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 bg-background shadow-[0_4px_6px_0px_oklch(0.145_0_0),0_8px_20px_-2px_oklch(0.145_0_0)] dark:shadow-[0_4px_6px_0px_oklch(0.145_0_0),0_8px_20px_-2px_oklch(0.145_0_0)]">
        <div className="px-4 py-1.5 flex items-center justify-between gap-2">
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

          <WalletSelector
            wallets={wallets}
            activeWallet={activeWallet}
            onSelectWallet={onSelectWallet}
            onConnectWallet={onConnectWallet}
            onDisconnect={onDisconnect}
            isHydrated={isHydrated}
          />
        </div>
      </header>

      {/* Spacer for fixed header - Mobile only */}
      <div className="md:hidden h-[52px]" />

      {/* Main content with optional pull-to-refresh */}
      <div className="px-4 flex-1">
        <div className="max-w-4xl mx-auto">
          {onRefresh ? (
            <PullToRefresh onRefresh={onRefresh}>{mainContent}</PullToRefresh>
          ) : (
            mainContent
          )}
        </div>
      </div>

      <Footer />
    </div>
  )
}
