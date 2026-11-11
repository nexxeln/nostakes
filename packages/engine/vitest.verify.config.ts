import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    provide: { fullScale: true },
    testTimeout: 900_000,
  },
});
