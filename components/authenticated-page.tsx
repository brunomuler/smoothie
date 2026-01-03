"use client"

import { LandingPage } from "@/components/landing-page"
import { DashboardLayout } from "@/components/dashboard-layout"
import { useWalletState } from "@/hooks/use-wallet-state"

interface AuthenticatedPageProps {
  children: React.ReactNode
  onRefresh?: () => Promise<void>
  error?: Error | null
  /** When false, renders children without DashboardLayout wrapper */
  withLayout?: boolean
}

export function AuthenticatedPage({
  children,
  onRefresh,
  error,
  withLayout = true,
}: AuthenticatedPageProps) {
  const {
    wallets,
    activeWallet,
    handleSelectWallet,
    handleConnectWallet,
    handleConnectDemoWallet,
    handleDisconnect,
    isHydrated,
  } = useWalletState()

  // Wait for hydration before deciding what to show
  if (!isHydrated) {
    return null
  }

  // Show landing page for non-logged-in users
  if (!activeWallet) {
    return (
      <LandingPage
        wallets={wallets}
        activeWallet={activeWallet}
        onSelectWallet={handleSelectWallet}
        onConnectWallet={handleConnectWallet}
        onConnectDemoWallet={handleConnectDemoWallet}
        onDisconnect={handleDisconnect}
        isHydrated={isHydrated}
      />
    )
  }

  if (!withLayout) {
    return <>{children}</>
  }

  return (
    <DashboardLayout onRefresh={onRefresh} error={error}>
      {children}
    </DashboardLayout>
  )
}
