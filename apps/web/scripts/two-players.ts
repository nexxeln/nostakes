import * as NodeServices from "@effect/platform-node/NodeServices";
import { CardFromText } from "@nostakes/engine";
import { nothingOfItsOwn } from "@nostakes/room";
import { Console, Effect, Exit, Option, Schedule, Schema, Scope } from "effect";
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";

import { localRoomServer, localWebApp, mutedBrowser } from "./local-site.ts";
import type { WebApp } from "./local-site.ts";
import { watchPages } from "./page-evidence.ts";
import { SHARE_STUB, sharedAtLeast } from "./share-stub.ts";

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

const FIRST_BUILD = "e2e-build-1";

const SECOND_BUILD = "e2e-build-2";

const STAGE = "verify_web";

const watched = watchPages();

const BUILD_META = "nostakes-build";

const stampPage = ({ build, meta }: { build: string; meta: string }) => {
  const stamp = () => {
    const head = globalThis.document.querySelector("head");

    if (head === null) {
      return false;
    }

    for (const old of head.querySelectorAll(`meta[name="${meta}"]`)) {
      old.remove();
    }

    const tag = globalThis.document.createElement("meta");

    tag.name = meta;
    tag.content = build;
    head.append(tag);

    return true;
  };

  if (!stamp()) {
    const watcher = new MutationObserver(() => {
      if (stamp()) {
        watcher.disconnect();
      }
    });

    watcher.observe(globalThis.document, { childList: true, subtree: true });
  }
};

const serveBuild = (page: Page, build: string) =>
  attempt(`serve ${build} to the next page load`, () =>
    page.context().addInitScript(stampPage, { build, meta: BUILD_META })
  );

const player = (opened: Browser, name: string) =>
  attempt("open a window", () => opened.newContext()).pipe(
    Effect.tap((context) =>
      attempt("mute the app before it loads", () =>
        context.addInitScript(() => {
          globalThis.localStorage.setItem("nostakes.sound", "off");
        })
      )
    ),
    Effect.flatMap((context) =>
      attempt("open a page", () => context.newPage())
    ),
    Effect.tap((page) => watched.watch(page, name))
  );

const click = (page: Page, step: string, name: string | RegExp) =>
  attempt(step, () =>
    page.getByRole("button", { exact: true, name }).first().click()
  );

const ENTRY_PATH = /\/rooms(?:\/[2-9A-Z]{6}\/members)?$/u;

const DEVICE_HEADER = "x-nostakes-device";

const DEVICE_ID = /^[A-Za-z0-9_-]{22}$/u;

const REPORTS_PATH = "/rooms/reports";

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

const LOOKING_DOWN = `${TABLE} .tile:not(.empty) .pic[data-face*="|LookingDown|"]`;

const RISING_CLAP = `${TABLE} .reaction[data-reaction="Clap"]`;

const shotsDir = Option.fromNullishOr(process.env.SIGNAL_SHOTS_DIR);

const shoot = (page: Page, name: string) =>
  Option.match(shotsDir, {
    onNone: () => Effect.void,
    onSome: (dir) =>
      attempt(`save ${name}`, () =>
        page.screenshot({ path: `${dir}/${name}` })
      ).pipe(Effect.asVoid),
  });

const peeksWhileWatched = (page: Page, other: Page) =>
  Effect.gen(function* hoverToPeek() {
    const hand = yield* centre(page, HAND, "find the cards");

    yield* attempt("hover the cards", () => page.mouse.move(hand.x, hand.y));
    yield* attempt("see the cards turn up", () =>
      page.locator(`${HAND}.peek`).waitFor({ state: "attached", timeout: 5000 })
    );
    yield* attempt("the other player sees that face look down", () =>
      other.locator(LOOKING_DOWN).waitFor({ state: "attached", timeout: 5000 })
    );
    yield* shoot(other, "peeking.png");
    yield* Console.log("  peeks, and the other player sees the face look down");
    yield* attempt("move away", () => page.mouse.move(4, 4));
    yield* attempt("the other player sees the face look up again", () =>
      other.locator(LOOKING_DOWN).waitFor({ state: "detached", timeout: 5000 })
    );
  });

