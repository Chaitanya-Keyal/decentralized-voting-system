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
  poweredByHeader: false,
  // The pages hold a voting key in the browser: they send no referrer, are not to be framed by
  // another site, and are not reinterpreted as another content type. The content security policy
  // also rules out plugins, a changed base URL and forms posting to other sites. Pages are kept
  // apart from windows other sites open (Google's sign-in pop-up, which this site opens, still
  // works), resources are for this site only, features the app does not use are turned off, and
  // browsers keep to HTTPS.
  headers() {
    return Promise.resolve([
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Content-Security-Policy",
            value: "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
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
