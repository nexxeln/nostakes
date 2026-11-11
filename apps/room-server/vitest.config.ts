import { availableParallelism } from "node:os";

import { defineConfig } from "vitest/config";

import { testBudget } from "../../tools/fence/budget/config.ts";

const MOST_WORKERS = 4;

export default defineConfig({
  test: {
    ...testBudget,
    hookTimeout: 60_000,
    include: ["test/**/*.test.ts"],
    maxWorkers: Math.max(1, Math.min(MOST_WORKERS, availableParallelism() - 1)),
    testTimeout: 120_000,
  },
});
