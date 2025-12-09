"use client"

import * as React from "react"
import { Eye, ChevronRight, Loader2, Download } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { SupportedWallet } from "@/hooks/use-stellar-wallet-kit"

interface WalletConnectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onFollowAddress: () => void
  onWalletSelect: (wallet: SupportedWallet) => void
  wallets: SupportedWallet[]
  isLoadingWallets: boolean
}

export function WalletConnectionModal({
  open,
  onOpenChange,
  onFollowAddress,
  onWalletSelect,
  wallets,
  isLoadingWallets,
}: WalletConnectionModalProps) {
  const handleFollowAddressClick = () => {
    onFollowAddress()
    onOpenChange(false)
  }

  const handleWalletClick = (wallet: SupportedWallet) => {
    if (!wallet.isAvailable) {
      window.open(wallet.url, "_blank", "noopener,noreferrer")
      return
    }
    onWalletSelect(wallet)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="space-y-2 pb-2">
          <DialogTitle className="text-2xl">Connect a Wallet</DialogTitle>
          <DialogDescription className="text-base">
            Choose how you want to connect to your Stellar wallet
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Follow Address Option */}
          <button
            onClick={handleFollowAddressClick}
            className={cn(
              "group relative flex w-full items-center gap-4 rounded-lg border border-border bg-card p-4 text-left transition-all",
              "hover:border-primary/50 hover:bg-accent/50 hover:shadow-md",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "active:scale-[0.98]"
            )}
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/20 transition-colors group-hover:scale-105">
              <Eye className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="font-semibold text-foreground group-hover:text-primary">
                Follow a Public Address
              </div>
              <div className="text-sm text-muted-foreground">
                View balances and activity without connecting
              </div>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
          </button>

          {/* Connect Wallet Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground px-1">
              Choose a Wallet
            </h3>

            {isLoadingWallets ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : wallets.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No wallets available
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                {wallets.map((wallet) => (
                  <button
                    key={wallet.id}
                    onClick={() => handleWalletClick(wallet)}
                    className={cn(
                      "group relative flex flex-col items-center gap-2 rounded-xl p-3 transition-all",
                      "hover:bg-accent/50",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      "active:scale-95",
                      !wallet.isAvailable && "opacity-50"
                    )}
                  >
                    <div className="relative">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted overflow-hidden shadow-sm transition-transform group-hover:scale-105">
                        <img
                          src={wallet.icon}
                          alt={wallet.name}
                          className="h-10 w-10 object-contain"
                        />
                      </div>
                      {!wallet.isAvailable && (
                        <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-muted-foreground/80 text-background">
                          <Download className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                    <span className="text-xs font-medium text-center text-foreground truncate w-full">
                      {wallet.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
