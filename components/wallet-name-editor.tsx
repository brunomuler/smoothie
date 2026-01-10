"use client"

import * as React from "react"
import { Pencil, Check, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface WalletNameEditorProps {
  name: string
  isEditable: boolean
  onSave: (name: string) => void
  onEditingChange?: (isEditing: boolean) => void
  className?: string
}

export function WalletNameEditor({
  name,
  isEditable,
  onSave,
  onEditingChange,
  className,
}: WalletNameEditorProps) {
  const [isEditing, setIsEditingState] = React.useState(false)

  const setIsEditing = React.useCallback((value: boolean) => {
    setIsEditingState(value)
    onEditingChange?.(value)
  }, [onEditingChange])
  const [editValue, setEditValue] = React.useState(name)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Update edit value when name changes externally
  React.useEffect(() => {
    if (!isEditing) {
      setEditValue(name)
    }
  }, [name, isEditing])

  // Focus input when entering edit mode
  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setEditValue(name)
    setIsEditing(true)
  }

  const handleSave = () => {
    onSave(editValue)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditValue(name)
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleSave()
    } else if (e.key === "Escape") {
      e.preventDefault()
      handleCancel()
    }
  }

  return (
    <div
      className={cn("flex items-center gap-1", className)}
      onClick={(e) => isEditing && e.stopPropagation()}
    >
      {/* Display mode */}
      <div
        className={cn(
          "flex items-center gap-1 transition-all duration-150",
          isEditing ? "opacity-0 scale-95 absolute pointer-events-none" : "opacity-100 scale-100"
        )}
      >
        <span className="font-medium text-sm truncate">{name}</span>
        {isEditable && (
          <button
            type="button"
            onClick={handleStartEdit}
            className="p-1.5 rounded hover:bg-zinc-700 text-muted-foreground hover:text-foreground"
            title="Edit wallet name"
          >
            <Pencil className="size-2.5" />
          </button>
        )}
      </div>

      {/* Edit mode */}
      <div
        className={cn(
          "flex items-center gap-1.5 transition-all duration-150",
          isEditing ? "opacity-100 scale-100" : "opacity-0 scale-95 absolute pointer-events-none"
        )}
      >
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={(e) => {
            if (!e.relatedTarget?.closest("[data-wallet-name-editor-button]")) {
              e.target.focus()
            }
          }}
          className="h-6 px-1.5 py-0 text-sm font-medium flex-1 min-w-0 bg-zinc-950 border-0 rounded-sm focus-visible:ring-0 focus-visible:ring-offset-0"
          maxLength={40}
        />
        <div className="flex items-center">
          <button
            type="button"
            data-wallet-name-editor-button
            onClick={(e) => {
              e.stopPropagation()
              handleSave()
            }}
            className="p-0.5 rounded hover:bg-zinc-700 text-green-500"
          >
            <Check className="size-3.5" />
          </button>
          <button
            type="button"
            data-wallet-name-editor-button
            onClick={(e) => {
              e.stopPropagation()
              handleCancel()
            }}
            className="p-0.5 rounded hover:bg-zinc-700 text-red-500"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
