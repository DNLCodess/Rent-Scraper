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
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
