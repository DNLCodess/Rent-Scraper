import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Old pages folded into Searches. Temporary (307) so the paths stay free for later use.
  redirects() {
    return [
      { source: "/runs/:id", destination: "/searches/runs/:id", permanent: false },
      { source: "/history", destination: "/searches", permanent: false },
      { source: "/settings", destination: "/searches", permanent: false },
    ];
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
