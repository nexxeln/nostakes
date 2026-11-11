import * as NodeServices from "@effect/platform-node/NodeServices";
import { Config, Console, Effect, Schema } from "effect";
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";

import { localSite, mutedBrowser } from "./local-site.ts";

const PHONE = { height: 640, width: 360 } as const;

const THEMES = ["light", "dark"] as const;

const SETTLE_MS = 600;

const TAGS_UP_MS = 900;

const STAGED_TABLES = [{ name: "table-bounty-paid", scene: "bounty" }] as const;

const STAGED_PLAYERS = 6;

class RulesShotFailed extends Schema.TaggedError<
  RulesShotFailed,
  { readonly brand: unique symbol }
>()("RulesShotFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `Could not take the house-rule screenshots at "${this.step}": ${this.detail}. Run the same steps by hand in a 360 by 640 window to see it.`;
  }
}

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new RulesShotFailed({ detail: String(cause), step }),
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

const openGroup = (page: Page, group: string) =>
  attempt(`open the ${group} rules`, () =>
    page.locator(".rule-group-row", { hasText: group }).first().click()
  );

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

const explain = (page: Page, rule: string) =>
  attempt(`open the help for ${rule}`, () =>
    page.locator(".rule-name.has-help", { hasText: rule }).first().click()
  );

const bringUp = (page: Page, rule: string) =>
  attempt(`scroll to ${rule}`, () =>
    page
      .locator(".rule-line", { hasText: rule })
      .first()
      .scrollIntoViewIfNeeded()
  );

const stagedTable = (
  opened: Browser,
  app: string,
  dir: string,
  staged: (typeof STAGED_TABLES)[number]
) =>
  Effect.forEach(
    THEMES,
    (theme) =>
      Effect.gen(function* shootStage() {
        const page = yield* phone(opened);
        const file = `${dir}/${staged.name}-360x640-${theme}.png`;

        yield* attempt("open the layout stage", () =>
          page.goto(
            `${app}/scripts/layout/stage.html?scene=${staged.scene}&players=${STAGED_PLAYERS}&theme=${theme}`
          )
        );
        yield* attempt("wait for the stage", () =>
          page.locator("html[data-staged]").waitFor({ state: "attached" })
        );
        yield* Effect.sleep(`${TAGS_UP_MS} millis`);
        yield* attempt(`shoot ${file}`, () => page.screenshot({ path: file }));
        yield* Console.log(file);
        yield* attempt("close the phone", () => page.context().close());
      }),
    { discard: true }
  );

const program = Effect.gen(function* takeRulesShots() {
  const dir = yield* Config.String("RULES_DIR");
  const { app } = yield* localSite("rules_shots");
  const opened = yield* mutedBrowser(chromium);
  const host = yield* phone(opened);

  yield* attempt("open the home page", () =>
    host.goto(`${app}/?mute=1`, { waitUntil: "networkidle" })
  );
  yield* attempt("type the name", () =>
    host.getByPlaceholder("Name").fill("Ana")
  );
  yield* press(host, "Open a room");
  yield* attempt("land in the room", () =>
    host.waitForURL(/\/r\/[2-9A-Z]{6}$/u)
  );
  yield* press(host, "Menu");
  yield* attempt("open the house rules", () =>
    host.locator(".rules-card").first().click()
  );
  yield* seen(host, "Showdown");
  yield* openGroup(host, "Showdown");
  yield* turnOn(host, "Seven-deuce bounty");
  yield* explain(host, "Seven-deuce bounty");
  yield* bringUp(host, "Bounty from each");
  yield* shoot(host, dir, "rules-seven-deuce-bounty");
  yield* press(host, "Save");
  yield* attempt("close the rules", () => host.keyboard.press("Escape"));
  yield* press(host, "Menu").pipe(Effect.ignore);
  yield* seen(host, "7-2 bounty");
  yield* shoot(host, dir, "menu-rule-card");
  yield* attempt("close the host's phone", () => host.context().close());

  yield* Effect.forEach(
    STAGED_TABLES,
    (staged) => stagedTable(opened, app, dir, staged),
    { discard: true }
  );
});

await Effect.runPromise(
  program.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
