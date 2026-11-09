import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: [
    {
      name: "nostakes-debt",
      specifier: "./oxlint-plugin-debt-ledger.ts",
    },
  ],
  rules: { "nostakes-debt/debt-ledger": "error" },
});
