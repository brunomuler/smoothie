import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "id.lobstr.co",
        pathname: "/*.png",
      },
    ],
  },
  // Exclude Node.js-only packages from client-side bundling (WalletConnect dependencies)
  serverExternalPackages: [
    "pino",
    "thread-stream",
    "pino-pretty",
  ],
  turbopack: {
    resolveAlias: {
      // Stub out Node.js-only modules for client-side builds
      "pino": { browser: "./node_modules/pino/browser.js" },
    },
  },
};

export default nextConfig;
