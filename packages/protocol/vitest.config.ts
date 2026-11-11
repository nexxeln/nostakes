import { defineConfig } from "vitest/config";

import { testBudget } from "../../tools/fence/budget/config.ts";

export default defineConfig({
  test: {
    ...testBudget,
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
