import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    provide: { fullScale: false },
    testTimeout: 30_000,
  },
});