const reactsWhileWatched = (page: Page, other: Page) =>
  Effect.gen(function* reactWithKeys() {
    yield* press(page, ["e", "1"], "open the reactions with E and pick 1");
    yield* attempt("the other player sees the clap rise", () =>
      other.locator(RISING_CLAP).waitFor({ state: "attached", timeout: 5000 })
    );
    yield* Effect.sleep("500 millis");
    yield* shoot(other, "reaction.png");
    yield* Console.log("  claps, and the other player sees it rise");
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
        const other = pages.find((candidate) => candidate !== page) ?? watcher;

        yield* peeksWhileWatched(page, other);
        yield* reactsWhileWatched(page, other);
      }

      yield* gesture.play(page);
      yield* heard(page, gesture.said, `the table ${gesture.name}`);
      yield* Console.log(`  ${gesture.name}`);
    }

    return yield* attempt("see the pot awarded", () =>
      watcher
        .locator(`${TABLE} [data-awarded]`)
        .first()
        .getAttribute("data-awarded", { timeout: 15_000 })
    ).pipe(Effect.map((text) => text?.trim() ?? ""));
  });

const SHOW_WAIT_MS = 3000;

const EXPOSED_EDGE = { x: 10, y: 24 };

const showsOneCardThenTheOther = (page: Page, other: Page) =>
  Effect.gen(function* showCardByCard() {
    const cards = page.locator(`${HAND} .hc`);

    yield* shoot(page, "show-before.png");
    yield* attempt("tap the first card to show it", () =>
      cards.first().click({ position: EXPOSED_EDGE })
    );
    yield* shoot(page, "show-after-first.png");
    yield* attempt("see the hint offer the other card", () =>
      page
        .locator(`${TABLE} .hand-hint`)
        .filter({ hasText: "Tap your other card to show it" })
        .waitFor({ state: "attached", timeout: SHOW_WAIT_MS })
    );
    yield* attempt("tap the other card to show it", () => cards.nth(1).click());
    yield* attempt("see both cards shown", () =>
      page
        .locator(`${HAND}.open`)
        .waitFor({ state: "attached", timeout: SHOW_WAIT_MS })
    );
    yield* attempt("see both cards on that seat from across the table", () =>
      other
        .locator(`${TABLE} .tile .shown .card`)
        .nth(1)
        .waitFor({ state: "attached", timeout: SHOW_WAIT_MS })
    );
  });

const holds = (truth: boolean, failure: NightFailed) =>
  truth ? Effect.void : Effect.fail(failure);

const FELT_CLEAR = "clear";

const watchesTheFelt = (page: Page) =>
  attempt("watch for a bet on the felt while the hint shows", () =>
    page.evaluate((clear) => {
      const { dataset } = globalThis.document.documentElement;

      dataset.felt = clear;

      const look = () => {
        const root =
          globalThis.document.querySelector("nostakes-table")?.shadowRoot;

        const hint = root?.querySelector(".hand-hint");

        const reading =
          hint?.classList.contains("on") === true &&
          !hint.classList.contains("held");

        const bets = [...(root?.querySelectorAll(".pile:not(.empty)") ?? [])];

        if (reading && bets.length > 0 && dataset.felt === clear) {
          dataset.felt = `"${hint?.textContent?.trim() ?? ""}" with ${bets.map((bet) => bet.textContent?.trim() ?? "").join(", ")} on the felt`;
        }

        requestAnimationFrame(look);
      };

      requestAnimationFrame(look);
    }, FELT_CLEAR)
  );

