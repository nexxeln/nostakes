import { inject } from "vitest";

declare module "vitest" {
  export interface ProvidedContext {
    readonly fullScale: boolean;
  }
}

const QUICK_TIMEOUT_MS = 30_000;

const FULL_TIMEOUT_MS = 900_000;

export const fullScale = inject("fullScale");

export const sized = (quick: number, full: number) =>
  fullScale ? full : quick;

export const generated = (quick: number, full: number) => ({
  arbitrary: { runs: sized(quick, full) },
  timeout: fullScale ? FULL_TIMEOUT_MS : QUICK_TIMEOUT_MS,
});
