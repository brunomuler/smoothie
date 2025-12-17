import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#212121",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "https://smoothie.capital"),
  title: "Smoothie – Track Your Stellar Blend DeFi Positions",
  description: "Track your Stellar Blend DeFi positions, monitor your yields, and stay on top of your lending and borrowing portfolio.",
  keywords: ["Stellar", "Blend", "DeFi", "yield", "lending", "borrowing", "crypto", "wallet", "BLND"],
  authors: [{ name: "Smoothie" }],
  openGraph: {
    title: "Smoothie – Track Your Stellar Blend DeFi Positions",
    description: "Track your Stellar Blend DeFi positions, monitor your yields, and stay on top of your lending and borrowing portfolio.",
    type: "website",
    siteName: "Smoothie",
    images: [
      {
        url: "/share.png",
        width: 1200,
        height: 630,
        alt: "Smoothie - Your Blend positions, smoothly tracked",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Smoothie – Track Your Stellar Blend DeFi Positions",
    description: "Track your Stellar Blend DeFi positions, monitor your yields, and stay on top of your lending and borrowing portfolio.",
    images: ["/share.png"],
  },
  icons: {
    icon: [
      { url: "/favicon/favicon.ico" },
      { url: "/favicon/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/favicon/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
