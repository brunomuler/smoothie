"use client"

import { useWalletContext } from "@/contexts/wallet-context"
import type { Wallet } from "@/types/wallet"

export interface UseWalletStateReturn {
  wallets: Wallet[]
  activeWallet: Wallet | null
  activeWalletId: string | null
  isHydrated: boolean
  handleSelectWallet: (walletId: string) => void
  handleConnectWallet: (address: string, walletName?: string) => void
  handleConnectDemoWallet: (address: string) => void
  handleDisconnect: (walletId: string) => void
}

// URL address processing is now handled in WalletProvider to avoid duplicate processing
// when multiple components use this hook
export function useWalletState(): UseWalletStateReturn {
  const {
    wallets,
    activeWallet,
    activeWalletId,
    isHydrated,
    handleSelectWallet,
    handleConnectWallet,
    handleConnectDemoWallet,
    handleDisconnect,
  } = useWalletContext()

  return {
    wallets,
    activeWallet,
    activeWalletId,
    isHydrated,
    handleSelectWallet,
    handleConnectWallet,
    handleConnectDemoWallet,
    handleDisconnect,
  }
}
