import type { Reporter, TestModule } from "vitest/node";

import { SLOWEST_SHOWN, shareText } from "./share.js";

export default class SlowestTests implements Reporter {
  readonly shown = SLOWEST_SHOWN;

  onTestRunEnd(modules: readonly TestModule[]) {
    const spent = modules.flatMap((module) =>
      [...module.children.allTests()].flatMap((test) => {
        const { cpuMs } = test.meta();
        const limitMs = test.options.timeout;

        return cpuMs === undefined || limitMs === undefined
          ? []
          : [
              {
                cpuMs,
                limitMs,
                name: `${module.relativeModuleId} > ${test.name}`,
              },
            ];
      })
    );

    const slowest = spent
      .toSorted(
        (left, right) => right.cpuMs / right.limitMs - left.cpuMs / left.limitMs
      )
      .slice(0, this.shown);

    process.stdout.write(
      [
        "",
        "Tests that used the most of their limit:",
        ...slowest.map((test) => `  ${shareText(test)}  ${test.name}`),
        "",
      ].join("\n")
    );
  }
}