const feltStayedClear = (page: Page, who: string) =>
  Effect.gen(function* readTheWatch() {
    const felt = yield* attempt(`read what ${who}'s felt held`, () =>
      page.evaluate(
        () => globalThis.document.documentElement.dataset.felt ?? "no watch ran"
      )
    );

    yield* holds(
      felt === FELT_CLEAR,
      new NightFailed({
        detail: felt,
        step: `${who} never sees a bet on the felt while the hint shows`,
      })
    );
  });

interface SeenCards {
  readonly board: readonly string[];
  readonly hole: readonly string[];
}

const cardsOn = (page: Page) =>
  attempt("read the cards on the table", () =>
    page.evaluate((): SeenCards => {
      const root =
        globalThis.document.querySelector("nostakes-table")?.shadowRoot;

      return {
        board: [
          ...(root?.querySelectorAll(".slot .card:not(.rabbit) .face") ?? []),
        ].map((face) => {
          const suit =
            [...face.classList].find((name) => name.startsWith("suit-")) ?? "";

          const rank = (face.textContent ?? "").trim();

          return `${rank === "10" ? "T" : rank}${suit.slice(5)}`;
        }),
        hole: [...(root?.querySelectorAll(".hand .hc[data-card]") ?? [])].map(
          (node) =>
            node instanceof HTMLElement ? (node.dataset.card ?? "") : ""
        ),
      };
    })
  );

const decodeCard = Schema.decodeUnknownOption(CardFromText);

const decodedCards = (texts: readonly string[]) =>
  texts.flatMap((text) => Option.toArray(decodeCard(text)));

const hasNothing = (hole: readonly string[], board: readonly string[]) =>
  hole.length === 2 &&
  board.length === 5 &&
  nothingOfItsOwn(decodedCards(hole), decodedCards(board));

const passes = (page: Page, step: string) =>
  Effect.gen(function* tapAndWait() {
    const before = yield* cardsOn(page);

    yield* attempt(step, () => page.locator(`${CHIP}.live`).click());
    yield* attempt(`${step}, and the turn moves on`, () =>
      page.waitForFunction(
        (board) => {
          const root =
            globalThis.document.querySelector("nostakes-table")?.shadowRoot;

          return (
            root?.querySelector(".chipctl.live") === null ||
            (root?.querySelectorAll(".slot .card:not(.rabbit) .face").length ??
              0) > board
          );
        },
        before.board.length,
        { timeout: 15_000 }
      )
    );
  });

const opens = (page: Page) =>
  Effect.gen(function* raiseToEight() {
    yield* press(page, ["8", "Enter"], "type a raise to 8 and send it");
    yield* heard(page, /^(?:Raise to|Bet) 8$/u, "the table hears the raise");
  });

const toRiver = (pages: readonly Page[]) =>
  Effect.gen(function* raiseThenCheckItDown() {
    for (let step = 0; step < 8; step += 1) {
      const page = yield* whoseTurn(pages);
      const { board } = yield* cardsOn(page);

      if (board.length === 5) {
        return page;
      }

      yield* step === 0
        ? opens(page)
        : passes(page, "call or check to see the next card");
    }

    return yield* new NightFailed({
      detail: "the river never came after eight calls and checks",
      step: "check the hand down to the river",
    });
  });

const MOMENT = "nostakes-moment[data-moment]";

const bluffs = (bettor: Page, caller: Page) =>
  Effect.gen(function* shoveFoldShow() {
    const chip = yield* centre(bettor, `${CHIP}.live`, "find the live chip");

    yield* drag(
      bettor,
      `${CHIP}.live`,
      chip.y - 6,
      "shove the chip to the top"
    );
    yield* heard(
      bettor,
      /^(?:All in|Bet|Raise to) \d+/u,
      "the table hears a bet"
    );
    yield* whoseTurn([caller]);
    yield* drag(caller, HAND, 170, "flick the cards up to fold");
    yield* attempt("the bettor is offered a show", () =>
      bettor
        .locator(`${HAND}.offering`)
        .waitFor({ state: "attached", timeout: 15_000 })
    );
    yield* attempt("the bettor taps the edge of the lower card", () =>
      bettor
        .locator(`${HAND}.offering .hc`)
        .first()
        .click({ position: { x: 6, y: 30 } })
    );
    yield* attempt("the shown card turns up", () =>
      bettor
        .locator(`${HAND} .hc.up`)
        .first()
        .waitFor({ state: "attached", timeout: 15_000 })
    );
    yield* attempt("the bettor taps the cards again to show the other", () =>
      bettor.locator(`${HAND}.offering`).click()
    );
    yield* attempt("both cards are face up", () =>
      bettor
        .locator(`${HAND} .hc.up`)
        .nth(1)
        .waitFor({ state: "attached", timeout: 15_000 })
    );
  });

