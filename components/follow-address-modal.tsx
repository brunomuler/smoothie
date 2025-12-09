"use client"

import * as React from "react"
import { Eye, Check, AlertCircle } from "lucide-react"
import { StrKey } from "@stellar/stellar-sdk"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

interface FollowAddressModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddressSubmit: (address: string) => void
}

export function FollowAddressModal({
  open,
  onOpenChange,
  onAddressSubmit,
}: FollowAddressModalProps) {
  const [address, setAddress] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [isValidating, setIsValidating] = React.useState(false)
  const [isKeyboardOpen, setIsKeyboardOpen] = React.useState(false)

  // Detect keyboard visibility using visualViewport API (mobile only)
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return

    // Only detect keyboard on mobile/touch devices
    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0

    if (!isTouchDevice) {
      setIsKeyboardOpen(false)
      return
    }

    const viewport = window.visualViewport
    const initialHeight = window.innerHeight

    const handleResize = () => {
      // If visualViewport height is significantly less than window height, keyboard is likely open
      const heightDiff = initialHeight - viewport.height
      setIsKeyboardOpen(heightDiff > 150)
    }

    viewport.addEventListener("resize", handleResize)
    return () => viewport.removeEventListener("resize", handleResize)
  }, [])

  const validateAddress = (addr: string): boolean => {
    if (!addr || typeof addr !== "string") {
      return false
    }
    // Use Stellar SDK's built-in validation for public keys (G...) and contracts (C...)
    try {
      const trimmed = addr.trim()
      return StrKey.isValidEd25519PublicKey(trimmed) || StrKey.isValidContract(trimmed)
    } catch {
      return false
    }
  }

  React.useEffect(() => {
    if (open) {
      setAddress("")
      setError(null)
    }
  }, [open])

  const handleSubmit = () => {
    const trimmedAddress = address.trim()
    if (!trimmedAddress) {
      setError("Please enter an address")
      return
    }

    setIsValidating(true)
    // Small delay for better UX
    setTimeout(() => {
      if (!validateAddress(trimmedAddress)) {
        setError("Invalid Stellar address format. Please enter a valid public key (starts with 'G') or contract address (starts with 'C').")
        setIsValidating(false)
        return
      }

      setError(null)
      onAddressSubmit(trimmedAddress)
      onOpenChange(false)
      setAddress("")
      setIsValidating(false)
    }, 100)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && address.trim() && !isValidating) {
      handleSubmit()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "sm:max-w-lg max-h-[85vh] overflow-y-auto",
          isKeyboardOpen && "!top-4 !translate-y-0"
        )}
      >
        <DialogHeader className="space-y-2 pb-4">
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/20">
              <Eye className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            Follow a Public Address
          </DialogTitle>
          <DialogDescription className="text-base">
            Enter a Stellar public address or contract address to view its balances and activity
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-2">
          <div className="space-y-2">
            <label
              htmlFor="address"
              className="text-sm font-semibold text-foreground"
            >
              Stellar Address or Contract
            </label>
            <div className="relative">
              <Input
                id="address"
                type="text"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value)
                  if (error) setError(null)
                }}
                onKeyDown={handleKeyDown}
                placeholder="G... or C..."
                className={cn(
                  "h-12 font-mono text-sm",
                  error && "border-destructive focus-visible:ring-destructive"
                )}
                disabled={isValidating}
              />
              {address.trim() && !error && validateAddress(address.trim()) && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
              )}
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive dark:bg-destructive/20">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {address.trim() && !error && validateAddress(address.trim()) && (
              <div className="flex items-start gap-2 rounded-md bg-green-50 dark:bg-green-950/20 p-3 text-sm text-green-700 dark:text-green-400">
                <Check className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Valid Stellar address</span>
              </div>
            )}
          </div>
          <Separator />
          <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Check className="h-4 w-4 text-primary" />
            </div>
            <div className="space-y-1">
              <div className="font-medium text-foreground">Read-only access</div>
              <div className="text-sm text-muted-foreground">
                You can view balances and activity without connecting your wallet. This is safe and doesn't require any permissions.
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={isValidating}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!address.trim() || isValidating || !!error}
            className="min-w-[120px]"
          >
            {isValidating ? "Validating..." : "Follow Address"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

