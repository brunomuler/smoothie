"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { WalletAvatar } from "@/components/wallet-avatar"
import type { Wallet } from "@/types/wallet"

interface WalletAggregationSelectorProps {
  wallets: Wallet[]
  activeWalletId: string | null
  selectedWalletIds: string[]
  onApply: (walletIds: string[]) => void
}

export function WalletAggregationSelector({
  wallets,
  activeWalletId,
  selectedWalletIds,
  onApply,
}: WalletAggregationSelectorProps) {
  const [open, setOpen] = React.useState(false)
  const [pendingSelection, setPendingSelection] = React.useState<string[]>(selectedWalletIds)

  // Reset pending selection when popover opens
  React.useEffect(() => {
    if (open) {
      setPendingSelection(selectedWalletIds)
    }
  }, [open, selectedWalletIds])

  // Get other wallets (not the active one)
  const otherWallets = wallets.filter((w) => w.id !== activeWalletId)


  // Check if there are pending changes
  const hasChanges = React.useMemo(() => {
    if (pendingSelection.length !== selectedWalletIds.length) return true
    const sortedPending = [...pendingSelection].sort()
    const sortedSelected = [...selectedWalletIds].sort()
    return sortedPending.some((id, i) => id !== sortedSelected[i])
  }, [pendingSelection, selectedWalletIds])

  const MAX_SELECTION = 5

  const handleToggleWallet = (walletId: string, checked: boolean) => {
    if (checked) {
      // Only add if under max selection
      setPendingSelection((prev) => {
        if (prev.length >= MAX_SELECTION) return prev
        return [...prev, walletId]
      })
    } else {
      setPendingSelection((prev) => prev.filter((id) => id !== walletId))
    }
  }

  // Check if max selection reached
  const isMaxReached = pendingSelection.length >= MAX_SELECTION

  const handleApply = () => {
    onApply(pendingSelection)
    setOpen(false)
  }

  const getWalletDisplayName = (wallet: Wallet) => {
    if (wallet.name) {
      // Clean up old format names like "Watch XXXX...YYYY" or "Contract XXXX...YYYY"
      // to just "Watch" or "Contract" since we show address separately
      if (wallet.name.match(/^(Watch|Contract)\s+[A-Z0-9]{4}\.\.\.[A-Z0-9]{4}$/i)) {
        return wallet.name.split(" ")[0]
      }
      return wallet.name
    }
    return `${wallet.publicKey.slice(0, 4)}...${wallet.publicKey.slice(-4)}`
  }

  const getTruncatedAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`
  }

  // Count of additional wallets selected (beyond the active one)
  const additionalCount = selectedWalletIds.filter((id) => id !== activeWalletId).length

  // Get the active wallet for display
  const activeWallet = wallets.find((w) => w.id === activeWalletId)

  // Get selected wallets for stacked avatars (up to 5)
  const selectedWallets = wallets.filter((w) => selectedWalletIds.includes(w.id))
  const displayWallets = selectedWallets.slice(0, 5)

  // Only show if there are multiple wallets
  if (wallets.length <= 1) {
    return null
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-auto py-1 px-1.5 gap-1 ${selectedWalletIds.length > 1 ? "!border-primary !bg-primary/10" : ""}`}
          aria-label="Combine wallets"
        >
          {/* Stacked avatars */}
          <div className="flex items-center -space-x-1.5">
            {displayWallets.map((wallet, index) => (
              <div
                key={wallet.id}
                className="ring-2 ring-background rounded-md"
                style={{ zIndex: displayWallets.length - index }}
              >
                <WalletAvatar
                  address={wallet.publicKey}
                  name={wallet.name}
                  size="sm"
                />
              </div>
            ))}
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-sm">Combine Wallets</h4>
            <p className="text-xs text-muted-foreground">
              View aggregated performance across multiple wallets
            </p>
          </div>

          <Separator />

          {/* Active wallet (always selected, disabled) */}
          {activeWalletId && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">Current Wallet</p>
              {wallets
                .filter((w) => w.id === activeWalletId)
                .map((wallet) => (
                  <div key={wallet.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`wallet-${wallet.id}`}
                      checked={true}
                      disabled
                    />
                    <WalletAvatar
                      address={wallet.publicKey}
                      name={wallet.name}
                      size="sm"
                    />
                    <Label
                      htmlFor={`wallet-${wallet.id}`}
                      className="flex items-center gap-1.5 cursor-not-allowed min-w-0 flex-1"
                    >
                      <span className="text-sm text-muted-foreground truncate">
                        {getWalletDisplayName(wallet)}
                      </span>
                      <span className="text-xs text-muted-foreground/60 font-mono">
                        {getTruncatedAddress(wallet.publicKey)}
                      </span>
                    </Label>
                  </div>
                ))}
            </div>
          )}

          {/* Other wallets */}
          {otherWallets.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">Other Wallets</p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {otherWallets.map((wallet) => {
                  const isSelected = pendingSelection.includes(wallet.id)
                  const isDisabled = isMaxReached && !isSelected
                  return (
                  <div key={wallet.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`wallet-${wallet.id}`}
                      checked={isSelected}
                      disabled={isDisabled}
                      onCheckedChange={(checked) => handleToggleWallet(wallet.id, !!checked)}
                    />
                    <WalletAvatar
                      address={wallet.publicKey}
                      name={wallet.name}
                      size="sm"
                    />
                    <Label
                      htmlFor={`wallet-${wallet.id}`}
                      className="flex items-center gap-1.5 cursor-pointer min-w-0 flex-1"
                    >
                      <span className="text-sm truncate">
                        {getWalletDisplayName(wallet)}
                        {wallet.isDemoWallet && (
                          <span className="text-[10px] text-muted-foreground ml-1">(Demo)</span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground/60 font-mono">
                        {getTruncatedAddress(wallet.publicKey)}
                      </span>
                    </Label>
                  </div>
                  )
                })}
              </div>
            </div>
          )}

          <Separator />

          <Button
            onClick={handleApply}
            disabled={!hasChanges}
            className="w-full"
            size="sm"
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
