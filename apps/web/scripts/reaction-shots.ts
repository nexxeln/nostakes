import * as NodeServices from "@effect/platform-node/NodeServices";
import { Config, Console, Effect, Schema } from "effect";
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";

import { localWebApp, mutedBrowser } from "./local-site.ts";

const SIZES = [
  { height: 640, width: 360 },
  { height: 844, width: 390 },
  { height: 390, width: 844 },
  { height: 320, width: 740 },
] as const;

const THEMES = ["light", "dark"] as const;

const SEATINGS = [6, 9] as const;

const TARGET_PX = 44;

const SETTLE_MS = 250;

class ReactionShotFailed extends Schema.TaggedError<
  ReactionShotFailed,
  { readonly brand: unique symbol }
>()("ReactionShotFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `The reaction sheet failed at "${this.step}": ${this.detail}. Open scripts/layout/stage.html at that size and tap the same face to see it.`;
  }
}

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new ReactionShotFailed({ detail: String(cause), step }),
    try: run,
  });

const measure = (page: Page) =>
  attempt("measure the sheet", () =>
    page.evaluate(() => {
      const table = document.querySelector("nostakes-table");
      const root = table?.shadowRoot;
      const sheet = root?.querySelector(".reactions");
      const host = table?.getBoundingClientRect();

      if (
        root === null ||
        root === undefined ||
        sheet === null ||
        sheet === undefined ||
        host === undefined
      ) {
        return null;
      }

      const choices = [
        ...root.querySelectorAll(".reaction-choice:not(.gone)"),
      ].map((choice) => choice.getBoundingClientRect());

      const box = sheet.getBoundingClientRect();

      const crossing = (other: DOMRect) =>
        other.width > 0 &&
        Math.min(box.right, other.right) - Math.max(box.left, other.left) > 0 &&
        Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) > 0;

      const covers = [
        ["your cards", ".hand:not(.gone)"],
        ["the chip", ".chipctl:not(.gone)"],
      ].flatMap(([what, selector]) => {
        const node = root.querySelector(selector ?? "");

        return node !== null && crossing(node.getBoundingClientRect())
          ? [what ?? ""]
          : [];
      });

      return {
        covers,
        offScreen:
          box.left < host.left ||
          box.top < host.top ||
          box.right > host.right ||
          box.bottom > host.bottom,
        sheet: { h: box.height, w: box.width, x: box.left, y: box.top },
        smallest: Math.min(
          ...choices.map((choice) => Math.min(choice.width, choice.height))
        ),
      };
    })
  );

const checked = (where: string, page: Page, dir: string) =>
  measure(page).pipe(
    Effect.flatMap((found) => {
      if (found === null) {
        return Effect.fail(
          new ReactionShotFailed({ detail: "no sheet", step: where })
        );
      }

      const problems = [
        ...(found.offScreen ? ["runs off the table"] : []),
        ...(found.smallest < TARGET_PX
          ? [`has a target of ${found.smallest} px`]
          : []),
        ...found.covers.map((what) => `covers ${what}`),
      ];

      return problems.length === 0
        ? Effect.succeed(found)
        : Effect.fail(
            new ReactionShotFailed({ detail: problems.join(", "), step: where })
          );
    }),
    Effect.tapError(() =>
      attempt("shoot the failure", () =>
        page.screenshot({
          path: `${dir}/failed-${where.replaceAll(" ", "-")}.png`,
        })
      )
    )
  );

const stagePage = (
  opened: Browser,
  app: string,
  size: (typeof SIZES)[number],
  theme: (typeof THEMES)[number],
  players: number
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
        page.goto(
          `${app}/scripts/layout/stage.html?scene=start&host=1&players=${players}&theme=${theme}`
        )
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

const program = Effect.gen(function* shootReactions() {
  const dir = yield* Config.String("REACTIONS_DIR");
  const web = yield* localWebApp;
  const opened = yield* mutedBrowser(chromium);
  let sheets = 0;

  for (const players of SEATINGS) {
    for (const size of SIZES) {
      for (const theme of THEMES) {
        const page = yield* stagePage(opened, web.url, size, theme, players);
        const label = `${size.width}x${size.height}-${players}-${theme}`;

        yield* Effect.sleep(`${SETTLE_MS * 3} millis`);
        yield* attempt("open your own sheet", () =>
          page.locator("nostakes-table .self .frame").click()
        );
        yield* Effect.sleep(`${SETTLE_MS} millis`);
        yield* checked(`${label} your face`, page, dir);
        sheets += 1;

        if (players === 9) {
          yield* attempt("shoot your sheet", () =>
            page.screenshot({ path: `${dir}/own-${label}.png` })
          );
        }

        const faces = yield* attempt("count the faces", () =>
          page.locator("nostakes-table .tile:not(.empty)").count()
        );

        for (let index = 0; index < faces; index += 1) {
          yield* attempt("close the sheet", () =>
            page.keyboard.press("Escape")
          );
          yield* attempt(`open the sheet at face ${index}`, () =>
            page.locator("nostakes-table .tile:not(.empty)").nth(index).click()
          );
          yield* Effect.sleep(`${SETTLE_MS} millis`);
          yield* checked(`${label} face ${index}`, page, dir);
          sheets += 1;

          if (
            players === 9 &&
            (index === 0 ||
              index === faces - 1 ||
              index === Math.floor(faces / 2))
          ) {
            yield* attempt("shoot a face's sheet", () =>
              page.screenshot({ path: `${dir}/face-${index}-${label}.png` })
            );
          }
        }

        yield* attempt("close the page", () => page.context().close());
      }
    }
  }

  yield* Console.log(
    `${sheets} sheets on screen, every target at least ${TARGET_PX} px, none over your cards or the chip; screenshots in ${dir}`
  );
});

await Effect.runPromise(
  program.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
