"use client"

import { Badge } from "@/components/ui/badge"

interface PageTitleProps {
  children: React.ReactNode
  badge?: string
}

export function PageTitle({ children, badge }: PageTitleProps) {
  return (
    <div className="pt-6 md:pt-8 md:pb-10">
      <h1 className="hidden md:flex text-2xl font-medium items-center gap-2">
        {children}
        {badge && (
          <Badge variant="secondary" className="text-xs font-normal">
            {badge}
          </Badge>
        )}
      </h1>
    </div>
  )
}
