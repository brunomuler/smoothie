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
  title: "Blend Explorer",
  description: "Explore aggregate analytics and find accounts on Blend Protocol",
  keywords: ["Stellar", "Blend", "DeFi", "analytics", "explorer", "lending", "borrowing"],
  authors: [{ name: "Smoothie" }],
  openGraph: {
    title: "Blend Explorer",
    description: "Explore aggregate analytics and find accounts on Blend Protocol",
    type: "website",
    siteName: "Blend Explorer",
  },
  twitter: {
    card: "summary_large_image",
    title: "Blend Explorer",
    description: "Explore aggregate analytics and find accounts on Blend Protocol",
  },
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
