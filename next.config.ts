import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/**": ["./node_modules/.prisma/client/**"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
  // Route Handler body size is controlled per-route via export const config,
  // not here. The nodejs runtime (used on all upload routes) has no default
  // framework-imposed limit — Node.js HTTP streams the body directly.
};

export default nextConfig;
