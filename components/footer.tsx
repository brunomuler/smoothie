"use client"

import Link from "next/link"

interface FooterProps {
  variant?: "default" | "landing"
}

export function Footer({ variant = "default" }: FooterProps) {
  const isLanding = variant === "landing"

  return (
    <footer
      className={`pt-6 pb-4 ${
        isLanding ? "text-white/60" : "text-muted-foreground"
      }`}
    >
      <div className="container max-w-3xl mx-auto px-4">
        <div className="flex items-center justify-between gap-2 text-xs">
          <p className={isLanding ? "text-white/40" : "text-muted-foreground/60"}>
            Smoothie {new Date().getFullYear()}
          </p>
          <div className="flex items-center gap-4">
            <Link
              href="/privacy"
              className={`hover:underline ${
                isLanding ? "text-white/40 hover:text-white/60" : "text-muted-foreground/60 hover:text-muted-foreground"
              }`}
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className={`hover:underline ${
                isLanding ? "text-white/40 hover:text-white/60" : "text-muted-foreground/60 hover:text-muted-foreground"
              }`}
            >
              Terms
            </Link>
            <a
              href="https://github.com/brunomuler/smoothie"
              target="_blank"
              rel="noopener noreferrer"
              className={`hover:underline ${
                isLanding ? "text-white/40 hover:text-white/60" : "text-muted-foreground/60 hover:text-muted-foreground"
              }`}
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
