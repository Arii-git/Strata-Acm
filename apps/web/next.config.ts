import path from "node:path";
import type { NextConfig } from "next";

// Rewrites are resolved when the config is evaluated: live in `next dev`, but baked into
// .next/routes-manifest.json by `next build`. The Docker image therefore sets ENGINE_URL as a build arg.
const ENGINE_URL = process.env.ENGINE_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // no floating Next.js dev badge over the console (it overlapped content and confused reviewers)
  devIndicators: false,
  // allow importing repo-root config/ (e.g. config/district.ts)
  experimental: { externalDir: true },
  // Docker: `next build` emits a self-contained server in .next/standalone (no effect on `next dev`).
  output: "standalone",
  // trace files from the repo root (config/ lives outside apps/web); standalone server lands at
  // .next/standalone/apps/web/server.js
  outputFileTracingRoot: path.join(__dirname, "../.."),
  async rewrites() {
    return [{ source: "/api/engine/:path*", destination: `${ENGINE_URL}/:path*` }];
  },
};

export default nextConfig;
