import type { NextConfig } from "next";

const ENGINE_URL = process.env.ENGINE_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // no floating Next.js dev badge over the console (it overlapped content and confused reviewers)
  devIndicators: false,
  // allow importing repo-root config/ (e.g. config/district.ts)
  experimental: { externalDir: true },
  async rewrites() {
    return [{ source: "/api/engine/:path*", destination: `${ENGINE_URL}/:path*` }];
  },
};

export default nextConfig;
