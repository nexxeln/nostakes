export const CPU_SHARE_OF_LIMIT = 1 / 3;

export const SLOWEST_SHOWN = 8;

export interface Spent {
  readonly cpuMs: number;
  readonly limitMs: number;
}

export const overBudget = ({ cpuMs, limitMs }: Spent) =>
  Number.isFinite(limitMs) &&
  limitMs > 0 &&
  cpuMs > limitMs * CPU_SHARE_OF_LIMIT;

export const shareText = ({ cpuMs, limitMs }: Spent) =>
  `${String(Math.round(cpuMs))} ms of CPU, ${String(Math.round((100 * cpuMs) / limitMs))}% of its ${String(limitMs)} ms limit`;