const recordedHand = (page: Page) =>
  attempt("read what the page recorded of the hand", () =>
    page.evaluate(() => {
      const host = globalThis.document.querySelector("nostakes-moment");

      return host === null
        ? "no moment element"
        : JSON.stringify(
            Object.getOwnPropertyDescriptor(
              Object.getPrototypeOf(host),
              "hand"
            )?.get?.call(host) ?? null
          );
    })
  );

const momentOn = (page: Page, who: string) =>
  attempt(`${who} sees the bluff called out`, () =>
    page
      .locator(MOMENT)
      .first()
      .getAttribute("data-moment", { timeout: 20_000 })
  ).pipe(
    Effect.map((id) => id ?? ""),
    Effect.catchTag("NightFailed", (failure) =>
      recordedHand(page).pipe(
        Effect.flatMap((recorded) =>
          Effect.fail(
            new NightFailed({
              detail: `${failure.detail}; the page recorded ${recorded}`,
              step: failure.step,
            })
          )
        )
      )
    )
  );

const showsABluff = (ana: Page, ben: Page) =>
  Effect.gen(function* playUntilABluff() {
    let bluffed = false;

    for (let hand = 0; hand < 8 && !bluffed; hand += 1) {
      const page = yield* toRiver([ana, ben]);
      const other = page === ana ? ben : ana;
      const mine = yield* cardsOn(page);
      const theirs = yield* cardsOn(other);

      if (hasNothing(mine.hole, mine.board)) {
        yield* bluffs(page, other);
        bluffed = true;
      } else if (hasNothing(theirs.hole, mine.board)) {
        yield* passes(page, "check the river");
        yield* whoseTurn([other]);
        yield* bluffs(other, page);
        bluffed = true;
      } else {
        yield* drag(page, HAND, 170, "fold a river nobody can bluff");
        yield* Console.log("  nobody could bluff that board; dealing again");
      }
    }

    return yield* bluffed
      ? Effect.void
      : Effect.fail(
          new NightFailed({
            detail:
              "eight hands passed without a player holding nothing on the river",
            step: "find a hand to bluff with",
          })
        );
  });

const AWARDED = `${TABLE} [data-awarded]`;

const tablesWhenAsked = (pages: readonly Page[], watcher: Page) =>
  Effect.gen(function* tableOnce() {
    for (const page of pages) {
      if ((yield* count(page, `${HAND}.beckon`)) > 0) {
        yield* attempt("table the hand when the showdown asks", () =>
          page.locator(HAND).click({ position: EXPOSED_EDGE, timeout: 2000 })
        ).pipe(Effect.ignore);
      }
    }

    return (yield* count(watcher, AWARDED)) > 0;
  });

const callsTheRiver = (ana: Page, ben: Page) =>
  Effect.gen(function* betCallAndShow() {
    const bettor = yield* toRiver([ana, ben]);
    const caller = bettor === ana ? ben : ana;

    yield* press(bettor, ["r", "Enter"], "bet the river with R and Enter");
    yield* heard(bettor, /^Bet \d+/u, "the table hears the river bet");
    yield* whoseTurn([caller]);
    yield* attempt("call the river", () =>
      caller.locator(`${CHIP}.live`).click()
    );

    const awarded = yield* tablesWhenAsked([bettor, caller], ana).pipe(
      Effect.repeat({
        schedule: Schedule.spaced("200 millis"),
        times: 150,
        until: (done) => done,
      })
    );

    yield* holds(
      awarded,
      new NightFailed({
        detail: "no seat was awarded the pot within 30 seconds",
        step: "show both hands down after a called river bet",
      })
    );
  });

