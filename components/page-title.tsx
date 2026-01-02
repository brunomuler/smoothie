"use client"

interface PageTitleProps {
  children: React.ReactNode
}

export function PageTitle({ children }: PageTitleProps) {
  return (
    <div className="pt-4 pb-6">
      <h1 className="text-2xl font-medium">{children}</h1>
    </div>
  )
}
