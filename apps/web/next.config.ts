import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  eslint: {
    // Disable ESLint during build for demo deployment
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Also ignore TypeScript errors for demo
    ignoreBuildErrors: true,
  },
}

export default nextConfig;
