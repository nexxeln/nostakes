import * as NodeServices from "@effect/platform-node/NodeServices";
import { Config, Console, Effect, Schema } from "effect";
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";

import { localSite, mutedBrowser } from "./local-site.ts";

const WEB_PORT = 5193;

const PHONE = { height: 640, width: 360 } as const;

const THEMES = ["light", "dark"] as const;

const SETTLE_MS = 600;

class MembershipShotFailed extends Schema.TaggedError<
  MembershipShotFailed,
  { readonly brand: unique symbol }
>()("MembershipShotFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `Could not take the membership screenshots at "${this.step}": ${this.detail}. Run the same steps by hand in a 360 by 640 window to see it.`;
  }
}

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new MembershipShotFailed({ detail: String(cause), step }),
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

const named = (page: Page, name: string) =>
  attempt(`type the name ${JSON.stringify(name)}`, () =>
    page.getByPlaceholder("Name").fill(name)
  );

const program = Effect.gen(function* takeMembershipShots() {
  const dir = yield* Config.String("MEMBERSHIP_DIR");
  const { app } = yield* localSite(WEB_PORT, "membership_shots");
  const opened = yield* mutedBrowser(chromium);

  const host = yield* phone(opened);

  yield* attempt("open the home page", () =>
    host.goto(`${app}/?mute=1`, { waitUntil: "networkidle" })
  );
  yield* named(host, "Ana");
  yield* press(host, "Open a room");
  yield* attempt("land in the room", () =>
    host.waitForURL(/\/r\/[2-9A-Z]{6}$/u)
  );

  const guest = yield* phone(opened);

  yield* attempt("open the room link", () =>
    guest.goto(`${host.url()}?mute=1`, { waitUntil: "networkidle" })
  );
  yield* named(guest, "ANA");
  yield* press(guest, "Join the room");
  yield* seen(guest, "already called");
  yield* shoot(guest, dir, "refused-name-taken");
  yield* named(guest, "Ben\u202E 400");
  yield* press(guest, "Join the room");
  yield* seen(guest, "hidden character");
  yield* shoot(guest, dir, "refused-name-hidden");
  yield* named(guest, "Ben");
  yield* press(guest, "Join the room");
  yield* attempt("Ben is in the room", () =>
    guest.getByRole("button", { exact: true, name: "Menu" }).waitFor()
  );

  yield* press(host, "Menu");
  yield* seen(host, "Lock the room");
  yield* shoot(host, dir, "menu-unlocked");
  yield* attempt("lock the room", () =>
    host.getByRole("switch", { name: "Lock the room" }).click()
  );
  yield* attempt("see the room locked", () =>
    host
      .locator(
        '[role="switch"][aria-label="Lock the room"][aria-checked="true"]'
      )
      .waitFor({ timeout: 15_000 })
  );
  yield* shoot(host, dir, "menu-locked");

  const knocker = yield* phone(opened);

  yield* attempt("a stranger opens the room link", () =>
    knocker.goto(`${host.url()}?mute=1`, { waitUntil: "networkidle" })
  );
  yield* named(knocker, "Cy");
  yield* press(knocker, "Join the room");
  yield* seen(knocker, "locked this room");
  yield* shoot(knocker, dir, "refused-locked");

  yield* attempt("open Ben's sheet", () =>
    host.locator(".people .person", { hasText: "Ben" }).first().click()
  );
  yield* seen(host, "Remove from the room");
  yield* shoot(host, dir, "person-sheet");
  yield* press(host, "Remove from the room");
  yield* seen(host, "pass stops working");
  yield* shoot(host, dir, "remove-confirm");
  yield* press(host, "Remove");

  yield* seen(guest, "The host removed you from this room.");
  yield* seen(guest, "nothing is owed");
  yield* shoot(guest, dir, "removed");

  yield* Effect.forEach(
    [host, guest, knocker],
    (page) => attempt("close a phone", () => page.context().close()),
    { discard: true }
  );
});

await Effect.runPromise(
  program.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
