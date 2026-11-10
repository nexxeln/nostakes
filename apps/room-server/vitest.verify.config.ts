import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    hookTimeout: 60_000,
    include: ["scripts/**/*.verify.ts"],
    maxWorkers: 1,
    testTimeout: 300_000,
  },
});
