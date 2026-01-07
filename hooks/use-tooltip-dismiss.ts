"use client"

import { useRef, useEffect, useState, useCallback } from "react"

// Global registry of all chart containers for coordination
const chartContainers = new Set<HTMLDivElement>()

/**
 * Hook that manages tooltip visibility with proper coordination between multiple charts.
 *
 * Key behaviors:
 * - Clicking/touching inside a chart enables its tooltip
 * - Clicking/touching outside ALL charts disables tooltips
 * - Only one chart can have an active tooltip at a time
 * - Conditionally render <Tooltip> using shouldRenderTooltip to reset Recharts' internal state
 */
export function useTooltipDismiss() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [shouldRenderTooltip, setShouldRenderTooltip] = useState(true)

  // Register/unregister container
  useEffect(() => {
    const container = containerRef.current
    if (container) {
      chartContainers.add(container)
      return () => {
        chartContainers.delete(container)
      }
    }
  }, [])

  const handleInteraction = useCallback((event: MouseEvent | TouchEvent) => {
    const container = containerRef.current
    if (!container) return

    const target = event.target as Node

    // Check if interaction is inside THIS container
    if (container.contains(target)) {
      setShouldRenderTooltip(true)
      return
    }

    // Check if interaction is inside ANY other registered chart container
    let isInsideAnyChart = false
    chartContainers.forEach(otherContainer => {
      if (otherContainer.contains(target)) {
        isInsideAnyChart = true
      }
    })

    if (isInsideAnyChart) {
      // Clicked on another chart - disable THIS chart's tooltip
      setShouldRenderTooltip(false)
    } else {
      // Clicked outside ALL charts - disable tooltip
      setShouldRenderTooltip(false)
    }
  }, [])

  useEffect(() => {
    document.addEventListener("mousedown", handleInteraction)
    document.addEventListener("touchstart", handleInteraction)

    return () => {
      document.removeEventListener("mousedown", handleInteraction)
      document.removeEventListener("touchstart", handleInteraction)
    }
  }, [handleInteraction])

  return { containerRef, shouldRenderTooltip }
}
