import type { MetadataRoute } from "next";

import { description } from "./site";

/** Makes DVote installable: added to a phone's home screen, it opens in its own window. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "DVote",
    short_name: "DVote",
    description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
