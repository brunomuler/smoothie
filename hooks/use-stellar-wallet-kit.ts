"use client"

import { useEffect, useState } from "react"
import { StellarWalletsKit } from "@creit-tech/stellar-wallets-kit/sdk"
// @ts-ignore - ISupportedWallet type not exported in current version
type ISupportedWallet = any
import { Networks } from "@creit-tech/stellar-wallets-kit/types"
import { defaultModules } from "@creit-tech/stellar-wallets-kit/modules/utils"

// Global initialization flag to prevent multiple initializations
let isKitInitialized = false
let initializationPromise: Promise<void> | null = null
let isModalOpen = false // Global flag to prevent multiple modal instances

async function initializeWalletKit(network: Networks) {
  // Only initialize on client side
  if (typeof window === "undefined") {
    return
  }

  if (isKitInitialized) {
    return
  }

  if (initializationPromise) {
    return initializationPromise
  }

  initializationPromise = (async () => {
    try {
      StellarWalletsKit.init({
        network,
        modules: defaultModules(),
      })
      StellarWalletsKit.setNetwork(network)
      isKitInitialized = true
      console.log("Stellar Wallets Kit initialized")
    } catch (error) {
      console.error("Failed to initialize wallet kit:", error)
      initializationPromise = null
      throw error
    }
  })()

  return initializationPromise
}

export function useStellarWalletKit(network: Networks = Networks.TESTNET) {
  const [isInitialized, setIsInitialized] = useState(isKitInitialized)

  useEffect(() => {
    if (!isKitInitialized && !initializationPromise) {
      initializeWalletKit(network).then(() => {
        setIsInitialized(true)
      }).catch(() => {
        setIsInitialized(false)
      })
    } else if (isKitInitialized) {
      setIsInitialized(true)
    } else if (initializationPromise) {
      initializationPromise.then(() => {
        setIsInitialized(true)
      }).catch(() => {
        setIsInitialized(false)
      })
    }
  }, [network])

  const openWalletModal = async (
    onWalletSelected?: (address: string) => Promise<void> | void
  ): Promise<string | undefined> => {
    // Prevent multiple modal opens (global check)
    if (isModalOpen) {
      console.warn("Wallet modal is already open")
      return undefined
    }

    if (!isKitInitialized) {
      throw new Error("Wallet kit not initialized. Please wait...")
    }

    isModalOpen = true

    try {
      const result = await StellarWalletsKit.authModal({
        onWalletSelected: async (wallet: ISupportedWallet) => {
          StellarWalletsKit.setWallet(wallet.id)
        },
      } as any)
      
      if (onWalletSelected && result.address) {
        await onWalletSelected(result.address)
      }
      
      return result.address
    } catch (error) {
      console.error("Failed to open wallet modal:", error)
      throw error
    } finally {
      isModalOpen = false
    }
  }

  const getAddress = async (): Promise<string> => {
    if (!isKitInitialized) {
      throw new Error("Wallet kit not initialized")
    }
    try {
      const { address } = await StellarWalletsKit.getAddress()
      return address
    } catch (error) {
      console.error("Failed to get address:", error)
      throw error
    }
  }

  const disconnect = async (): Promise<void> => {
    if (!isKitInitialized) {
      return
    }
    try {
      await StellarWalletsKit.disconnect()
    } catch (error) {
      console.error("Failed to disconnect:", error)
    }
  }

  return {
    isInitialized,
    openWalletModal,
    getAddress,
    disconnect,
  }
}
