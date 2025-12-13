"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { useSearchParams } from "next/navigation"
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

export interface UseWalletStateReturn {
  wallets: Wallet[]
  activeWallet: Wallet | null
  activeWalletId: string | null
  isHydrated: boolean
  handleSelectWallet: (walletId: string) => void
  handleConnectWallet: (address: string, walletName?: string) => void
  handleDisconnect: (walletId: string) => void
}

export function useWalletState(): UseWalletStateReturn {
  const searchParams = useSearchParams()
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [activeWalletId, setActiveWalletId] = useState<string | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)
  const [urlAddressProcessed, setUrlAddressProcessed] = useState(false)

  // Load wallets from localStorage on mount
  useEffect(() => {
    try {
      const savedWallets = localStorage.getItem(WALLETS_STORAGE_KEY)
      const savedActiveId = localStorage.getItem(ACTIVE_WALLET_STORAGE_KEY)

      if (savedWallets) {
        const parsedWallets = JSON.parse(savedWallets) as Wallet[]
        setWallets(parsedWallets)
      }

      if (savedActiveId) {
        setActiveWalletId(savedActiveId)
      }
    } catch (error) {
      console.error("Error loading wallets from localStorage:", error)
    } finally {
      setIsHydrated(true)
    }
  }, [])

  // Save wallets to localStorage whenever they change (only after hydration)
  useEffect(() => {
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
  useEffect(() => {
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

  // Handle URL address parameter - add to followed list and show automatically
  useEffect(() => {
    if (!isHydrated || urlAddressProcessed) return

    const addressParam = searchParams.get("address")
    if (!addressParam) {
      setUrlAddressProcessed(true)
      return
    }

    const trimmedAddress = addressParam.trim()
    if (!isValidStellarAddress(trimmedAddress)) {
      console.warn("Invalid address in URL parameter:", trimmedAddress)
      setUrlAddressProcessed(true)
      return
    }

    // Check if this address already exists in wallets
    const existingWallet = wallets.find(
      (w) => w.publicKey.toLowerCase() === trimmedAddress.toLowerCase()
    )

    if (existingWallet) {
      // Address already exists, just select it
      setActiveWalletId(existingWallet.id)
      setWallets((prev) =>
        prev.map((w) => ({ ...w, isActive: w.id === existingWallet.id }))
      )
    } else {
      // Add as a new watched wallet
      const isContract = trimmedAddress.startsWith("C")
      const shortAddr = `${trimmedAddress.slice(0, 4)}...${trimmedAddress.slice(-4)}`
      const walletName = isContract ? `Contract ${shortAddr}` : `Watch ${shortAddr}`

      const newWallet: Wallet = {
        id: `wallet-${Date.now()}`,
        publicKey: trimmedAddress,
        name: walletName,
        isActive: true,
      }

      setWallets((prev) => {
        const updated = prev.map((w) => ({ ...w, isActive: false }))
        return [...updated, newWallet]
      })
      setActiveWalletId(newWallet.id)
    }

    setUrlAddressProcessed(true)
  }, [isHydrated, urlAddressProcessed, searchParams, wallets])

  const activeWallet = useMemo(
    () => wallets.find((w) => w.id === activeWalletId) ?? null,
    [wallets, activeWalletId]
  )

  const handleSelectWallet = useCallback((walletId: string) => {
    setActiveWalletId(walletId)
    setWallets((prev) =>
      prev.map((w) => ({ ...w, isActive: w.id === walletId }))
    )
  }, [])

  const handleConnectWallet = useCallback((address: string, walletName?: string) => {
    const newWallet: Wallet = {
      id: `wallet-${Date.now()}`,
      publicKey: address,
      name: walletName,
      isActive: true,
    }

    setWallets((prev) => {
      const updated = prev.map((w) => ({ ...w, isActive: false }))
      return [...updated, newWallet]
    })

    setActiveWalletId(newWallet.id)
  }, [])

  const handleDisconnect = useCallback((walletId: string) => {
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

  return {
    wallets,
    activeWallet,
    activeWalletId,
    isHydrated,
    handleSelectWallet,
    handleConnectWallet,
    handleDisconnect,
  }
}
