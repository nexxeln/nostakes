import * as NodeServices from "@effect/platform-node/NodeServices";
import { Config, Console, Effect, pipe, Schema } from "effect";
import { chromium, webkit } from "playwright-core";
import type { Browser, BrowserType, Page } from "playwright-core";

import { localSite, mutedBrowser } from "./local-site.ts";

const WEB_PORT = 5195;

const TABLE = "nostakes-table";

const VIEWPORTS = [
  { height: 640, label: "360x640", width: 360 },
  { height: 844, label: "390x844", width: 390 },
  { height: 390, label: "844x390", width: 844 },
] as const;

const THEMES = ["light", "dark"] as const;

const TABLE_SIZES = [2, 6, 9] as const;

const BOARD_STAGES = [
  { boards: 2, players: 6 },
  { boards: 3, players: 9 },
] as const;

const SETTLE_MS = 700;

class ShotFailed extends Schema.TaggedError<
  ShotFailed,
  { readonly brand: unique symbol }
>()("ShotFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `Could not take the phone screenshots at "${this.step}": ${this.detail}. Run the same steps by hand in a phone-sized window to see it.`;
  }
}

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new ShotFailed({ detail: String(cause), step }),
    try: run,
  });

const phone = (opened: Browser, engine: string) =>
  attempt(`open a phone in ${engine}`, () =>
    opened.newContext({
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: engine === "chromium",
      viewport: { height: VIEWPORTS[0].height, width: VIEWPORTS[0].width },
    })
  ).pipe(
    Effect.tap((context) =>
      attempt("mute the app", () =>
        context.addInitScript(() => {
          globalThis.localStorage.setItem("nostakes.sound", "off");
        })
      )
    ),
    Effect.flatMap((context) => attempt("open a page", () => context.newPage()))
  );

const button = (page: Page, name: string) =>
  attempt(`press ${name}`, () =>
    page.getByRole("button", { exact: true, name }).first().click()
  );

const sitDown = (page: Page, who: string) =>
  Effect.gen(function* takeASeat() {
    yield* attempt(`${who} taps an empty seat`, () =>
      page.locator(`${TABLE} [aria-label^="Take seat"]`).first().click()
    );
    yield* button(page, "Sit down");
    yield* attempt(`${who} is seated`, () =>
      page
        .locator(`${TABLE} .self:not(.gone)`)
        .waitFor({ state: "attached", timeout: 15_000 })
    );
  });

const shoot = (page: Page, dir: string, name: string) =>
  Effect.forEach(
    VIEWPORTS,
    (viewport) =>
      Effect.forEach(
        THEMES,
        (theme) =>
          Effect.gen(function* shootOne() {
            const file = `${dir}/${name}-${viewport.label}-${theme}.png`;

            yield* attempt("size the phone", () =>
              page.setViewportSize({
                height: viewport.height,
                width: viewport.width,
              })
            );
            yield* attempt("set the theme", () =>
              page.emulateMedia({ colorScheme: theme })
            );
            yield* Effect.sleep(`${SETTLE_MS} millis`);
            yield* attempt(`shoot ${file}`, () =>
              page.screenshot({ path: file })
            );
            yield* Console.log(file);
          }),
        { discard: true }
      ),
    { discard: true }
  );

const tableOf = (
  opened: Browser,
  engine: string,
  app: string,
  size: number,
  dir: string
) =>
  Effect.gen(function* fillATable() {
    const host = yield* phone(opened, engine);

    yield* attempt("open the home page", () =>
      host.goto(`${app}/?mute=1`, { waitUntil: "networkidle" })
    );

    if (size === TABLE_SIZES[0]) {
      yield* shoot(host, dir, `${engine}-home`);
    }

    yield* attempt("type the host's name", () =>
      host.getByPlaceholder("Name").fill("Sam")
    );
    yield* button(host, "Open a room");
    yield* attempt("land in the room", () =>
      host.waitForURL(/\/r\/[2-9A-Z]{6}$/u)
    );

    const guests = yield* pipe(
      Array.from({ length: size - 1 }, (_, index) => index),
      Effect.forEach((index) =>
        Effect.gen(function* joinAsGuest() {
          const guest = yield* phone(opened, engine);

          yield* attempt("open the room link", () =>
            guest.goto(`${host.url()}?mute=1`, { waitUntil: "networkidle" })
          );

          if (index === 0 && size === TABLE_SIZES[0]) {
            yield* shoot(guest, dir, `${engine}-invite`);
          }

          yield* attempt("type a guest's name", () =>
            guest.getByPlaceholder("Name").fill(`Guest ${index + 1}`)
          );
          yield* button(guest, "Join the room");

          return guest;
        })
      )
    );

    yield* sitDown(host, "the host");
    yield* Effect.forEach(guests, (guest) => sitDown(guest, "a guest"), {
      discard: true,
    });
    yield* button(host, "Start the game");
    yield* attempt("see the cards dealt", () =>
      host
        .locator(`${TABLE} .hand:not(.gone)`)
        .waitFor({ state: "attached", timeout: 20_000 })
    );
    yield* Effect.sleep("1500 millis");
    yield* shoot(host, dir, `${engine}-table-${size}p`);
    yield* Effect.forEach(
      [host, ...guests],
      (page) => attempt("close a phone", () => page.context().close()),
      { discard: true }
    );
  });

const boardsOf = (opened: Browser, engine: string, app: string, dir: string) =>
  Effect.gen(function* stageBoards() {
    const page = yield* phone(opened, engine);

    yield* Effect.forEach(
      BOARD_STAGES,
      ({ boards, players }) =>
        attempt("open the layout stage", () =>
          page.goto(
            `${app}/scripts/layout/stage.html?players=${players}&boards=${boards}`
          )
        ).pipe(
          Effect.andThen(
            attempt("wait for the stage", () =>
              page.locator("html[data-staged]").waitFor({ state: "attached" })
            )
          ),
          Effect.andThen(
            shoot(page, dir, `${engine}-boards-${players}p-${boards}b`)
          )
        ),
      { discard: true }
    );
  });

const program = Effect.gen(function* takeShots() {
  const dir = yield* Config.String("SHOTS_DIR");

  const engines = yield* Config.String("SHOT_ENGINES").pipe(
    Config.withDefault("chromium")
  );

  const subjects = yield* Config.String("SHOT_SUBJECTS").pipe(
    Config.withDefault("tables,boards")
  );

  const { app } = yield* localSite(WEB_PORT, "phone_shots");

  const chosen: readonly BrowserType[] = [chromium, webkit].filter((engine) =>
    engines.split(",").includes(engine.name())
  );

  yield* Effect.forEach(
    chosen,
    (engine) =>
      Effect.gen(function* shootEngine() {
        const opened = yield* mutedBrowser(engine);

        if (subjects.includes("tables")) {
          yield* Effect.forEach(
            TABLE_SIZES,
            (size) => tableOf(opened, engine.name(), app, size, dir),
            { discard: true }
          );
        }

        if (subjects.includes("boards")) {
          yield* boardsOf(opened, engine.name(), app, dir);
        }
      }).pipe(Effect.scoped),
    { discard: true }
  );
});

await Effect.runPromise(
  program.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
