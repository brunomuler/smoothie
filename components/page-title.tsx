"use client"

interface PageTitleProps {
  children: React.ReactNode
  badge?: string
}

// Desktop title is now shown in the fixed header of DashboardLayout
// This component provides mobile top padding for non-home pages
export function PageTitle({ children, badge }: PageTitleProps) {
  return (
    <div className="pt-6 md:pt-0">
      {/* Mobile spacing only - desktop title shown in fixed header */}
    </div>
  )
}