const sameMoment = (ana: Page, ben: Page) =>
  Effect.gen(function* compareMoments() {
    const seenByAna = yield* momentOn(ana, "Ana");
    const seenByBen = yield* momentOn(ben, "Ben");

    yield* holds(
      seenByAna.includes(":Bluff:") && seenByAna === seenByBen,
      new NightFailed({
        detail: `Ana saw "${seenByAna}" and Ben saw "${seenByBen}"`,
        step: "see the same bluff on both screens",
      })
    );

    return seenByAna;
  });

const deployed = (web: WebApp, build: string) =>
  localRoomServer(web.url, STAGE, Option.some(build)).pipe(
    Effect.tap((roomServer) =>
      Effect.sync(() => {
        web.reach(roomServer);
      })
    ),
    Effect.tap((roomServer) =>
      Console.log(`room server at ${roomServer} serves ${build}`)
    )
  );

const pageBuild = (page: Page) =>
  attempt("read the page's build", () =>
    page
      .locator(`meta[name="${BUILD_META}"]`)
      .getAttribute("content", { timeout: 1000 })
  ).pipe(Effect.orElseSucceed(() => null));

interface ChipTable extends HTMLElement {
  readonly snapshot: {
    readonly pots: readonly number[];
    readonly seats: readonly {
      readonly bet: number;
      readonly stack: number;
    }[];
  } | null;
}

const chipsOnTheTable = (page: Page, who: string) =>
  attempt(`count the chips on ${who}'s table`, () =>
    page.evaluate(() => {
      const drawn =
        globalThis.document.querySelector<ChipTable>("nostakes-table")
          ?.snapshot ?? null;

      return drawn === null
        ? null
        : drawn.seats.reduce(
            (chips, seat) => chips + seat.stack + seat.bet,
            drawn.pots.reduce((chips, pot) => chips + pot, 0)
          );
    })
  ).pipe(
    Effect.flatMap((chips) =>
      chips === null
        ? Effect.fail(
            new NightFailed({
              detail: `${who}'s table had nothing to draw`,
              step: "count every stack, bet, and pot on one table at one moment",
            })
          )
        : Effect.succeed(chips)
    )
  );

const chipsOnBothTables = (ana: Page, ben: Page) =>
  Effect.all({
    ana: chipsOnTheTable(ana, "Ana"),
    ben: chipsOnTheTable(ben, "Ben"),
  });

const onBuild = (page: Page, who: string, build: string) =>
  pageBuild(page).pipe(
    Effect.repeat({
      schedule: Schedule.spaced("250 millis"),
      times: 240,
      until: (seen) => seen === build,
    }),
    Effect.flatMap((seen) =>
      holds(
        seen === build,
        new NightFailed({
          detail: `still on ${String(seen)}`,
          step: `${who} reloads into ${build}`,
        })
      )
    )
  );

const seated = (page: Page, who: string) =>
  attempt(`${who} is back in the seat`, () =>
    page
      .locator(`${TABLE} .self:not(.gone)`)
      .waitFor({ state: "attached", timeout: 30_000 })
  );

const toldToWait = (page: Page, who: string) =>
  attempt(`${who} is told the new version loads after this hand`, () =>
    page
      .locator(".update-line")
      .filter({ hasText: "It loads after this hand." })
      .waitFor({ state: "attached", timeout: 60_000 })
  );

