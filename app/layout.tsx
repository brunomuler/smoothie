import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Smoothie",
  description: "Your Blend positions, smoothly tracked",
  keywords: ["Stellar", "Blend", "DeFi", "yield", "lending", "borrowing", "crypto", "wallet", "BLND"],
  authors: [{ name: "Smoothie" }],
  openGraph: {
    title: "Smoothie",
    description: "Your Blend positions, smoothly tracked",
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
    title: "Smoothie",
    description: "Your Blend positions, smoothly tracked",
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
