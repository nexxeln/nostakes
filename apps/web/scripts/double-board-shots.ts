import * as NodeServices from "@effect/platform-node/NodeServices";
import { Config, Console, Effect, Schema } from "effect";
import { chromium } from "playwright-core";
import type { Browser } from "playwright-core";

import { localWebApp, mutedBrowser } from "./local-site.ts";

const SIZES = [
  { height: 640, width: 360 },
  { height: 844, width: 390 },
  { height: 390, width: 844 },
] as const;

const THEMES = ["light", "dark"] as const;

const SCENES = ["double", "double-split", "double-scoop"] as const;

const SETTLE_MS = 2500;

const AWARD_MS = 1400;

class DoubleBoardShotFailed extends Schema.TaggedError<
  DoubleBoardShotFailed,
  { readonly brand: unique symbol }
>()("DoubleBoardShotFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `The double-board shots failed at "${this.step}": ${this.detail}. Open scripts/layout/stage.html?scene=double at that size to see it.`;
  }
}

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) =>
      new DoubleBoardShotFailed({ detail: String(cause), step }),
    try: run,
  });

const shoot = (
  opened: Browser,
  app: string,
  dir: string,
  shot: {
    readonly scene: (typeof SCENES)[number];
    readonly size: (typeof SIZES)[number];
    readonly theme: (typeof THEMES)[number];
  }
) =>
  Effect.gen(function* shootScene() {
    const { scene, size, theme } = shot;

    const context = yield* attempt("open a phone", () =>
      opened.newContext({
        colorScheme: theme,
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
        viewport: size,
      })
    );

    const page = yield* attempt("open a page", () => context.newPage());

    yield* attempt("open the stage", () =>
      page.goto(
        `${app}/scripts/layout/stage.html?scene=${scene}&players=9&theme=${theme}`
      )
    );
    yield* attempt("wait for the stage", () =>
      page.waitForFunction(
        () => document.documentElement.dataset.staged === "true"
      )
    );
    yield* Effect.sleep(`${scene === "double" ? SETTLE_MS : AWARD_MS} millis`);
    yield* attempt("shoot the table", () =>
      page.screenshot({
        path: `${dir}/${scene}-${size.width}x${size.height}-${theme}.png`,
      })
    );
    yield* attempt("close the page", () => context.close());
  });

const program = Effect.gen(function* shootDoubleBoards() {
  const dir = yield* Config.String("DOUBLE_BOARD_DIR");
  const web = yield* localWebApp;
  const opened = yield* mutedBrowser(chromium);
  let shots = 0;

  for (const scene of SCENES) {
    for (const size of SIZES) {
      for (const theme of THEMES) {
        yield* shoot(opened, web.url, dir, { scene, size, theme });
        shots += 1;
      }
    }
  }

  yield* Console.log(`${shots} double-board tables photographed in ${dir}`);
});

await Effect.runPromise(
  program.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
