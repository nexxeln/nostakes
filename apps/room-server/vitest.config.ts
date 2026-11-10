import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    hookTimeout: 60_000,
    include: ["test/**/*.test.ts"],
    maxWorkers: 1,
    testTimeout: 120_000,
  },
});
