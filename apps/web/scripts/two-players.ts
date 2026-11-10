import * as NodeServices from "@effect/platform-node/NodeServices";
import { Console, Effect, Exit, Option, Schedule, Schema, Scope } from "effect";
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";

import { localRoomServer, localWebApp, mutedBrowser } from "./local-site.ts";
import { watchPages } from "./page-evidence.ts";

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
    Effect.tap((page) =>
      Effect.sync(() => {
        watched.watch(page, name);
      })
    )
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
        .locator(`${HAND} .hand-label`)
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

const deployed = (build: string) =>
  localRoomServer(WEB_PORT, STAGE, Option.some(build)).pipe(
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

const stackOf = (page: Page, who: string) =>
  attempt(`read ${who}'s stack`, () =>
    page.locator(`${TABLE} .self .st`).textContent()
  ).pipe(
    Effect.map((text) => Number((text ?? "").replaceAll(",", ""))),
    Effect.delay("1 second")
  );

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

const night = Effect.gen(function* playOneHand() {
  const firstDeploy = yield* Scope.make();

  yield* Effect.addFinalizer(() => Scope.close(firstDeploy, Exit.void));

  const roomServer = yield* deployed(FIRST_BUILD).pipe(
    Scope.provide(firstDeploy)
  );

  const app = yield* localWebApp(WEB_PORT, roomServer);

  yield* Console.log(`web app at ${app}`);

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
  yield* showsOneCardThenTheOther(ana, ben);
  yield* Console.log("Ana shows one card, then the other, and Ben sees both");

  const deck = yield* calmDeck(ana);

  yield* Console.log(
    deck.endsWith("deck not checked")
      ? `deck: ${deck}. The server could not reach drand in time and shuffled the hand itself; an honest outage passes this check.`
      : `deck: ${deck}`
  );

  const chipsBefore =
    (yield* stackOf(ana, "Ana")) + (yield* stackOf(ben, "Ben"));

  yield* whoseTurn([ana, ben]);
  yield* Console.log("hand 2 is dealt");
  yield* click(ana, "Ana opens the menu", "Menu");
  yield* click(ana, "Ana pauses after this hand", "Pause after this hand");
  yield* click(ana, "Ana closes the menu", "Close");

  yield* Scope.close(firstDeploy, Exit.void);
  yield* Console.log(`deploying ${SECOND_BUILD} in the middle of hand 2`);

  const redeployed = yield* deployed(SECOND_BUILD);

  yield* serveBuild(ana, SECOND_BUILD);
  yield* serveBuild(ben, SECOND_BUILD);

  yield* holds(
    redeployed === roomServer,
    new NightFailed({
      detail: `it came back at ${redeployed}, not ${roomServer}, so the web app's proxy cannot reach it`,
      step: "restart the room server with the new build",
    })
  );
  yield* toldToWait(ana, "Ana");
  yield* toldToWait(ben, "Ben");
  yield* Console.log(
    "both players are told the new version loads after this hand"
  );

  const folder = yield* whoseTurn([ana, ben]);

  yield* drag(folder, HAND, 170, "flick the cards up to end hand 2");
  yield* onBuild(ana, "Ana", SECOND_BUILD);
  yield* onBuild(ben, "Ben", SECOND_BUILD);
  yield* seated(ana, "Ana");
  yield* seated(ben, "Ben");

  const chipsAfter =
    (yield* stackOf(ana, "Ana")) + (yield* stackOf(ben, "Ben"));

  yield* holds(
    chipsAfter === chipsBefore && chipsBefore > 0,
    new NightFailed({
      detail: `the seats held ${chipsBefore} chips before the new build and ${chipsAfter} after`,
      step: "keep every chip through the reload",
    })
  );
  yield* Console.log(
    `both players are back in their seats with ${chipsAfter} chips between them`
  );
  yield* click(ana, "Ana starts the game again", "Start the game");
  yield* whoseTurn([ana, ben]);
  yield* Console.log("hand 3 is dealt on the new build");
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