const calmDeck = (page: Page) =>
  Effect.gen(function* readTheDeckMark() {
    const deck = yield* attempt("see the deck mark for the hand", () =>
      page.locator(".fair-mark").getAttribute("aria-label", { timeout: 45_000 })
    );

    const alarmed = yield* count(page, ".fair-mark.is-alarm");

    return yield* alarmed > 0
      ? Effect.fail(
          new NightFailed({
            detail: deck ?? "",
            step: "check the deck of hand 1",
          })
        )
      : Effect.succeed(deck ?? "");
  });

const NIGHT_OVER = "The night is over";

const settles = (
  pages: readonly Page[],
  left: number
): Effect.Effect<void, NightFailed> =>
  attempt("wait for the night to close", () =>
    Promise.all(
      pages.map((page) => page.getByText(NIGHT_OVER).waitFor({ timeout: 5000 }))
    )
  ).pipe(
    Effect.asVoid,
    Effect.catchTag("NightFailed", (failure) =>
      left <= 0
        ? Effect.fail(failure)
        : whoseTurn(pages).pipe(
            Effect.flatMap((page) =>
              drag(page, HAND, 170, "fold the hand in play so the night ends")
            ),
            Effect.andThen(Effect.suspend(() => settles(pages, left - 1)))
          )
    )
  );

const endsTheNight = (ana: Page, ben: Page) =>
  Effect.gen(function* endTheNight() {
    yield* click(ana, "Ana opens the menu", "Menu");
    yield* click(ana, "Ana asks to end the night", "End the night");
    yield* attempt("Ana confirms the end of the night", () =>
      ana
        .locator(".sheet .button.danger")
        .filter({ hasText: "End the night" })
        .click()
    );
    yield* settles([ana, ben], 4);
  });

const recapOn = (page: Page, who: string) =>
  attempt(`read ${who}'s recap`, () =>
    page.locator(".recap").textContent({ timeout: 10_000 })
  ).pipe(Effect.map((text) => text ?? ""));

const sameRecap = (ana: Page, ben: Page) =>
  Effect.gen(function* compareRecaps() {
    const seenByAna = yield* recapOn(ana, "Ana");
    const seenByBen = yield* recapOn(ben, "Ben");

    yield* holds(
      seenByAna === seenByBen && /\d+ hands? in/u.test(seenByAna),
      new NightFailed({
        detail: `Ana read "${seenByAna}" and Ben read "${seenByBen}"`,
        step: "show both players the same recap of the night",
      })
    );

    return seenByAna;
  });

const SettleSharedSchema = Schema.Array(
  Schema.Struct({ name: Schema.String, sameTask: Schema.Boolean })
);

const sharesTheSettleUp = (page: Page) =>
  Effect.gen(function* shareTheSettleUp() {
    yield* attempt("stub the share sheet", () => page.evaluate(SHARE_STUB));
    yield* attempt("draw the settle-up picture before any tap", () =>
      page
        .locator('nostakes-keep[data-tone="Primary"][data-drawn="Chat Story"]')
        .waitFor({ state: "attached", timeout: 30_000 })
    );
    yield* shoot(page, "settled.png");
    yield* attempt("tap Share as a picture", () =>
      page.locator('nostakes-keep[data-tone="Primary"] .keep').click()
    );
    yield* attempt("hand the picture to the share sheet", () =>
      sharedAtLeast(page, 1, 10_000)
    );

    const shared = yield* attempt("read what was shared", () =>
      page.evaluate<string>("JSON.stringify(window.__shared)")
    ).pipe(
      Effect.flatMap(
        Schema.decodeEffect(Schema.fromJsonString(SettleSharedSchema))
      ),
      Effect.catchTag("SchemaError", (failure) =>
        Effect.fail(
          new NightFailed({
            detail: failure.message,
            step: "read what was shared",
          })
        )
      )
    );

    const [first] = shared;

    yield* holds(
      first !== undefined &&
        first.name === "nostakes-settle-up.png" &&
        first.sameTask,
      new NightFailed({
        detail: `the share sheet got ${JSON.stringify(shared)}`,
        step: "share the settle-up picture from inside the tap",
      })
    );
  });

