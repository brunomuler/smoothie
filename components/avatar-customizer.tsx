"use client"

import * as React from "react"
import emojilib from "emojilib"
import { Search, X, Undo2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { WalletAvatar } from "@/components/wallet-avatar"
import { cn } from "@/lib/utils"
import { AVATAR_GRADIENTS, type AvatarCustomization, type GradientId } from "@/hooks/use-wallet-avatar-customization"
import { EMOJI_LIST } from "@/lib/emoji-data"

// Search emojis by keyword using emojilib
function searchEmojis(query: string): string[] {
  if (!query.trim()) return EMOJI_LIST
  const lowerQuery = query.toLowerCase().trim()

  return EMOJI_LIST.filter((emoji) => {
    // Check if emoji itself matches
    if (emoji.includes(lowerQuery)) return true
    // Check keywords from emojilib
    const keywords = emojilib[emoji as keyof typeof emojilib]
    if (keywords) {
      return keywords.some((keyword) => keyword.includes(lowerQuery))
    }
    return false
  })
}

interface AvatarCustomizerProps {
  currentCustomization: AvatarCustomization | null
  onSave: (customization: AvatarCustomization, name?: string) => void
  onClear: () => void
  children: React.ReactNode
  walletName?: string
  onSaveName?: (name: string) => void
  /** When true in uncontrolled mode, focuses name field on open. In controlled mode, use openWithNameFocus */
  focusNameField?: boolean
  /** Controlled open state */
  open?: boolean
  /** Controlled open change handler */
  onOpenChange?: (open: boolean, focusNameField?: boolean) => void
  /** Wallet address for identicon preview when clearing */
  walletAddress?: string
}

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640)
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  return isMobile
}

