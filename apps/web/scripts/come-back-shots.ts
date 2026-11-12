import * as NodeServices from "@effect/platform-node/NodeServices";
import { Config, Console, Effect, Schema } from "effect";
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";

import { localSite, mutedBrowser } from "./local-site.ts";

const PHONE = { height: 640, width: 360 } as const;

const THEMES = ["light", "dark"] as const;

const SETTLE_MS = 600;

class ComeBackShotFailed extends Schema.TaggedError<
  ComeBackShotFailed,
  { readonly brand: unique symbol }
>()("ComeBackShotFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `Could not walk a player out of a room and back at "${this.step}": ${this.detail}. Run the same steps by hand in a 360 by 640 window to see it.`;
  }
}

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new ComeBackShotFailed({ detail: String(cause), step }),
    try: run,
  });

const phone = (opened: Browser) =>
  attempt("open a phone", () =>
    opened.newContext({
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
      viewport: PHONE,
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

const seen = (page: Page, text: string) =>
  attempt(`see "${text}"`, () =>
    page.getByText(text, { exact: false }).first().waitFor({ timeout: 15_000 })
  );

const shoot = (page: Page, dir: string, name: string) =>
  Effect.forEach(
    THEMES,
    (theme) =>
      Effect.gen(function* shootTheme() {
        const file = `${dir}/${name}-360x640-${theme}.png`;

        yield* attempt("set the theme", () =>
          page.emulateMedia({ colorScheme: theme })
        );
        yield* Effect.sleep(`${SETTLE_MS} millis`);
        yield* attempt(`shoot ${file}`, () => page.screenshot({ path: file }));
        yield* Console.log(file);
      }),
    { discard: true }
  );

const told = (page: Page, path: string) =>
  attempt(`read the page after ${path}`, () =>
    page.locator("main").first().textContent()
  ).pipe(Effect.flatMap((text) => Console.log(`${path}:\n  ${text ?? ""}`)));

const named = (page: Page, name: string) =>
  attempt(`type the name ${JSON.stringify(name)}`, () =>
    page.getByPlaceholder("Name").fill(name)
  );

const inRoom = (page: Page, who: string) =>
  attempt(`${who} is in the room`, () =>
    page
      .getByRole("button", { exact: true, name: "Menu" })
      .waitFor({ timeout: 15_000 })
  );

const sitDown = (page: Page, who: string) =>
  Effect.gen(function* takeASeat() {
    yield* attempt(`${who} taps an empty seat`, () =>
      page.locator('nostakes-table [aria-label^="Take seat"]').first().click()
    );
    yield* press(page, "Sit down");
    yield* attempt(`${who} is seated`, () =>
      page
        .locator("nostakes-table .self:not(.gone)")
        .waitFor({ state: "attached", timeout: 15_000 })
    );
  });

const leaves = (page: Page, dir: string, shots: boolean) =>
  Effect.gen(function* leaveTheRoom() {
    yield* press(page, "Menu");
    yield* press(page, "Leave");
    yield* seen(page, "Leave the room?");

    if (shots) {
      yield* shoot(page, dir, "leave-sheet");
    }

    yield* press(page, "Leave the room");
    yield* seen(page, "You left this room");
  });

const program = Effect.gen(function* walkOutAndBack() {
  const dir = yield* Config.String("COME_BACK_DIR");
  const { app } = yield* localSite("come_back_shots");
  const opened = yield* mutedBrowser(chromium);

  const host = yield* phone(opened);

  yield* attempt("open the home page", () =>
    host.goto(`${app}/?mute=1`, { waitUntil: "networkidle" })
  );
  yield* press(host, "Open a room");
  yield* named(host, "Ana");
  yield* press(host, "Open a room");
  yield* attempt("land in the room", () =>
    host.waitForURL(/\/r\/[2-9A-Z]{6}$/u)
  );
  yield* attempt("the setup sheet opens for the host", () =>
    host.locator(".setup-sheet").waitFor({ timeout: 15_000 })
  );
  yield* press(host, "Go to the table");

  const link = `${host.url()}?mute=1`;
  const guest = yield* phone(opened);

  yield* attempt("open the room link", () =>
    guest.goto(link, { waitUntil: "networkidle" })
  );
  yield* named(guest, "Ben");
  yield* press(guest, "Join the room");
  yield* inRoom(guest, "Ben");
  yield* sitDown(host, "Ana");
  yield* sitDown(guest, "Ben");
  yield* press(host, "Start the game");
  yield* attempt("a hand is dealt", () =>
    guest
      .locator("nostakes-table .hand")
      .waitFor({ state: "attached", timeout: 15_000 })
  );

  yield* leaves(guest, dir, true);
  yield* shoot(guest, dir, "left-screen");
  yield* told(guest, "after leaving");

  yield* attempt("reload the room link with the pass kept", () =>
    guest.goto(link, { waitUntil: "networkidle" })
  );
  yield* Effect.sleep("2 seconds");
  yield* told(guest, "the room link, pass on the device");

  yield* attempt("open the home page with the pass kept", () =>
    guest.goto(`${app}/?mute=1`, { waitUntil: "networkidle" })
  );
  yield* seen(guest, "Your rooms");
  yield* shoot(guest, dir, "home-with-left-room");
  yield* told(guest, "the home page");
  yield* attempt("tap the room on the home list", () =>
    guest.locator(".room-row").first().click()
  );
  yield* Effect.sleep("2 seconds");
  yield* told(guest, "the home list's row");

  const comeBack = guest.getByRole("button", {
    exact: true,
    name: "Come back",
  });

  if ((yield* attempt("look for Come back", () => comeBack.count())) > 0) {
    yield* attempt("tap Come back", () => comeBack.first().click());
    yield* Effect.sleep("2 seconds");
    yield* told(guest, "Come back");
    yield* attempt("Ben is back in the room", () =>
      guest
        .getByText("You left this room")
        .waitFor({ state: "detached", timeout: 15_000 })
    );
    yield* leaves(guest, dir, false);
  }

  yield* press(guest, "Back home");
  yield* Effect.sleep("1 second");
  yield* told(guest, "Back home");
  yield* attempt("open the room link after Back home", () =>
    guest.goto(link, { waitUntil: "networkidle" })
  );
  yield* Effect.sleep("2 seconds");
  yield* told(guest, "the room link after Back home");

  const asked = guest.getByPlaceholder("Name");

  if ((yield* attempt("look for the name field", () => asked.count())) > 0) {
    yield* named(guest, "Ben");
    yield* press(guest, "Join the room");
    yield* Effect.sleep("2 seconds");
    yield* told(guest, "joining again as Ben");
  }
});

await Effect.runPromise(
  program.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
