"use client"

import * as React from "react"
import { Wallet, Check, Plus, LogOut, Copy, ChevronDown, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { WalletConnectionModal } from "@/components/wallet-connection-modal"
import { FollowAddressModal } from "@/components/follow-address-modal"
import { WalletAvatar } from "@/components/wallet-avatar"
import { useStellarWalletKit, type SupportedWallet } from "@/hooks/use-stellar-wallet-kit"
import { usePostHog } from "@/hooks/use-posthog"
import type { Wallet as WalletType } from "@/types/wallet"
import { cn } from "@/lib/utils"
import { shortenAddress } from "@/lib/wallet-utils"

interface WalletSelectorProps {
  wallets: WalletType[]
  activeWallet: WalletType | null
  onSelectWallet: (walletId: string) => void
  onConnectWallet: (address: string, walletName?: string) => void
  onFollowAddress?: (address: string) => void
  onDisconnect?: (walletId: string) => void
  variant?: "default" | "landing"
}

export function WalletSelector({
  wallets,
  activeWallet,
  onSelectWallet,
  onConnectWallet,
  onFollowAddress,
  onDisconnect,
  variant = "default",
}: WalletSelectorProps) {
  const [showConnectionModal, setShowConnectionModal] = React.useState(false)
  const [showFollowAddressModal, setShowFollowAddressModal] = React.useState(false)
  const [copiedAddress, setCopiedAddress] = React.useState<string | null>(null)
  const [isOpen, setIsOpen] = React.useState(false)
  const [supportedWallets, setSupportedWallets] = React.useState<SupportedWallet[]>([])
  const [isLoadingWallets, setIsLoadingWallets] = React.useState(false)
  const { disconnect: disconnectWallet, getSupportedWallets, connectWallet } = useStellarWalletKit()
  const { capture } = usePostHog()

  // Fetch wallets when modal opens
  React.useEffect(() => {
    if (showConnectionModal) {
      capture('wallet_modal_opened')
      setIsLoadingWallets(true)
      getSupportedWallets()
        .then(setSupportedWallets)
        .catch((error) => console.error("Failed to get supported wallets:", error))
        .finally(() => setIsLoadingWallets(false))
    }
  }, [showConnectionModal, getSupportedWallets, capture])

  const handleFollowAddressOption = () => {
    setShowConnectionModal(false)
    setShowFollowAddressModal(true)
  }

  const handleWalletSelect = async (wallet: SupportedWallet) => {
    try {
      const address = await connectWallet(wallet.id)
      // Skip if address already exists
      if (isAddressAlreadyAdded(address)) {
        setShowConnectionModal(false)
        return
      }

      capture('wallet_connected', {
        wallet_type: wallet.id,
        method: 'extension',
        address
      })

      onConnectWallet(address, wallet.name)
      setShowConnectionModal(false)
    } catch (error) {
      capture('wallet_connect_failed', {
        wallet_type: wallet.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      console.error("Failed to connect wallet:", error)
    }
  }

  const handleFollowAddress = (address: string) => {
    // Skip if address already exists
    if (isAddressAlreadyAdded(address)) {
      setShowFollowAddressModal(false)
      return
    }

    const addressType = address.startsWith('C') ? 'contract' : 'public_key'
    capture('address_followed', {
      address,
      address_type: addressType
    })

    if (onFollowAddress) {
      onFollowAddress(address)
    } else {
      const walletName = `Watch ${shortenAddress(address)}`
      onConnectWallet(address, walletName)
    }
    setShowFollowAddressModal(false)
  }

  const handleCopyAddress = async (e: React.MouseEvent, address: string) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(address)
      capture('address_copied', { address })
      setCopiedAddress(address)
      setTimeout(() => setCopiedAddress(null), 2000)
    } catch (error) {
      console.error("Failed to copy address:", error)
    }
  }

  const handleDisconnect = async (e: React.MouseEvent, wallet: WalletType) => {
    e.stopPropagation()
    try {
      await disconnectWallet()
      capture('wallet_disconnected', { address: wallet.publicKey })
      if (onDisconnect) {
        onDisconnect(wallet.id)
      }
      setIsOpen(false)
    } catch (error) {
      console.error("Failed to disconnect:", error)
    }
  }

  const isWatched = (wallet: WalletType) =>
    wallet.name?.toLowerCase().includes('watch')

  const isAddressAlreadyAdded = (address: string) =>
    wallets.some((w) => w.publicKey.toLowerCase() === address.toLowerCase())

  // Landing variant: render a button that directly opens the connection modal
  if (variant === "landing" && !activeWallet) {
    return (
      <>
        <Button
          variant="default"
          size="lg"
          className="gap-2 h-12 px-8 text-base font-semibold bg-black text-white shadow-lg border border-white/20 cursor-pointer transition-all duration-200 hover:bg-zinc-900 hover:border-white/40 hover:scale-[1.02]"
          onClick={() => setShowConnectionModal(true)}
        >
          Connect Wallet
          <ChevronDown className="h-5 w-5 -rotate-90" />
        </Button>

        <WalletConnectionModal
          open={showConnectionModal}
          onOpenChange={setShowConnectionModal}
          onFollowAddress={handleFollowAddressOption}
          onWalletSelect={handleWalletSelect}
          wallets={supportedWallets}
          isLoadingWallets={isLoadingWallets}
        />

        <FollowAddressModal
          open={showFollowAddressModal}
          onOpenChange={setShowFollowAddressModal}
          onAddressSubmit={handleFollowAddress}
        />
      </>
    )
  }

  return (
    <>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          {activeWallet ? (
            <Button
              variant="outline"
              className={cn(
                "gap-2 pl-1.5 pr-2.5 h-10 min-w-[140px]",
                "bg-black border-black hover:bg-black/90 hover:border-black/90",
                "transition-all duration-200",
                "hover:shadow-sm"
              )}
            >
              <WalletAvatar
                address={activeWallet.publicKey}
                name={activeWallet.name}
                size="sm"
              />
              <span className="font-medium text-sm truncate max-w-[100px]">
                {shortenAddress(activeWallet.publicKey)}
              </span>
              <ChevronDown className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                isOpen && "rotate-180"
              )} />
            </Button>
          ) : (
            <Button
              variant="default"
              className="gap-2 h-10"
            >
              <Wallet className="h-4 w-4" />
              <span className="hidden sm:inline">Connect Wallet</span>
              <span className="sm:hidden">Connect</span>
            </Button>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          className="w-72 p-2 bg-zinc-950 border-zinc-800"
          sideOffset={8}
        >
          {wallets.length > 0 && (
            <>
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground px-2 py-1.5">
                Your Wallets
              </DropdownMenuLabel>

              <div className="space-y-1">
                {wallets.map((wallet) => {
                  const isActive = wallet.isActive
                  const watched = isWatched(wallet)

                  return (
                    <div
                      key={wallet.id}
                      className={cn(
                        "rounded-lg transition-all duration-150",
                        isActive && "bg-zinc-800/50"
                      )}
                    >
                      <DropdownMenuItem
                        onClick={() => {
                          if (!isActive && activeWallet) {
                            capture('wallet_switched', {
                              from_address: activeWallet.publicKey,
                              to_address: wallet.publicKey
                            })
                          }
                          onSelectWallet(wallet.id)
                          setIsOpen(false)
                        }}
                        className={cn(
                          "flex items-center gap-3 p-2 cursor-pointer rounded-lg",
                          "focus:bg-zinc-800/80",
                          !isActive && "hover:bg-zinc-800/30"
                        )}
                      >
                        <div className="relative">
                          <WalletAvatar
                            address={wallet.publicKey}
                            name={wallet.name}
                            size="lg"
                          />
                          {watched && (
                            <div className="absolute -bottom-0.5 -right-0.5 bg-background rounded-full p-0.5">
                              <Eye className="h-3 w-3 text-muted-foreground" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          {wallet.name && (
                            <p className="font-medium text-sm truncate">
                              {wallet.name}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground font-mono truncate">
                            {shortenAddress(wallet.publicKey, 6)}
                          </p>
                        </div>

                        {isActive && (
                          <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                            <Check className="h-3 w-3 text-primary-foreground" />
                          </div>
                        )}
                      </DropdownMenuItem>

                      {isActive && (
                        <div className="flex items-center gap-1 px-2 pb-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              "h-7 px-2.5 text-xs flex-1",
                              "hover:bg-background/80",
                              copiedAddress === wallet.publicKey && "text-green-600"
                            )}
                            onClick={(e) => handleCopyAddress(e, wallet.publicKey)}
                          >
                            {copiedAddress === wallet.publicKey ? (
                              <>
                                <Check className="h-3 w-3 mr-1.5" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3 mr-1.5" />
                                Copy Address
                              </>
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => handleDisconnect(e, wallet)}
                          >
                            <LogOut className="h-3 w-3 mr-1.5" />
                            Disconnect
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <DropdownMenuSeparator className="my-2" />
            </>
          )}

          <DropdownMenuItem
            onClick={() => {
              setShowConnectionModal(true)
              setIsOpen(false)
            }}
            className={cn(
              "flex items-center gap-3 p-2.5 cursor-pointer rounded-lg",
              "bg-zinc-800/50 hover:bg-zinc-800/80",
              "text-foreground font-medium",
              "transition-colors duration-150"
            )}
          >
            <div className="h-8 w-8 rounded-full bg-zinc-700/50 flex items-center justify-center">
              <Plus className="h-4 w-4 text-muted-foreground" />
            </div>
            <span>Add Wallet</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <WalletConnectionModal
        open={showConnectionModal}
        onOpenChange={setShowConnectionModal}
        onFollowAddress={handleFollowAddressOption}
        onWalletSelect={handleWalletSelect}
        wallets={supportedWallets}
        isLoadingWallets={isLoadingWallets}
      />

      <FollowAddressModal
        open={showFollowAddressModal}
        onOpenChange={setShowFollowAddressModal}
        onAddressSubmit={handleFollowAddress}
      />
    </>
  )
}
