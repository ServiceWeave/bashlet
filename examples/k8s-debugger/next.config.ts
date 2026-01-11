import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@bashlet/sdk"],
  },
};

export default nextConfig;
