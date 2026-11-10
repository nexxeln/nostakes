import * as NodeServices from "@effect/platform-node/NodeServices";
import { Console, Effect, Option, Schedule, Schema } from "effect";
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";

import { localSite, mutedBrowser } from "./local-site.ts";

const WEB_PORT = 5199;

const WEB = `http://localhost:${WEB_PORT}`;

class NightFailed extends Schema.TaggedError<
  NightFailed,
  { readonly brand: unique symbol }
>()("NightFailed", {
  detail: Schema.String,
  step: Schema.String,
}) {
  override get message() {
    return `Two players could not finish a hand at "${this.step}": ${this.detail}. Run pnpm dev and play the same steps by hand to see it.`;
  }
}

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new NightFailed({ detail: String(cause), step }),
    try: run,
  });

const MUTED_PAGE = "?mute=1";

const player = (opened: Browser) =>
  attempt("open a window", () => opened.newContext()).pipe(
    Effect.tap((context) =>
      attempt("mute the app before it loads", () =>
        context.addInitScript(() => {
          globalThis.localStorage.setItem("nostakes.sound", "off");
        })
      )
    ),
    Effect.flatMap((context) => attempt("open a page", () => context.newPage()))
  );

const click = (page: Page, step: string, name: string | RegExp) =>
  attempt(step, () =>
    page.getByRole("button", { exact: true, name }).first().click()
  );

const TABLE = "nostakes-table";

const sitDown = (page: Page, who: string) =>
  Effect.gen(function* takeASeat() {
    yield* attempt(`${who} taps an empty seat`, () =>
      page.locator(`${TABLE} [aria-label^="Take seat"]`).first().click()
    );
    yield* click(page, `${who} sits down`, "Sit down");
    yield* attempt(`${who} is seated`, () =>
      page
        .locator(`${TABLE} .self:not(.gone)`)
        .waitFor({ state: "attached", timeout: 15_000 })
    );
  });

const count = (page: Page, selector: string) =>
  attempt("look at the table", () => page.locator(selector).count()).pipe(
    Effect.orElseSucceed(() => 0)
  );

const centre = (page: Page, selector: string, step: string) =>
  attempt(step, () => page.locator(selector).boundingBox()).pipe(
    Effect.flatMap((box) =>
      box === null
        ? Effect.fail(new NightFailed({ detail: "not on screen", step }))
        : Effect.succeed({
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
          })
    )
  );

const drag = (page: Page, selector: string, rise: number, step: string) =>
  Effect.gen(function* dragUp() {
    const from = yield* centre(page, selector, step);

    yield* attempt(step, () => page.mouse.move(from.x, from.y));
    yield* attempt(step, () => page.mouse.down());
    yield* attempt(step, () =>
      page.mouse.move(from.x, from.y - rise, { steps: 12 })
    );
    yield* attempt(step, () => page.mouse.up());
  });

const CHIP = `${TABLE} .chipctl`;

const HAND = `${TABLE} .hand`;

interface Gesture {
  readonly name: string;
  readonly said: RegExp;
  readonly play: (page: Page) => Effect.Effect<void, NightFailed>;
}

const press = (page: Page, keys: readonly string[], step: string) =>
  Effect.forEach(keys, (key) => attempt(step, () => page.keyboard.press(key)), {
    discard: true,
  });

const GESTURES: readonly Gesture[] = [
  {
    name: "raises by dragging the chip up",
    play: (page) => drag(page, CHIP, 90, "drag the chip up"),
    said: /^(?:Raise to|All in) \d+/u,
  },
  {
    name: "calls by tapping the chip",
    play: (page) => attempt("tap the chip", () => page.locator(CHIP).click()),
    said: /^Call \d+/u,
  },
  {
    name: "checks with the C key",
    play: (page) => press(page, ["c"], "press C"),
    said: /^Check$/u,
  },
  {
    name: "checks by tapping the chip",
    play: (page) => attempt("tap the chip", () => page.locator(CHIP).click()),
    said: /^Check$/u,
  },
  {
    name: "checks by tapping the chip",
    play: (page) => attempt("tap the chip", () => page.locator(CHIP).click()),
    said: /^Check$/u,
  },
  {
    name: "checks by tapping the chip",
    play: (page) => attempt("tap the chip", () => page.locator(CHIP).click()),
    said: /^Check$/u,
  },
  {
    name: "bets with R and Enter",
    play: (page) => press(page, ["r", "Enter"], "press R then Enter"),
    said: /^Bet \d+/u,
  },
  {
    name: "folds by flicking the cards up",
    play: (page) => drag(page, HAND, 170, "flick the cards up"),
    said: /^Fold$/u,
  },
];

