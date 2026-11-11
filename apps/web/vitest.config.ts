import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "node_modules/.vitest",
  test: {
    css: { include: [/landing\.css/u] },
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
