import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1"],
  // Type checking is run explicitly through `npm run typecheck`. Keeping it
  // separate avoids a Next 16 CLI parsing issue while preserving strict checks.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
