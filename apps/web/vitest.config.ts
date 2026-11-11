import { defineConfig } from "vitest/config";

import { testBudget } from "../../tools/fence/budget/config.ts";

export default defineConfig({
  cacheDir: "node_modules/.vitest",
  test: {
    ...testBudget,
    css: { include: [/landing\.css/u] },
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
