import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    environment: "node"
  },
  resolve: {
    alias: {
      "@inspection/domain": fileURLToPath(new URL("./packages/domain/src/index.ts", import.meta.url)),
      "@inspection/scheduler": fileURLToPath(new URL("./packages/scheduler/src/index.ts", import.meta.url))
    }
  }
});
