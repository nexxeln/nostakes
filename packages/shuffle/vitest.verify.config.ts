import { defineConfig } from "vitest/config";

import { testBudget } from "../../tools/fence/budget/config.ts";

export default defineConfig({
  test: {
    ...testBudget,
    include: ["test/**/*.test.ts"],
    provide: { fullScale: true },
    testTimeout: 900_000,
  },
});
