import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    execArgv: ["--expose-gc"],
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