const whoseTurn = (pages: readonly Page[]) =>
  Effect.gen(function* findTheLiveChip() {
    for (const page of pages) {
      if ((yield* count(page, `${CHIP}.live`)) > 0) {
        return Option.some(page);
      }
    }

    return Option.none<Page>();
  }).pipe(
    Effect.repeat({
      schedule: Schedule.spaced("150 millis"),
      times: 150,
      until: Option.isSome,
    }),
    Effect.flatMap(
      Option.match({
        onNone: () =>
          Effect.fail(
            new NightFailed({
              detail: "no player's chip came alive",
              step: "wait for a turn",
            })
          ),
        onSome: Effect.succeed,
      })
    )
  );

const peeks = (page: Page) =>
  Effect.gen(function* hoverToPeek() {
    const hand = yield* centre(page, HAND, "find the cards");

    yield* attempt("hover the cards", () => page.mouse.move(hand.x, hand.y));
    yield* attempt("see the cards turn up", () =>
      page.locator(`${HAND}.peek`).waitFor({ state: "attached", timeout: 5000 })
    );
    yield* attempt("move away", () => page.mouse.move(4, 4));
  });

const heard = (page: Page, said: RegExp, step: string) =>
  attempt(step, () =>
    page
      .locator(`${TABLE} .self .act`)
      .filter({ hasText: said })
      .waitFor({ state: "attached", timeout: 15_000 })
  );

const playHand = (pages: readonly Page[], watcher: Page) =>
  Effect.gen(function* playWithGestures() {
    for (const [index, gesture] of GESTURES.entries()) {
      const page = yield* whoseTurn(pages);

      if (index === 0) {
        yield* peeks(page);
      }

      yield* gesture.play(page);
      yield* heard(page, gesture.said, `the table ${gesture.name}`);
      yield* Console.log(`  ${gesture.name}`);
    }

    return yield* attempt("see the pot awarded", () =>
      watcher
        .locator(`${TABLE} .act.win`)
        .first()
        .textContent({ timeout: 15_000 })
    ).pipe(Effect.map((text) => text?.trim() ?? ""));
  });

const night = Effect.gen(function* playOneHand() {
  const { app, roomServer } = yield* localSite(WEB_PORT, "verify_web");

  yield* Console.log(`room server at ${roomServer}`);
  yield* Console.log(`web app at ${app}`);

  const opened = yield* mutedBrowser(chromium);
  const ana = yield* player(opened);
  const ben = yield* player(opened);

  yield* attempt("Ana opens the home page", () =>
    ana.goto(`${WEB}/${MUTED_PAGE}`)
  );
  yield* attempt("Ana types her name", () =>
    ana.getByPlaceholder("Name").fill("Ana", { timeout: 60_000 })
  );
  yield* click(ana, "Ana opens a room", "Open a room");
  yield* attempt("Ana lands in the room", () =>
    ana.waitForURL(/\/r\/[2-9A-Z]{6}$/u)
  );

  const link = ana.url();

  yield* Console.log(`room link ${link}`);
  yield* attempt("Ben opens the link", () => ben.goto(`${link}${MUTED_PAGE}`));
  yield* attempt("Ben types his name", () =>
    ben.getByPlaceholder("Name").fill("Ben")
  );
  yield* click(ben, "Ben joins", "Join the room");
  yield* sitDown(ana, "Ana");
  yield* sitDown(ben, "Ben");
  yield* click(ana, "Ana starts the game", "Start the game");

  const result = yield* playHand([ana, ben], ana);

  yield* Console.log(`hand 1 played with gestures, pot: ${result}`);
});

await Effect.runPromise(
  night.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
