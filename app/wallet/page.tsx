"use client"

import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { AuthenticatedPage } from "@/components/authenticated-page"
import { PageTitle } from "@/components/page-title"
import { WalletContent } from "@/components/wallet-content"
import { useWalletState } from "@/hooks/use-wallet-state"
import { useAnalytics } from "@/hooks/use-analytics"

export default function WalletPage() {
  const queryClient = useQueryClient()
  const { activeWallet } = useWalletState()
  const { capture } = useAnalytics()

  const handleRefresh = useCallback(async () => {
    if (!activeWallet?.publicKey) return

    capture('pull_to_refresh', { page: 'wallet' })

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["horizonBalances", activeWallet.publicKey] }),
      queryClient.invalidateQueries({ queryKey: ["tokenBalance"] }),
      queryClient.invalidateQueries({ queryKey: ["blend-wallet-snapshot", activeWallet.publicKey] }),
      queryClient.invalidateQueries({ queryKey: ["token-sparkline"] }), // Refresh sparklines
    ])
  }, [activeWallet?.publicKey, queryClient, capture])

  return (
    <AuthenticatedPage onRefresh={handleRefresh}>
      <PageTitle>Wallet</PageTitle>
      <WalletContent />
    </AuthenticatedPage>
  )
}
