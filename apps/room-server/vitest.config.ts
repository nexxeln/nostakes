import { availableParallelism } from "node:os";

import { defineConfig } from "vitest/config";

const MOST_WORKERS = 4;

export default defineConfig({
  test: {
    hookTimeout: 60_000,
    include: ["test/**/*.test.ts"],
    maxWorkers: Math.max(1, Math.min(MOST_WORKERS, availableParallelism() - 1)),
    testTimeout: 120_000,
  },
});
