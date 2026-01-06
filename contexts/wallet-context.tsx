"use client"

import * as React from "react"
import { StrKey } from "@stellar/stellar-sdk"
import { WALLETS_STORAGE_KEY, ACTIVE_WALLET_STORAGE_KEY } from "@/lib/constants"
import type { Wallet } from "@/types/wallet"

function isValidStellarAddress(addr: string): boolean {
  if (!addr || typeof addr !== "string") return false
  try {
    const trimmed = addr.trim()
    return StrKey.isValidEd25519PublicKey(trimmed) || StrKey.isValidContract(trimmed)
  } catch {
    return false
  }
}

export interface WalletContextValue {
  wallets: Wallet[]
  activeWallet: Wallet | null
  activeWalletId: string | null
  isHydrated: boolean
  setWallets: React.Dispatch<React.SetStateAction<Wallet[]>>
  setActiveWalletId: React.Dispatch<React.SetStateAction<string | null>>
  handleSelectWallet: (walletId: string) => void
  handleConnectWallet: (address: string, walletName?: string) => void
  handleConnectDemoWallet: (address: string) => void
  handleDisconnect: (walletId: string) => void
}

const WalletContext = React.createContext<WalletContextValue | null>(null)

// Initialize wallets - this function handles URL params and localStorage
// Called only once via lazy state initialization
function initializeWallets(): { wallets: Wallet[]; activeId: string | null } {
  if (typeof window === "undefined") {
    return { wallets: [], activeId: null }
  }

  // Load existing wallets from localStorage
  let wallets: Wallet[] = []
  let activeId: string | null = null

  try {
    const walletsJson = localStorage.getItem(WALLETS_STORAGE_KEY)
    const activeIdJson = localStorage.getItem(ACTIVE_WALLET_STORAGE_KEY)

    if (walletsJson) {
      wallets = JSON.parse(walletsJson) as Wallet[]
    }
    if (activeIdJson) {
      activeId = activeIdJson
    }
  } catch (error) {
    console.error("Error loading wallets from localStorage:", error)
  }

  // Handle URL address parameter
  const urlParams = new URLSearchParams(window.location.search)
  const addressParam = urlParams.get("address")?.trim()

  if (addressParam && isValidStellarAddress(addressParam)) {
    // Check if this address already exists
    const existingWallet = wallets.find(
      (w) => w.publicKey.toLowerCase() === addressParam.toLowerCase()
    )

    if (existingWallet) {
      // Just select it
      activeId = existingWallet.id
      wallets = wallets.map((w) => ({
        ...w,
        isActive: w.id === existingWallet.id,
      }))
      localStorage.setItem(WALLETS_STORAGE_KEY, JSON.stringify(wallets))
      localStorage.setItem(ACTIVE_WALLET_STORAGE_KEY, activeId)
    } else {
      // Add new wallet
      const isContract = addressParam.startsWith("C")
      const shortAddr = `${addressParam.slice(0, 4)}...${addressParam.slice(-4)}`
      const walletName = isContract ? `Contract ${shortAddr}` : `Watch ${shortAddr}`

      const newWallet: Wallet = {
        id: `wallet-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        publicKey: addressParam,
        name: walletName,
        isActive: true,
      }

      wallets = [...wallets.map((w) => ({ ...w, isActive: false })), newWallet]
      activeId = newWallet.id

      localStorage.setItem(WALLETS_STORAGE_KEY, JSON.stringify(wallets))
      localStorage.setItem(ACTIVE_WALLET_STORAGE_KEY, activeId)
    }
  }

  return { wallets, activeId }
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  // Start with empty values to match server-side rendering
  const [wallets, setWallets] = React.useState<Wallet[]>([])
  const [activeWalletId, setActiveWalletId] = React.useState<string | null>(null)
  const [isHydrated, setIsHydrated] = React.useState(false)

  // Initialize from localStorage and URL params AFTER hydration
  React.useEffect(() => {
    const { wallets: initialWallets, activeId } = initializeWallets()
    setWallets(initialWallets)
    setActiveWalletId(activeId)
    setIsHydrated(true)
  }, [])

  // Save wallets to localStorage whenever they change (only after hydration)
  React.useEffect(() => {
    if (!isHydrated) return

    try {
      if (wallets.length > 0) {
        localStorage.setItem(WALLETS_STORAGE_KEY, JSON.stringify(wallets))
      } else {
        localStorage.removeItem(WALLETS_STORAGE_KEY)
      }
    } catch (error) {
      console.error("Error saving wallets to localStorage:", error)
    }
  }, [wallets, isHydrated])

  // Save active wallet ID to localStorage whenever it changes (only after hydration)
  React.useEffect(() => {
    if (!isHydrated) return

    try {
      if (activeWalletId) {
        localStorage.setItem(ACTIVE_WALLET_STORAGE_KEY, activeWalletId)
      } else {
        localStorage.removeItem(ACTIVE_WALLET_STORAGE_KEY)
      }
    } catch (error) {
      console.error("Error saving active wallet ID to localStorage:", error)
    }
  }, [activeWalletId, isHydrated])

  const activeWallet = React.useMemo(
    () => wallets.find((w) => w.id === activeWalletId) ?? null,
    [wallets, activeWalletId]
  )

  const handleSelectWallet = React.useCallback((walletId: string) => {
    setActiveWalletId(walletId)
    setWallets((prev) =>
      prev.map((w) => ({ ...w, isActive: w.id === walletId }))
    )
  }, [])

  const handleConnectWallet = React.useCallback((address: string, walletName?: string) => {
    const newWallet: Wallet = {
      id: `wallet-${Date.now()}`,
      publicKey: address,
      name: walletName,
      isActive: true,
      isDemoWallet: false,
    }

    setWallets((prev) => {
      // Remove any demo wallets when user adds a real wallet
      const filtered = prev.filter((w) => !w.isDemoWallet)
      const updated = filtered.map((w) => ({ ...w, isActive: false }))
      return [...updated, newWallet]
    })

    setActiveWalletId(newWallet.id)
  }, [])

  const handleConnectDemoWallet = React.useCallback((address: string) => {
    const demoWallet: Wallet = {
      id: `demo-${Date.now()}`,
      publicKey: address,
      name: 'Demo Account',
      isActive: true,
      isDemoWallet: true,
    }

    setWallets((prev) => {
      // Remove existing demo wallets first, then add the new one
      const filtered = prev.filter((w) => !w.isDemoWallet)
      const updated = filtered.map((w) => ({ ...w, isActive: false }))
      return [...updated, demoWallet]
    })

    setActiveWalletId(demoWallet.id)
  }, [])

  const handleDisconnect = React.useCallback((walletId: string) => {
    setWallets((prev) => {
      const remaining = prev.filter((w) => w.id !== walletId)

      // If we're disconnecting the active wallet, select the first remaining one
      if (activeWalletId === walletId && remaining.length > 0) {
        setActiveWalletId(remaining[0].id)
        return remaining.map((w, idx) => ({ ...w, isActive: idx === 0 }))
      } else if (activeWalletId === walletId) {
        setActiveWalletId(null)
      }

      return remaining
    })
  }, [activeWalletId])

  const value = React.useMemo(
    () => ({
      wallets,
      activeWallet,
      activeWalletId,
      isHydrated,
      setWallets,
      setActiveWalletId,
      handleSelectWallet,
      handleConnectWallet,
      handleConnectDemoWallet,
      handleDisconnect,
    }),
    [
      wallets,
      activeWallet,
      activeWalletId,
      isHydrated,
      handleSelectWallet,
      handleConnectWallet,
      handleConnectDemoWallet,
      handleDisconnect,
    ]
  )

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  )
}

export function useWalletContext(): WalletContextValue {
  const context = React.useContext(WalletContext)
  if (!context) {
    throw new Error("useWalletContext must be used within a WalletProvider")
  }
  return context
}
