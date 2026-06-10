import type { NextConfig } from "next";

// Cast needed: proxyClientMaxBodySize is valid in Next.js 16 runtime but not yet in the TS types.
const nextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/**": ["./node_modules/.prisma/client/**"],
    "app/api/farms/**": ["./node_modules/better-sqlite3/build/Release/*.node"],
  },
  experimental: {
    // Raise the 10 MB cap Next.js enforces on Route Handler bodies before
    // formData() can read them. Renamed from middlewareClientMaxBodySize in 16.2.
    // Set to 4 GB to handle long audio recordings (500 MB was too low).
    proxyClientMaxBodySize: 4 * 1024 * 1024 * 1024,
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
} as NextConfig;

export default nextConfig;
