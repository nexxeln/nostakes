import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "node_modules/.vitest",
  test: {
    include: ["scripts/**/*.verify.ts"],
    testTimeout: 900_000,
  },
});
