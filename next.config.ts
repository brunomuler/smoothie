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
};

export default nextConfig;
