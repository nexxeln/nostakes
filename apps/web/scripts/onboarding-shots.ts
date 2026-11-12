import * as NodeServices from "@effect/platform-node/NodeServices";
import { Config, Console, Effect, Schema } from "effect";
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";

import { localSite, mutedBrowser } from "./local-site.ts";

const THEMES = ["light", "dark"] as const;

const SETTLE_MS = 700;

class OnboardingShotFailed extends Schema.TaggedError<
  OnboardingShotFailed,
  { readonly brand: unique symbol }
>()("OnboardingShotFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `Could not take the onboarding screenshots at "${this.step}": ${this.detail}. Open a room by hand in a window of the same size to see it.`;
  }
}

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new OnboardingShotFailed({ detail: String(cause), step }),
    try: run,
  });

interface Size {
  readonly height: number;
  readonly width: number;
}

const PHONES: readonly Size[] = [
  { height: 640, width: 360 },
  { height: 844, width: 390 },
];

const DESKTOP: Size = { height: 900, width: 1440 };

const device = (opened: Browser, size: Size, phone: boolean) =>
  attempt("open a window", () =>
    opened.newContext({
      deviceScaleFactor: 2,
      hasTouch: phone,
      isMobile: phone,
      viewport: size,
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

const press = (page: Page, name: string) =>
  attempt(`press ${name}`, () =>
    page.getByRole("button", { exact: true, name }).first().click()
  );

const shoot = (page: Page, dir: string, name: string, size: Size) =>
  Effect.forEach(
    THEMES,
    (theme) =>
      Effect.gen(function* shootTheme() {
        const file = `${dir}/${name}-${size.width}x${size.height}-${theme}.png`;

        yield* attempt("set the theme", () =>
          page.emulateMedia({ colorScheme: theme })
        );
        yield* Effect.sleep(`${SETTLE_MS} millis`);
        yield* attempt(`shoot ${file}`, () => page.screenshot({ path: file }));
        yield* Console.log(file);
      }),
    { discard: true }
  );

const TABLE = "nostakes-table";

const sitDown = (page: Page, who: string) =>
  Effect.gen(function* takeASeat() {
    yield* attempt(`${who} taps an empty seat`, () =>
      page.locator(`${TABLE} [aria-label^="Take seat"]`).first().click()
    );
    yield* press(page, "Sit down");
    yield* attempt(`${who} is seated`, () =>
      page
        .locator(`${TABLE} .self:not(.gone)`)
        .waitFor({ state: "attached", timeout: 15_000 })
    );
  });

const openRoom = (page: Page, app: string) =>
  Effect.gen(function* openARoom() {
    yield* attempt("open the home page", () =>
      page.goto(`${app}/?mute=1`, { waitUntil: "networkidle" })
    );
    yield* press(page, "Open a room").pipe(Effect.ignore);
    yield* attempt("type the name", () =>
      page.getByPlaceholder("Name").fill("Ana")
    );
    yield* press(page, "Open a room");
    yield* attempt("land in the room", () =>
      page.waitForURL(/\/r\/[2-9A-Z]{6}$/u)
    );
  });

const turnOn = (page: Page, rule: string) =>
  attempt(`turn on ${rule}`, () =>
    page.getByRole("switch", { name: rule }).click()
  ).pipe(
    Effect.andThen(
      attempt(`see ${rule} on`, () =>
        page
          .locator(`[role="switch"][aria-label="${rule}"][aria-checked="true"]`)
          .waitFor({ timeout: 15_000 })
      )
    )
  );

const seen = (page: Page, text: string) =>
  attempt(`see "${text}"`, () =>
    page.getByText(text, { exact: false }).first().waitFor({ timeout: 15_000 })
  );

const SETUP = ".setup-sheet";

const FELT = `${TABLE} .felt-rules:not(.gone)`;

const phoneNight = (opened: Browser, app: string, dir: string, size: Size) =>
  Effect.gen(function* playUntilTheFirstHand() {
    const host = yield* device(opened, size, true);

    yield* openRoom(host, app);
    yield* attempt("see the setup sheet", () =>
      host.locator(SETUP).waitFor({ timeout: 15_000 })
    );
    yield* shoot(host, dir, "setup-first", size);
    yield* turnOn(host, "Seven-deuce bounty");
    yield* turnOn(host, "Bomb pots");
    yield* shoot(host, dir, "setup-extras", size);
    yield* press(host, "Go to the table");
    yield* attempt("see the rules on the felt", () =>
      host.locator(FELT).waitFor({ timeout: 15_000 })
    );
    yield* sitDown(host, "the host");
    yield* seen(host, "Waiting for a second player to sit.");
    yield* shoot(host, dir, "waiting-one-seated", size);

    const guest = yield* device(opened, size, true);

    yield* attempt("a guest opens the room link", () =>
      guest.goto(`${host.url()}?mute=1`, { waitUntil: "networkidle" })
    );
    yield* attempt("the guest types a name", () =>
      guest.getByPlaceholder("Name").fill("Ben")
    );
    yield* press(guest, "Join the room");
    yield* sitDown(guest, "the guest");
    yield* attempt("the guest sees the rules on the felt", () =>
      guest.locator(FELT).waitFor({ timeout: 15_000 })
    );
    yield* shoot(host, dir, "felt-host", size);
    yield* shoot(guest, dir, "felt-guest", size);
    yield* press(host, "Start the game");
    yield* attempt("the first hand is dealt", () =>
      host.locator(FELT).waitFor({ state: "detached", timeout: 30_000 })
    );
    yield* Effect.sleep("1 second");
    yield* attempt("the host goes home", () =>
      host.goto(`${app}/?mute=1`, { waitUntil: "networkidle" })
    );
    yield* seen(host, "Last time's rules");
    yield* shoot(host, dir, "create-last-rules", size);
    yield* attempt("close the windows", () =>
      Promise.all([host.context().close(), guest.context().close()])
    );
  });

const program = Effect.gen(function* takeOnboardingShots() {
  const dir = yield* Config.String("ONBOARDING_DIR");
  const { app } = yield* localSite("onboarding_shots");
  const opened = yield* mutedBrowser(chromium);

  const only = yield* Config.String("ONBOARDING_SIZES").pipe(
    Config.withDefault("")
  );

  const sizes: readonly Size[] =
    only === ""
      ? PHONES
      : only.split(",").map((pair) => {
          const [width = 0, height = 0] = pair.split("x").map(Number);

          return { height, width };
        });

  for (const size of sizes) {
    yield* phoneNight(opened, app, dir, size);
  }

  const desk = yield* device(opened, DESKTOP, false);

  yield* openRoom(desk, app);
  yield* attempt("see the setup sheet", () =>
    desk.locator(SETUP).waitFor({ timeout: 15_000 })
  );
  yield* shoot(desk, dir, "setup-first", DESKTOP);
});

await Effect.runPromise(
  program.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
