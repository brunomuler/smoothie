"use client"

import { useEffect } from "react"

/**
 * Detects iOS standalone mode and adds a class to the HTML element.
 * Android/Chrome PWA is handled via CSS media query (display-mode: standalone).
 *
 * This hook should be called once at the app root level.
 */
export function useStandaloneMode() {
  useEffect(() => {
    // Only check for iOS standalone mode - Android is handled by CSS media query
    const isIOSStandalone =
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true

    if (isIOSStandalone) {
      document.documentElement.classList.add("ios-standalone")
    }

    return () => {
      document.documentElement.classList.remove("ios-standalone")
    }
  }, [])
}
