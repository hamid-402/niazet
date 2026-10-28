import type { NextConfig } from "next";
import path from "node:path";

const outputRoot = process.env.NEXT_OUTPUT_ROOT
  ? path.resolve(process.env.NEXT_OUTPUT_ROOT)
  : path.resolve(__dirname, "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  // Dependencies and build cache live under <repo>/_runtime. Declaring the
  // monorepo root keeps those junction targets inside Turbopack's filesystem
  // boundary while the application itself remains in apps/web.
  turbopack: {
    root: outputRoot,
  },
  outputFileTracingRoot: outputRoot,
};

export default nextConfig;
