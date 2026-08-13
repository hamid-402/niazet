import type { NextConfig } from "next";
import path from "node:path";

const monorepoRoot = path.resolve(__dirname, "../..");

const nextConfig: NextConfig = {
  // Dependencies and build cache live under <repo>/_runtime. Declaring the
  // monorepo root keeps those junction targets inside Turbopack's filesystem
  // boundary while the application itself remains in apps/web.
  turbopack: {
    root: monorepoRoot,
  },
  outputFileTracingRoot: monorepoRoot,
};

export default nextConfig;
