import { fileURLToPath } from "node:url";

export const testBudget = {
  reporters: [
    "default",
    fileURLToPath(new URL("reporter.ts", import.meta.url)),
  ],
  setupFiles: [fileURLToPath(new URL("setup.ts", import.meta.url))],
};