function EmojiSelector({
  selectedEmoji,
  onSelectEmoji,
}: {
  selectedEmoji: string
  onSelectEmoji: (emoji: string) => void
}) {
  const [searchQuery, setSearchQuery] = React.useState("")
  const filteredEmojis = React.useMemo(
    () => searchEmojis(searchQuery),
    [searchQuery]
  )

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">Emoji</p>
      <div className="relative mb-2">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-7 pl-7 pr-2 text-xs bg-zinc-900 border-zinc-800 focus-visible:ring-1"
        />
      </div>
      <div className="h-40 overflow-y-auto rounded-md bg-zinc-900 p-1.5">
        {filteredEmojis.length > 0 ? (
          <div className="grid grid-cols-6 gap-1">
            {filteredEmojis.map((emoji, index) => (
              <button
                key={`${emoji}-${index}`}
                type="button"
                onClick={() => onSelectEmoji(emoji)}
                className={cn(
                  "h-9 w-9 rounded flex items-center justify-center text-xl hover:bg-zinc-800 transition-colors touch-manipulation",
                  selectedEmoji === emoji && "bg-zinc-700"
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            No emojis found
          </div>
        )}
      </div>
    </div>
  )
}

function AvatarCustomizerContent({
  selectedEmoji,
  setSelectedEmoji,
  selectedGradient,
  setSelectedGradient,
  currentGradient,
  currentCustomization,
  onSave,
  onClear,
  onUndoClear,
  onSaveName,
  walletName,
  editName,
  setEditName,
  nameInputRef,
  walletAddress,
  willClear,
}: {
  selectedEmoji: string
  setSelectedEmoji: (emoji: string) => void
  selectedGradient: GradientId
  setSelectedGradient: (id: GradientId) => void
  currentGradient: typeof AVATAR_GRADIENTS[number]
  currentCustomization: AvatarCustomization | null
  onSave: () => void
  onClear: () => void
  onUndoClear: () => void
  onSaveName?: (name: string) => void
  walletName?: string
  editName: string
  setEditName: (name: string) => void
  nameInputRef: React.RefObject<HTMLInputElement | null>
  walletAddress?: string
  willClear: boolean
}) {
  const hasCustomization = currentCustomization !== null || !willClear

  return (
    <div className="space-y-3 pt-4">
      {/* Preview with clear button */}
      <div className="flex items-center justify-center">
        <div className="relative">
          {willClear && walletAddress ? (
            <WalletAvatar
              address={walletAddress}
              size="lg"
              customization={null}
              className="!h-16 !w-16"
            />
          ) : (
            <div
              className="h-16 w-16 rounded-full flex items-center justify-center text-4xl"
              style={{
                background: `linear-gradient(135deg, ${currentGradient.colors[0]}, ${currentGradient.colors[1]})`,
              }}
            >
              {selectedEmoji}
            </div>
          )}
          {willClear ? (
            <button
              type="button"
              onClick={onUndoClear}
              className="absolute -bottom-0.5 -right-0.5 size-5 rounded-full bg-zinc-900 border border-zinc-800 grid place-items-center text-muted-foreground hover:text-foreground hover:border-zinc-600 transition-colors"
              title="Undo reset"
            >
              <Undo2 className="size-2.5" />
            </button>
          ) : hasCustomization && currentCustomization !== null ? (
            <button
              type="button"
              onClick={onClear}
              className="absolute -bottom-0.5 -right-0.5 size-5 rounded-full bg-zinc-900 border border-zinc-800 grid place-items-center text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
              title="Reset to default"
            >
              <X className="size-2.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Name input */}
      {walletName !== undefined && (
        <div>
          <Input
            ref={nameInputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={(e) => {
              // Sync DOM value to state on blur to catch mobile keyboard edge cases
              // where onChange might not fire (e.g., autocomplete, predictive text)
              if (e.target.value !== editName) {
                setEditName(e.target.value)
              }
            }}
            onKeyDown={(e) => {
              // Stop propagation to prevent parent DropdownMenuItem from closing on space/enter
              e.stopPropagation()
              if (e.key === "Enter") {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
            placeholder="Wallet name"
            className="h-8 px-2 text-sm font-medium text-center bg-zinc-900 border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            maxLength={40}
            enterKeyHint="done"
          />
        </div>
      )}

      {/* Gradient selector */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">Background</p>
        <div className="grid grid-cols-5 gap-1.5">
          {AVATAR_GRADIENTS.map((gradient) => (
            <button
              key={gradient.id}
              type="button"
              onClick={() => setSelectedGradient(gradient.id)}
              className={cn(
                "h-8 w-full rounded-md transition-all touch-manipulation",
                selectedGradient === gradient.id && "ring-2 ring-white ring-offset-1 ring-offset-zinc-950"
              )}
              style={{
                background: `linear-gradient(135deg, ${gradient.colors[0]}, ${gradient.colors[1]})`,
              }}
              title={gradient.name}
            />
          ))}
        </div>
      </div>

      {/* Emoji selector */}
      <EmojiSelector
        selectedEmoji={selectedEmoji}
        onSelectEmoji={setSelectedEmoji}
      />

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant="default"
          className="flex-1 h-8"
          onClick={() => {
            // Try DOM value first, fall back to React state
            const domValue = nameInputRef.current?.value
            const nameValue = domValue ?? editName
            if (onSaveName && nameValue.trim()) {
              onSaveName(nameValue.trim())
            }
            onSave()
          }}
        >
          Save
        </Button>
      </div>
    </div>
  )
}

export function AvatarCustomizer({
  currentCustomization,
  onSave,
  onClear,
  children,
  walletName,
  onSaveName,
  focusNameField = false,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  walletAddress,
}: AvatarCustomizerProps) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen

  const [selectedEmoji, setSelectedEmoji] = React.useState<string>(
    currentCustomization?.emoji || EMOJI_LIST[0]
  )
  const [selectedGradient, setSelectedGradient] = React.useState<GradientId>(
    currentCustomization?.gradientId as GradientId || AVATAR_GRADIENTS[0].id
  )
  const [editName, setEditName] = React.useState(walletName || "")
  const [willClear, setWillClear] = React.useState(false)
  const nameInputRef = React.useRef<HTMLInputElement>(null)
  const shouldFocusName = React.useRef(false)
  const prevOpen = React.useRef(false)
  const isMobile = useIsMobile()

  // Reset selection only when transitioning from closed to open
  React.useEffect(() => {
    if (open && !prevOpen.current) {
      setSelectedEmoji(currentCustomization?.emoji || EMOJI_LIST[0])
      setSelectedGradient(currentCustomization?.gradientId as GradientId || AVATAR_GRADIENTS[0].id)
      setEditName(walletName || "")
      setWillClear(false)
    }
    prevOpen.current = open
  }, [open, currentCustomization, walletName])

  // Focus name input after open if flagged
  React.useEffect(() => {
    if (!open || (!shouldFocusName.current && !focusNameField)) return

    // Try to focus and place cursor at end of text
    const tryFocus = () => {
      if (nameInputRef.current) {
        nameInputRef.current.focus()
        // Place cursor at end instead of selecting all
        const len = nameInputRef.current.value.length
        nameInputRef.current.setSelectionRange(len, len)
        return true
      }
      return false
    }

    // Try immediately
    if (!tryFocus()) {
      // Retry after a short delay for the drawer to render
      const timer = setTimeout(() => {
        tryFocus()
        shouldFocusName.current = false
      }, 50)
      return () => clearTimeout(timer)
    }
    shouldFocusName.current = false
  }, [open, focusNameField])

  const setOpen = (newOpen: boolean, withNameFocus?: boolean) => {
    if (newOpen && (focusNameField || withNameFocus)) {
      shouldFocusName.current = true
    }
    if (isControlled) {
      controlledOnOpenChange?.(newOpen, withNameFocus)
    } else {
      setInternalOpen(newOpen)
    }
  }

  const handleSave = () => {
    if (willClear) {
      onClear()
    } else {
      onSave({ emoji: selectedEmoji, gradientId: selectedGradient })
    }
    // Name saving is now handled directly in AvatarCustomizerContent
    // where editName is definitely current
    setOpen(false)
  }

  const handleClear = () => {
    // Mark for clearing - user still needs to save
    setWillClear(true)
  }

  const handleUndoClear = () => {
    setWillClear(false)
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
  }

  const currentGradient = AVATAR_GRADIENTS.find((g) => g.id === selectedGradient) || AVATAR_GRADIENTS[0]

  const contentProps = {
    selectedEmoji,
    setSelectedEmoji,
    selectedGradient,
    setSelectedGradient,
    currentGradient,
    currentCustomization,
    onSave: handleSave,
    onClear: handleClear,
    onUndoClear: handleUndoClear,
    onSaveName,
    walletName,
    editName,
    setEditName,
    nameInputRef,
    walletAddress,
    willClear,
  }

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange} repositionInputs={false}>
        <DrawerTrigger asChild>{children}</DrawerTrigger>
        <DrawerContent
          className="bg-zinc-950 border-zinc-800 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-h-[80dvh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <AvatarCustomizerContent {...contentProps} />
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-72 p-3 bg-zinc-950 border-zinc-800 z-[100]"
        align="center"
        side="bottom"
        sideOffset={8}
        collisionPadding={16}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
      >
        <AvatarCustomizerContent {...contentProps} />
      </PopoverContent>
    </Popover>
  )
}
