"use client"

import * as React from "react"
import { WALLET_AVATAR_CUSTOMIZATIONS_KEY } from "@/lib/constants"

export interface AvatarCustomization {
  emoji: string
  gradientId: string
}

// 10 playful gradient backgrounds (2 rows of 5)
export const AVATAR_GRADIENTS = [
  { id: "sunset", colors: ["#FF6B6B", "#FFE66D"], name: "Sunset" },
  { id: "ocean", colors: ["#0077B6", "#00B4D8"], name: "Ocean" },
  { id: "purple-rain", colors: ["#9B59B6", "#E74C3C"], name: "Purple Rain" },
  { id: "cotton-candy", colors: ["#FF9FF3", "#FFEAA7"], name: "Cotton Candy" },
  { id: "mint", colors: ["#00B894", "#81ECEC"], name: "Mint" },
  { id: "peach", colors: ["#FD79A8", "#FDCB6E"], name: "Peach" },
  { id: "sky", colors: ["#74B9FF", "#A29BFE"], name: "Sky" },
  { id: "fire", colors: ["#FF7675", "#FD79A8"], name: "Fire" },
  { id: "forest", colors: ["#11998E", "#38EF7D"], name: "Emerald" },
  { id: "midnight", colors: ["#FF4757", "#FF6B81"], name: "Cherry" },
] as const

export type GradientId = typeof AVATAR_GRADIENTS[number]["id"]

type CustomizationsMap = Record<string, AvatarCustomization>

export interface UseWalletAvatarCustomizationReturn {
  customizations: CustomizationsMap
  isHydrated: boolean
  setCustomization: (walletId: string, customization: AvatarCustomization) => void
  getCustomization: (walletId: string) => AvatarCustomization | null
  clearCustomization: (walletId: string) => void
  hasCustomization: (walletId: string) => boolean
}

function loadCustomizations(): CustomizationsMap {
  if (typeof window === "undefined") {
    return {}
  }

  try {
    const stored = localStorage.getItem(WALLET_AVATAR_CUSTOMIZATIONS_KEY)
    if (stored) {
      return JSON.parse(stored) as CustomizationsMap
    }
  } catch (error) {
    console.error("Error loading avatar customizations:", error)
  }

  return {}
}

function saveCustomizations(customizations: CustomizationsMap): void {
  try {
    if (Object.keys(customizations).length > 0) {
      localStorage.setItem(WALLET_AVATAR_CUSTOMIZATIONS_KEY, JSON.stringify(customizations))
    } else {
      localStorage.removeItem(WALLET_AVATAR_CUSTOMIZATIONS_KEY)
    }
  } catch (error) {
    console.error("Error saving avatar customizations:", error)
  }
}

export function useWalletAvatarCustomization(): UseWalletAvatarCustomizationReturn {
  const [customizations, setCustomizations] = React.useState<CustomizationsMap>({})
  const [isHydrated, setIsHydrated] = React.useState(false)

  // Load from localStorage after hydration
  React.useEffect(() => {
    setCustomizations(loadCustomizations())
    setIsHydrated(true)
  }, [])

  // Save to localStorage when customizations change (only after hydration)
  React.useEffect(() => {
    if (!isHydrated) return
    saveCustomizations(customizations)
  }, [customizations, isHydrated])

  const setCustomization = React.useCallback((walletId: string, customization: AvatarCustomization) => {
    setCustomizations((prev) => ({
      ...prev,
      [walletId]: customization,
    }))
  }, [])

  const clearCustomization = React.useCallback((walletId: string) => {
    setCustomizations((prev) => {
      const { [walletId]: _, ...rest } = prev
      return rest
    })
  }, [])

  const getCustomization = React.useCallback(
    (walletId: string): AvatarCustomization | null => {
      return customizations[walletId] || null
    },
    [customizations]
  )

  const hasCustomization = React.useCallback(
    (walletId: string): boolean => {
      return walletId in customizations
    },
    [customizations]
  )

  return {
    customizations,
    isHydrated,
    setCustomization,
    getCustomization,
    clearCustomization,
    hasCustomization,
  }
}
