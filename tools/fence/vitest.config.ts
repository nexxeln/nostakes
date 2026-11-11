import { defineConfig } from "vitest/config";

import { testBudget } from "./budget/config.ts";

export default defineConfig({
  test: {
    ...testBudget,
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
