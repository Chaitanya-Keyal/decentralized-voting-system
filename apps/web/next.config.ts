import type { NextConfig } from "next";

// `pnpm dev` turns off Node's experimental Web Storage. From Node 25 the server has a
// `localStorage` global that is unusable without a file, and with it Next.js cannot render the
// pages under the wallet providers when it validates them in development.

const nextConfig: NextConfig = {
  // Don't generate AGENTS.md.
  agentRules: false,
  cacheComponents: true,
  // The shared package is TypeScript source, compiled as part of the app.
  transpilePackages: ["@dvote/shared"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
