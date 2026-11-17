import * as NodeServices from "@effect/platform-node/NodeServices";
import { Config, Console, Effect, Schema } from "effect";
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";

import { localWebApp, mutedBrowser } from "./local-site.ts";

const SIZES = [
  { height: 640, width: 360 },
  { height: 844, width: 390 },
  { height: 390, width: 844 },
] as const;

const THEMES = ["light", "dark"] as const;

const HOLDEM = 2;

const TARGET_PX = 44;

const SETTLE_MS = 700;

const MID_DEAL_MS = 260;

type Size = (typeof SIZES)[number];

type Theme = (typeof THEMES)[number];

class HandShotFailed extends Schema.TaggedError<
  HandShotFailed,
  { readonly brand: unique symbol }
>()("HandShotFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `Your cards failed at "${this.step}": ${this.detail}. Open scripts/layout/stage.html with the same scene, size, and hole to see it.`;
  }
}

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new HandShotFailed({ detail: String(cause), step }),
    try: run,
  });

const staged = (
  opened: Browser,
  app: string,
  size: Size,
  theme: Theme,
  scene: string
) =>
  attempt("open a phone", () =>
    opened.newContext({
      colorScheme: theme,
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
      viewport: size,
    })
  ).pipe(
    Effect.flatMap((context) =>
      attempt("open a page", () => context.newPage())
    ),
    Effect.tap((page) =>
      attempt("open the stage", () =>
        page.goto(`${app}/scripts/layout/stage.html?${scene}&theme=${theme}`)
      )
    ),
    Effect.tap((page) =>
      attempt("wait for the stage", () =>
        page.waitForFunction(
          () => document.documentElement.dataset.staged === "true"
        )
      )
    )
  );

const measured = (page: Page) =>
  attempt("measure your cards", () =>
    page.evaluate(() => {
      const root = document.querySelector("nostakes-table")?.shadowRoot;
      const holders = [...(root?.querySelectorAll(".hand .hc") ?? [])];
      const face = root?.querySelector(".self .frame")?.getBoundingClientRect();
      const chip = root?.querySelector(".chipctl")?.getBoundingClientRect();
      const boxes = holders.map((holder) => holder.getBoundingClientRect());

      const strips = holders.map((holder, index) => {
        const box = boxes[index];

        if (root === undefined || root === null || box === undefined) {
          return 0;
        }

        const y = box.top + box.height / 2;
        let widest = 0;
        let run = 0;

        for (let x = Math.floor(box.left); x <= Math.ceil(box.right); x += 1) {
          const hit = root.elementFromPoint(x, y)?.closest(".hc");

          run = hit === holder ? run + 1 : 0;
          widest = Math.max(widest, run);
        }

        return widest;
      });

      const crossing = (other: DOMRect | undefined) =>
        other !== undefined &&
        boxes.some(
          (box) =>
            Math.min(box.right, other.right) - Math.max(box.left, other.left) >
              1 &&
            Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) >
              1
        );

      return {
        cards: holders.length,
        coversTheChip: crossing(chip),
        coversYourFace: crossing(face),
        offScreen: boxes.some(
          (box) => box.left < 0 || box.right > globalThis.innerWidth
        ),
        strips,
      };
    })
  );

const checked = (where: string, page: Page, hole: number, tall: boolean) =>
  measured(page).pipe(
    Effect.flatMap((found) => {
      const narrow = found.strips.filter((strip) => strip < TARGET_PX);

      const problems = [
        ...(found.cards === hole ? [] : [`draws ${found.cards} cards`]),
        ...(found.coversYourFace ? ["covers your face"] : []),
        ...(found.coversTheChip ? ["covers the chip"] : []),
        ...(found.offScreen ? ["runs off the table"] : []),
        ...(hole > HOLDEM && tall && narrow.length > 0
          ? [`has a card that takes a tap only ${Math.min(...narrow)} px wide`]
          : []),
      ];

      return problems.length === 0
        ? Effect.succeed(found)
        : Effect.fail(
            new HandShotFailed({ detail: problems.join(", "), step: where })
          );
    })
  );

const shot = (page: Page, dir: string, name: string) =>
  attempt(`save ${name}`, () =>
    page.screenshot({ path: `${dir}/${name}.png` })
  );

const closed = (page: Page) =>
  attempt("close the phone", () => page.context().close());

const program = Effect.gen(function* shootHands() {
  const dir = yield* Config.String("HAND_DIR");
  const hole = yield* Config.Int("HAND_HOLE").pipe(Config.withDefault(4));
  const web = yield* localWebApp;
  const opened = yield* mutedBrowser(chromium);
  let shots = 0;

  const scenes = [
    ["resting", `scene=turn&players=6&hole=${hole}`],
    ["after-the-hand", `scene=after&players=6&hole=${hole}`],
    ["showdown", `players=9&boards=1&hole=${hole}`],
    ["nine-seats", `scene=hand&step=4&players=9&bets=2400&hole=${hole}`],
  ] as const;

  for (const size of SIZES) {
    const tall = size.height > size.width;

    for (const theme of THEMES) {
      const label = `${size.width}x${size.height}-${theme}`;

      for (const [name, scene] of scenes) {
        const page = yield* staged(opened, web.url, size, theme, scene);

        yield* Effect.sleep(`${SETTLE_MS} millis`);
        yield* checked(`${name} ${label}`, page, hole, tall);
        yield* shot(page, dir, `hole-${hole}-${name}-${label}`);
        shots += 1;

        if (name === "resting") {
          const hand = page.locator("nostakes-table .hand");

          const box = yield* attempt("find your cards", () =>
            hand.boundingBox()
          );

          if (box !== null) {
            yield* attempt("reach your cards", () =>
              page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
            );
            yield* attempt("hold your cards", () => page.mouse.down());
            yield* Effect.sleep(`${SETTLE_MS} millis`);
            yield* shot(page, dir, `hole-${hole}-peeking-${label}`);
            yield* attempt("let go", () => page.mouse.up());
            shots += 1;
          }
        }

        yield* closed(page);
      }

      const dealing = yield* staged(
        opened,
        web.url,
        size,
        theme,
        `scene=hand&step=0&players=6&hole=${hole}`
      );

      yield* Effect.sleep(`${MID_DEAL_MS} millis`);
      yield* shot(dealing, dir, `hole-${hole}-dealing-${label}`);
      yield* closed(dealing);

      const holdem = yield* staged(
        opened,
        web.url,
        size,
        theme,
        `scene=turn&players=6&hole=${HOLDEM}`
      );

      yield* Effect.sleep(`${SETTLE_MS} millis`);
      yield* checked(`hold'em ${label}`, holdem, HOLDEM, tall);
      yield* shot(holdem, dir, `hole-${HOLDEM}-resting-${label}`);
      yield* closed(holdem);
      shots += 2;
    }
  }

  yield* Console.log(`saved ${shots} pictures of your cards to ${dir}`);
});

await Effect.runPromise(
  program.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
