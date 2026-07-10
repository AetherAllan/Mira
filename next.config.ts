import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: false,
  // Keep Railway/Next builds anchored to this project even when a parent folder
  // contains another lockfile.
  turbopack: { root: process.cwd() },
};

export default nextConfig;
