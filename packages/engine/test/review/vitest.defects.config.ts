import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/review/**/*.defect.ts"],
    root: `${import.meta.dirname}/../..`,
    testTimeout: 30_000,
  },
});
