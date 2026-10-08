import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:5000";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Same-origin API → auth cookies stay first-party and are visible to src/proxy.ts
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
      // Socket.IO uses addTrailingSlash:false → "/socket.io?EIO=4…" (Next would 308-redirect "/socket.io/")
      { source: "/socket.io", destination: `${API_ORIGIN}/socket.io` },
      { source: "/socket.io/:path*", destination: `${API_ORIGIN}/socket.io/:path*` },
    ];
  },
  async redirects() {
    return [{ source: "/", destination: "/admin", permanent: false }];
  },
};

export default nextConfig;
