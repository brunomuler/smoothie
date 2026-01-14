"use client"

interface PageTitleProps {
  children: React.ReactNode
  badge?: string
}

// Desktop title is now shown in the fixed header of DashboardLayout
// This component is kept for API compatibility but renders nothing
export function PageTitle({ children, badge }: PageTitleProps) {
  return null
}
