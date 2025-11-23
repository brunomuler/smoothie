"use client"

import * as React from "react"
import { Wallet, Check, Plus, LogOut, Copy, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu"
import { WalletConnectionModal, type WalletConnectionOption } from "@/components/wallet-connection-modal"
import { FollowAddressModal } from "@/components/follow-address-modal"
import { useStellarWalletKit } from "@/hooks/use-stellar-wallet-kit"
import type { Wallet as WalletType } from "@/types/wallet"
import { cn } from "@/lib/utils"

interface WalletSelectorProps {
  wallets: WalletType[]
  activeWallet: WalletType | null
  onSelectWallet: (walletId: string) => void
  onConnectWallet: (address: string, walletName?: string) => void
  onFollowAddress?: (address: string) => void
  onHardwareWallet?: () => void
  onDisconnect?: (walletId: string) => void
}

function shortenAddress(address: string): string {
  if (address.length <= 8) return address
  return `${address.slice(0, 4)}...${address.slice(-4)}`
}

export function WalletSelector({
  wallets,
  activeWallet,
  onSelectWallet,
  onConnectWallet,
  onFollowAddress,
  onHardwareWallet,
  onDisconnect,
}: WalletSelectorProps) {
  const [showConnectionModal, setShowConnectionModal] = React.useState(false)
  const [showFollowAddressModal, setShowFollowAddressModal] = React.useState(false)
  const [copiedAddress, setCopiedAddress] = React.useState<string | null>(null)
  const { openWalletModal, disconnect: disconnectWallet, isInitialized } = useStellarWalletKit()

  const handleConnectionOption = async (option: WalletConnectionOption) => {
    switch (option) {
      case "follow-address":
        setShowConnectionModal(false)
        setShowFollowAddressModal(true)
        break

      case "connect-wallet":
        setShowConnectionModal(false) // Close our modal first
        
        if (!isInitialized) {
          console.error("Wallet kit not initialized yet. Please wait...")
          return
        }

        // Wait a bit to ensure our modal is closed before opening wallet kit modal
        setTimeout(async () => {
          try {
            const address = await openWalletModal(async (address) => {
              if (address) {
                // Generate a simple wallet name
                const walletName = `Wallet ${shortenAddress(address)}`
                onConnectWallet(address, walletName)
              }
            })
          } catch (error) {
            console.error("Failed to open wallet modal:", error)
            // Reopen connection modal on error
            setShowConnectionModal(true)
          }
        }, 100)
        break

      case "hardware-wallet":
        setShowConnectionModal(false)
        
        if (onHardwareWallet) {
          onHardwareWallet()
        } else {
          // Fallback: try to open wallet modal which includes Ledger
          if (!isInitialized) {
            console.error("Wallet kit not initialized yet. Please wait...")
            return
          }

          setTimeout(async () => {
            try {
              const address = await openWalletModal(async (address) => {
                if (address) {
                  const walletName = `Hardware ${shortenAddress(address)}`
                  onConnectWallet(address, walletName)
                }
              })
            } catch (error) {
              console.error("Failed to open hardware wallet:", error)
              setShowConnectionModal(true)
            }
          }, 100)
        }
        break
    }
  }

  const handleFollowAddress = (address: string) => {
    if (onFollowAddress) {
      onFollowAddress(address)
    } else {
      // If no handler, treat it as a wallet connection
      const walletName = `Watch ${shortenAddress(address)}`
      onConnectWallet(address, walletName)
    }
    setShowFollowAddressModal(false)
  }

  const handleCopyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address)
      setCopiedAddress(address)
      setTimeout(() => setCopiedAddress(null), 2000)
    } catch (error) {
      console.error("Failed to copy address:", error)
    }
  }

  const handleDisconnect = async (wallet: WalletType) => {
    try {
      await disconnectWallet()
      if (onDisconnect) {
        onDisconnect(wallet.id)
      }
    } catch (error) {
      console.error("Failed to disconnect:", error)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-1 sm:gap-2 min-w-[120px] sm:min-w-[140px] text-xs sm:text-sm">
            <Wallet className="h-4 w-4 shrink-0" />
            {activeWallet ? (
              <span className="font-mono truncate">
                {shortenAddress(activeWallet.publicKey)}
              </span>
            ) : (
              <span className="hidden xs:inline">Connect Wallet</span>
            )}
            {!activeWallet && <span className="xs:hidden">Connect</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {wallets.length > 0 && (
            <>
              <DropdownMenuLabel>Connected Wallets</DropdownMenuLabel>
              <DropdownMenuGroup>
                {wallets.map((wallet) => (
                  <div key={wallet.id} className="space-y-1">
                    <DropdownMenuItem
                      onClick={() => onSelectWallet(wallet.id)}
                      className={cn(
                        "flex items-center justify-between cursor-pointer",
                        wallet.isActive && "bg-accent"
                      )}
                    >
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        {wallet.name && (
                          <span className="text-sm font-medium truncate">
                            {wallet.name}
                          </span>
                        )}
                        <span className="font-mono text-xs text-muted-foreground truncate">
                          {shortenAddress(wallet.publicKey)}
                        </span>
                      </div>
                      {wallet.isActive && (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary ml-2" />
                      )}
                    </DropdownMenuItem>
                    {wallet.isActive && (
                      <div className="px-2 pb-1 flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCopyAddress(wallet.publicKey)
                          }}
                        >
                          {copiedAddress === wallet.publicKey ? (
                            <>
                              <Check className="h-3 w-3 mr-1" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3 mr-1" />
                              Copy
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-2 text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDisconnect(wallet)
                          }}
                        >
                          <LogOut className="h-3 w-3 mr-1" />
                          Disconnect
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem
            onClick={() => setShowConnectionModal(true)}
            className="cursor-pointer"
          >
            <Plus className="mr-2 h-4 w-4" />
            Connect Wallet
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <WalletConnectionModal
        open={showConnectionModal}
        onOpenChange={setShowConnectionModal}
        onSelectOption={handleConnectionOption}
      />

      <FollowAddressModal
        open={showFollowAddressModal}
        onOpenChange={setShowFollowAddressModal}
        onAddressSubmit={handleFollowAddress}
      />
    </>
  )
}
