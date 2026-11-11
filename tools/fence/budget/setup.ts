import { afterEach, beforeEach } from "vitest";

import { CPU_SHARE_OF_LIMIT, overBudget, shareText } from "./share.js";

declare module "vitest" {
  interface TaskMeta {
    cpuMs?: number;
  }
}

const started = new WeakMap<object, NodeJS.CpuUsage>();

beforeEach(({ task }) => {
  started.set(task, process.cpuUsage());
});

afterEach(({ task }) => {
  const start = started.get(task);

  if (start === undefined) {
    return;
  }

  const used = process.cpuUsage(start);

  const spent = {
    cpuMs: (used.user + used.system) / 1000,
    limitMs: task.timeout,
  };

  task.meta.cpuMs = spent.cpuMs;

  if (overBudget(spent)) {
    throw new Error(
      `This test used ${shareText(spent)}, past the ${String(Math.round(CPU_SHARE_OF_LIMIT * 100))}% a test may spend, so a slow runner would time it out. Make it cheaper: fewer runs where the input space allows, a fixture built once, or the full size in verify through test/scale.ts. Do not raise the limit.`
    );
  }
});
