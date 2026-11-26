import type { MetadataRoute } from "next";

/** Web app manifest so the app installs to the home screen (spec §11). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rental Hunt",
    short_name: "Rental Hunt",
    description: "Find a home to rent from TikTok listings.",
    start_url: "/",
    display: "standalone",
    background_color: "#F2F5F4",
    theme_color: "#0F4F55",
    // Rendered from scripts/icon.svg by scripts/make-icons.mjs. The art sits inside the
    // maskable safe zone, so the same 512px file serves both purposes.
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
