"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

// Context to share touch handling between Tooltip and TooltipTrigger
const TooltipContext = React.createContext<{
  isTouchDevice: boolean
  onTriggerClick: () => void
} | null>(null)

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const [open, setOpen] = React.useState(false)
  const [isTouchDevice, setIsTouchDevice] = React.useState(false)

  React.useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0)
  }, [])

  // Close tooltip when clicking outside on touch devices
  React.useEffect(() => {
    if (!isTouchDevice || !open) return

    const handleClickOutside = () => {
      setOpen(false)
    }

    // Small delay to prevent the click that opened it from immediately closing it
    const timeoutId = setTimeout(() => {
      document.addEventListener('touchstart', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [isTouchDevice, open])

  const handleOpenChange = (newOpen: boolean) => {
    // On touch devices, only allow programmatic control (via click)
    if (!isTouchDevice) {
      setOpen(newOpen)
    }
  }

  const onTriggerClick = React.useCallback(() => {
    if (isTouchDevice) {
      setOpen((prev) => !prev)
    }
  }, [isTouchDevice])

  const contextValue = React.useMemo(
    () => ({ isTouchDevice, onTriggerClick }),
    [isTouchDevice, onTriggerClick]
  )

  return (
    <TooltipProvider>
      <TooltipPrimitive.Root
        data-slot="tooltip"
        open={open}
        onOpenChange={handleOpenChange}
        {...props}
      >
        <TooltipContext.Provider value={contextValue}>
          {children}
        </TooltipContext.Provider>
      </TooltipPrimitive.Root>
    </TooltipProvider>
  )
}

function TooltipTrigger({
  onClick,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  const context = React.useContext(TooltipContext)

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    context?.onTriggerClick()
    onClick?.(e)
  }

  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      onClick={handleClick}
      {...props}
    />
  )
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  onPointerDownOutside,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  const context = React.useContext(TooltipContext)

  const handlePointerDownOutside = (e: Event) => {
    // On touch devices, prevent the default behavior of closing on pointer down
    // We handle closing via the touchstart listener in the Tooltip component
    if (context?.isTouchDevice) {
      e.preventDefault()
    }
    // Call the original handler if provided
    if (onPointerDownOutside) {
      onPointerDownOutside(e as unknown as Parameters<typeof onPointerDownOutside>[0])
    }
  }

  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        onPointerDownOutside={handlePointerDownOutside}
        className={cn(
          "bg-foreground text-background animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md px-3 py-1.5 text-xs text-balance",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="bg-foreground fill-foreground z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
