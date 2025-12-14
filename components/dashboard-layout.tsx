"use client"

import Image from "next/image"
import { WalletSelector } from "@/components/wallet-selector"
import { PullToRefresh } from "@/components/pull-to-refresh"
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
}: DashboardLayoutProps) {
  const mainContent = (
    <main className="container max-w-4xl mx-auto px-4 py-3 sm:py-4">
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
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 bg-background shadow-[0_4px_6px_0px_oklch(0.145_0_0),0_8px_20px_-2px_oklch(0.145_0_0)] dark:shadow-[0_4px_6px_0px_oklch(0.145_0_0),0_8px_20px_-2px_oklch(0.145_0_0)]">
        <div className="container max-w-4xl mx-auto px-4 py-1.5 sm:py-2 flex items-center justify-between gap-2">
          <div className="relative h-10 sm:h-12">
            <Image
              src="/logo/logo-light.png"
              alt="Smoothie"
              width={0}
              height={0}
              sizes="100vw"
              className="h-10 sm:h-12 w-auto dark:hidden"
              priority
            />
            <Image
              src="/logo/logo.png"
              alt="Smoothie"
              width={0}
              height={0}
              sizes="100vw"
              className="h-10 sm:h-12 w-auto hidden dark:block"
              priority
            />
          </div>
          <div className="flex items-center gap-2">
            <WalletSelector
              wallets={wallets}
              activeWallet={activeWallet}
              onSelectWallet={onSelectWallet}
              onConnectWallet={onConnectWallet}
              onDisconnect={onDisconnect}
            />
          </div>
        </div>
      </header>

      {/* Spacer for fixed header */}
      <div className="h-[52px] sm:h-[64px]" />

      {onRefresh ? (
        <PullToRefresh onRefresh={onRefresh}>{mainContent}</PullToRefresh>
      ) : (
        mainContent
      )}
    </div>
  )
}
