import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin the project root. Otherwise Next.js picks up a stray package-lock.json in a parent folder
  // (e.g. the user's home directory) and treats that folder as the workspace root.
  outputFileTracingRoot: process.cwd(),
};
export default nextConfig;
