import { defineConfig } from "vitest/config";

const SOAK_HEAP_MB = 8192;

export default defineConfig({
  test: {
    execArgv: [`--max-old-space-size=${SOAK_HEAP_MB}`],
    hookTimeout: 60_000,
    include: ["scripts/**/*.verify.ts"],
    maxWorkers: 1,
    testTimeout: 300_000,
  },
});
