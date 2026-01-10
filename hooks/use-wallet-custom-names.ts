"use client"

import * as React from "react"
import { WALLET_CUSTOM_NAMES_KEY } from "@/lib/constants"
import type { Wallet } from "@/types/wallet"

type CustomNamesMap = Record<string, string>

export interface UseWalletCustomNamesReturn {
  customNames: CustomNamesMap
  isHydrated: boolean
  setCustomName: (walletId: string, name: string) => void
  getDisplayName: (wallet: Wallet) => string
  clearCustomName: (walletId: string) => void
}

function loadCustomNames(): CustomNamesMap {
  if (typeof window === "undefined") {
    return {}
  }

  try {
    const stored = localStorage.getItem(WALLET_CUSTOM_NAMES_KEY)
    if (stored) {
      return JSON.parse(stored) as CustomNamesMap
    }
  } catch (error) {
    console.error("Error loading custom wallet names:", error)
  }

  return {}
}

function saveCustomNames(names: CustomNamesMap): void {
  try {
    if (Object.keys(names).length > 0) {
      localStorage.setItem(WALLET_CUSTOM_NAMES_KEY, JSON.stringify(names))
    } else {
      localStorage.removeItem(WALLET_CUSTOM_NAMES_KEY)
    }
  } catch (error) {
    console.error("Error saving custom wallet names:", error)
  }
}

export function useWalletCustomNames(): UseWalletCustomNamesReturn {
  const [customNames, setCustomNames] = React.useState<CustomNamesMap>({})
  const [isHydrated, setIsHydrated] = React.useState(false)

  // Load from localStorage after hydration
  React.useEffect(() => {
    setCustomNames(loadCustomNames())
    setIsHydrated(true)
  }, [])

  // Save to localStorage when customNames changes (only after hydration)
  React.useEffect(() => {
    if (!isHydrated) return
    saveCustomNames(customNames)
  }, [customNames, isHydrated])

  const setCustomName = React.useCallback((walletId: string, name: string) => {
    const trimmed = name.trim()
    setCustomNames((prev) => {
      if (!trimmed) {
        // Remove the custom name if empty
        const { [walletId]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [walletId]: trimmed }
    })
  }, [])

  const clearCustomName = React.useCallback((walletId: string) => {
    setCustomNames((prev) => {
      const { [walletId]: _, ...rest } = prev
      return rest
    })
  }, [])

  const getDisplayName = React.useCallback(
    (wallet: Wallet): string => {
      // If there's a custom name, use it
      const customName = customNames[wallet.id]
      if (customName) {
        return customName
      }

      // Fall back to wallet's original name or "Wallet"
      return wallet.name || "Wallet"
    },
    [customNames]
  )

  return {
    customNames,
    isHydrated,
    setCustomName,
    getDisplayName,
    clearCustomName,
  }
}
