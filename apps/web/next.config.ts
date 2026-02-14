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
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'replicate.delivery',
        pathname: '/**',
      },
    ],
  },
}

export default nextConfig;