const night = Effect.gen(function* playOneHand() {
  const firstDeploy = yield* Scope.make();

  yield* Effect.addFinalizer(() => Scope.close(firstDeploy, Exit.void));

  const web = yield* localWebApp;

  yield* Console.log(`web app at ${web.url}`);

  const roomServer = yield* deployed(web, FIRST_BUILD).pipe(
    Scope.provide(firstDeploy)
  );

  const opened = yield* mutedBrowser(chromium);
  const ana = yield* player(opened, "Ana");
  const ben = yield* player(opened, "Ben");
  const loads = { ana: 0, ben: 0 };

  yield* serveBuild(ana, FIRST_BUILD);
  yield* serveBuild(ben, FIRST_BUILD);

  const devices: string[] = [];
  const reports: string[] = [];
  const traffic = { devices, reports };

  for (const page of [ana, ben]) {
    page.context().on("request", (request) => {
      if (request.method() === "POST" && ENTRY_PATH.test(request.url())) {
        traffic.devices.push(request.headers()[DEVICE_HEADER] ?? "none");
      }
    });

    page.context().on("response", (response) => {
      if (response.url().endsWith(REPORTS_PATH)) {
        traffic.reports.push(
          `${response.status()} ${response.request().postData() ?? ""}`
        );
      }
    });
  }

  ana.on("load", () => {
    loads.ana += 1;
  });
  ben.on("load", () => {
    loads.ben += 1;
  });

  yield* attempt("Ana opens the home page", () =>
    ana.goto(`${web.url}/${MUTED_PAGE}`)
  );
  yield* attempt("Ana sees the landing", () =>
    ana.locator(".landing .hero-open").waitFor({ timeout: 60_000 })
  );
  yield* click(ana, "Ana taps Open a room on the landing", "Open a room");
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
  yield* watchesTheFelt(ana);
  yield* watchesTheFelt(ben);

  const result = yield* playHand([ana, ben], ana);

  yield* Console.log(`hand 1 played with gestures, pot: ${result}`);
  yield* showsOneCardThenTheOther(ana, ben);
  yield* Console.log("Ana shows one card, then the other, and Ben sees both");
  yield* feltStayedClear(ana, "Ana");
  yield* feltStayedClear(ben, "Ben");
  yield* Console.log(
    "no bet lay on the felt while either player's hint showed"
  );

  const deck = yield* calmDeck(ana);

  yield* Console.log(
    deck.endsWith("deck not checked")
      ? `deck: ${deck}. The server could not reach drand in time and shuffled the hand itself; an honest outage passes this check.`
      : `deck: ${deck}`
  );
  yield* callsTheRiver(ana, ben);
  yield* feltStayedClear(ana, "Ana");
  yield* feltStayedClear(ben, "Ben");
  yield* Console.log(
    "a called river bet went into the pot before either hint showed the hands"
  );
  yield* whoseTurn([ana, ben]);
  yield* Console.log("the next hand is dealt");
  yield* click(ana, "Ana opens the menu", "Menu");
  yield* click(ana, "Ana pauses after this hand", "Pause after this hand");
  yield* click(ana, "Ana closes the menu", "Close");

  const chipsBefore = yield* chipsOnBothTables(ana, ben);

  yield* Scope.close(firstDeploy, Exit.void);
  yield* Console.log(`deploying ${SECOND_BUILD} in the middle of hand 2`);

  const redeployed = yield* deployed(web, SECOND_BUILD);

  yield* Console.log(
    redeployed === roomServer
      ? `the room server came back at ${redeployed}`
      : `the room server came back at ${redeployed}, not ${roomServer}; the web app's proxy follows it`
  );
  yield* serveBuild(ana, SECOND_BUILD);
  yield* serveBuild(ben, SECOND_BUILD);
  yield* toldToWait(ana, "Ana");
  yield* toldToWait(ben, "Ben");
  yield* Console.log(
    "both players are told the new version loads after this hand"
  );

  const folder = yield* whoseTurn([ana, ben]);

  yield* drag(folder, HAND, 170, "flick the cards up to end hand 2");
  yield* onBuild(ana, "Ana", SECOND_BUILD);
  yield* onBuild(ben, "Ben", SECOND_BUILD);
  yield* holds(
    [ana, ben].every((page) => new URL(page.url()).origin === web.url),
    new NightFailed({
      detail: `the pages are at ${ana.url()} and ${ben.url()}, not ${web.url}`,
      step: "reach the new build from the same page as before",
    })
  );
  yield* seated(ana, "Ana");
  yield* seated(ben, "Ben");

  const chipsAfter = yield* chipsOnBothTables(ana, ben);

  yield* holds(
    chipsBefore.ana > 0 &&
      [chipsBefore.ben, chipsAfter.ana, chipsAfter.ben].every(
        (chips) => chips === chipsBefore.ana
      ),
    new NightFailed({
      detail: `stacks, bets, and pots came to ${chipsBefore.ana} chips on Ana's table and ${chipsBefore.ben} on Ben's in the hand the restart interrupted, and to ${chipsAfter.ana} and ${chipsAfter.ben} after the new build`,
      step: "keep every chip through the reload",
    })
  );
  yield* Console.log(
    `both players are back in their seats with ${chipsAfter.ana} chips on the table, as before the restart`
  );
  yield* click(ana, "Ana starts the game again", "Start the game");
  yield* whoseTurn([ana, ben]);
  yield* Console.log("hand 3 is dealt on the new build");
  yield* showsABluff(ana, ben);
  yield* Console.log(
    `both players see the same moment: ${yield* sameMoment(ana, ben)}`
  );
  yield* holds(
    loads.ana === 2 && loads.ben === 2,
    new NightFailed({
      detail: `Ana's page loaded ${loads.ana} times and Ben's ${loads.ben}`,
      step: "reload each page exactly once for the new build",
    })
  );
  yield* holds(
    traffic.devices.length === 2 &&
      new Set(traffic.devices).size === 2 &&
      traffic.devices.every((device) => DEVICE_ID.test(device)),
    new NightFailed({
      detail: `opening and joining sent the device ids ${traffic.devices.join(", ") || "none"}`,
      step: "send each device's random number with opening and joining",
    })
  );
  yield* holds(
    traffic.reports.filter(
      (report) => report.startsWith("204 ") && report.includes("ForcedReload")
    ).length >= 2 &&
      traffic.reports.every((report) => report.startsWith("204 ")),
    new NightFailed({
      detail: `the pages' reports were answered ${traffic.reports.join(" | ") || "never"}`,
      step: "report each forced reload, and have every report accepted",
    })
  );
  yield* Console.log(
    `the pages sent their device ids and ${traffic.reports.length} reports, all accepted`
  );
  yield* endsTheNight(ana, ben);
  yield* Console.log("Ana ends the night and both players see the settle-up");
  yield* Console.log(
    `both players read the same recap: ${yield* sameRecap(ana, ben)}`
  );
  yield* sharesTheSettleUp(ben);
  yield* Console.log(
    "Ben's settle-up picture was drawn before his tap and shared inside it"
  );
  yield* watched.policyHeld.pipe(
    Effect.mapError(
      (failure) =>
        new NightFailed({
          detail: failure.message,
          step: "keep to the page's Content Security Policy",
        })
    )
  );
  yield* Console.log("neither page broke its Content Security Policy");
});

const explained = night.pipe(
  Effect.catchTag("NightFailed", (failure) =>
    watched.explain(failure.step).pipe(
      Effect.flatMap((evidence) =>
        Effect.fail(
          new NightFailed({
            detail: `${failure.detail}\n${evidence}`,
            step: failure.step,
          })
        )
      )
    )
  )
);

await Effect.runPromise(
  explained.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
