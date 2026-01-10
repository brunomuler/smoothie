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
  viewportFit: "cover",
  maximumScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "https://smoothie.capital"),
  title: {
    default: "Smoothie – Track Your Stellar Blend DeFi Positions",
    template: "%s | Smoothie",
  },
  description: "Track your Stellar Blend DeFi positions, monitor your yields, and stay on top of your lending and borrowing portfolio. Real-time analytics for BLND emissions, supply APY, and backstop rewards.",
  keywords: [
    "Stellar",
    "Blend Protocol",
    "DeFi",
    "yield tracking",
    "lending",
    "borrowing",
    "crypto",
    "BLND",
    "BLND token",
    "Stellar DeFi",
    "yield farming",
    "backstop",
    "liquidity pool",
    "APY",
    "portfolio tracker",
    "XLM",
    "USDC",
  ],
  authors: [{ name: "Smoothie" }],
  creator: "Smoothie",
  publisher: "Smoothie",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "/",
  },
  category: "finance",
  openGraph: {
    title: "Smoothie – Track Your Stellar Blend DeFi Positions",
    description: "Track your Stellar Blend DeFi positions, monitor your yields, and stay on top of your lending and borrowing portfolio. Real-time analytics for BLND emissions and backstop rewards.",
    type: "website",
    siteName: "Smoothie",
    locale: "en_US",
    url: "/",
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
    description: "Track your Stellar Blend DeFi positions, monitor yields, and maximize your BLND rewards on Stellar.",
    images: ["/share.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon/favicon-16x16.png", sizes: "16x16", type: "image/png" },
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
