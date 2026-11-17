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
  // The pages hold a voting key in the browser: they send no referrer, are not to be framed by
  // another site, and are not reinterpreted as another content type.
  headers() {
    return Promise.resolve([
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        // Browsers check for a new service worker on every visit, so a deploy reaches them at once.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ]);
  },
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
