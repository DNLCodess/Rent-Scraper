import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "server-only": src("./src/test/empty.ts"),
      "@": src("./src"),
    },
  },
  test: { environment: "node" },
});
