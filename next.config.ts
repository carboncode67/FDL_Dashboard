import type { NextConfig } from "next";

// Cast needed: proxyClientMaxBodySize is valid in Next.js 16 runtime but not yet in the TS types.
const nextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/.prisma/client/**",
      // sharp's native binding is resolved at runtime by platform/libc
      // (same class of problem as the Prisma engine binary above) — Next's
      // static tracer doesn't follow that and drops it from the standalone
      // build otherwise, so sharp silently throws on every call. Every
      // caller happens to catch that (duplicate-detection's phash, the
      // thumbnails route's fallback-to-original-file branch), so this was
      // failing invisibly in production rather than erroring loudly.
      "./node_modules/@img/sharp-linuxmusl-x64/**",
      "./node_modules/@img/sharp-libvips-linuxmusl-x64/**",
    ],
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
