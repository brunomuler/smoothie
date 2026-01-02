"use client"

import { Info } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface InfoLabelProps {
  label: string
  tooltip: string
  className?: string
}

/**
 * Label with an info icon that shows a tooltip on hover.
 * Must be wrapped in a TooltipProvider.
 */
export function InfoLabel({ label, tooltip, className = "" }: InfoLabelProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center gap-1 cursor-help ${className}`}>
          {label}
          <Info className="h-3 w-3 text-muted-foreground/60" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] text-xs">
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  )
}
