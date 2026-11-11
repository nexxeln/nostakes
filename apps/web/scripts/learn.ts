import * as NodeServices from "@effect/platform-node/NodeServices";
import { Config, Console, Effect, Schema } from "effect";
import { chromium, webkit } from "playwright-core";
import type { BrowserType, Page } from "playwright-core";

import { mutedBrowser, servedVite } from "./local-site.ts";
import { policyBreaks, watchPolicy } from "./page-evidence.ts";

const WEB = new URL("..", import.meta.url).pathname;

const PAGE = "/learn.html";

const STEP_TIMEOUT_MS = 6000;

const READING_MS = 700;

const HEADINGS = [
  "How to play poker",
  "What happens in a hand",
  "What you can do on your turn",
  "What beats what",
  "Four habits that keep your chips",
  "What the hands left out",
  "Table manners",
  "Words you will hear",
  "Play with friends",
];

const RANKS = [
  "Straight flush",
  "Four of a kind",
  "Full house",
  "Flush",
  "Straight",
  "Three of a kind",
  "Two pair",
  "One pair",
  "High card",
];

class LearnCheckFailed extends Schema.TaggedError<
  LearnCheckFailed,
  { readonly brand: unique symbol }
>()("LearnCheckFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `The how-to-play guide failed at "${this.step}": ${this.detail}. Run pnpm --filter @nostakes/web dev and open /learn.html at that size to see it.`;
  }
}

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new LearnCheckFailed({ detail: String(cause), step }),
    try: run,
  });

const failWith = (step: string, problems: readonly string[]) =>
  problems.length === 0
    ? Effect.void
    : Effect.fail(new LearnCheckFailed({ detail: problems.join("; "), step }));

const WATCH = `
window.__shifts = [];
window.__shiftsFrom = Infinity;
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (!entry.hadRecentInput && entry.startTime >= globalThis.__shiftsFrom) {
      const box = (rect) => [rect.x, rect.y, rect.width, rect.height].map(Math.round).join(" ");
      const beat = document.querySelector("[data-lesson]")?.dataset.beat ?? "no beat";
      const moved = (entry.sources || []).map((source) => (source.node ? (source.node.className || source.node.nodeName) + "" : "?") + " from " + box(source.previousRect) + " to " + box(source.currentRect)).join(", ");
      globalThis.__shifts.push(entry.value.toFixed(4) + " at " + beat + ", " + Math.round(entry.startTime - globalThis.__shiftsFrom) + " ms in: " + moved);
    }
  }
}).observe({ buffered: true, type: "layout-shift" });
window.__sent = [];
Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
Object.defineProperty(navigator, "share", {
  configurable: true,
  value: (data) => {
    const [file] = data.files || [];
    window.__sent.push(file ? "file " + file.name + " " + file.type + " " + file.size : "link " + data.url);
    return Promise.resolve();
  },
});
`;

const TextsSchema = Schema.Array(Schema.String);

const texts = (page: Page, step: string, name: "__sent" | "__shifts") =>
  attempt(step, () =>
    page.evaluate((key) => {
      const kept: unknown = Object.getOwnPropertyDescriptor(
        globalThis,
        key
      )?.value;

      return kept;
    }, name)
  ).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(TextsSchema)),
    Effect.mapError(
      (failure) => new LearnCheckFailed({ detail: failure.message, step })
    )
  );

type Gesture = "Drag" | "Flick" | "Next" | "Peek" | "Tap";

interface Choice {
  readonly gesture: string;
  readonly to: string;
}

const beatNow = (page: Page) =>
  attempt("read the beat", () =>
    page.evaluate(
      () =>
        document.querySelector<HTMLElement>("[data-lesson]")?.dataset.beat ?? ""
    )
  );

const choicesNow = (page: Page) =>
  attempt("read the choices", () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".choices button")].map(
        (each): Choice => ({
          gesture: each.dataset.gesture ?? "",
          to: each.dataset.to ?? "",
        })
      )
    )
  );

const arrivedAt = (page: Page, beat: string, how: string) =>
  attempt(`reach ${beat} by ${how}`, () =>
    page.waitForFunction(
      (wanted) =>
        document.querySelector<HTMLElement>("[data-lesson]")?.dataset.beat ===
        wanted,
      beat,
      { timeout: STEP_TIMEOUT_MS }
    )
  );

const middleOf = (page: Page, selector: string) =>
  attempt(`find ${selector}`, () => page.locator(selector).boundingBox()).pipe(
    Effect.flatMap((box) =>
      box === null
        ? Effect.fail(
            new LearnCheckFailed({
              detail: `${selector} has no box`,
              step: "find where to touch",
            })
          )
        : Effect.succeed({
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
          })
    )
  );

interface Driver {
  readonly back: (page: Page) => Effect.Effect<unknown, LearnCheckFailed>;
  readonly make: (
    page: Page,
    gesture: Gesture
  ) => Effect.Effect<unknown, LearnCheckFailed>;
  readonly name: string;
}

const pressAndLift = (page: Page, selector: string, rise: number) =>
  Effect.gen(function* pressThenLift() {
    const at = yield* middleOf(page, selector);

    yield* attempt(`reach ${selector}`, () => page.mouse.move(at.x, at.y));
    yield* attempt(`press ${selector}`, () => page.mouse.down());
    yield* attempt(`lift halfway from ${selector}`, () =>
      page.mouse.move(at.x, at.y - rise / 2, { steps: 4 })
    );
    yield* attempt(`lift from ${selector}`, () =>
      page.mouse.move(at.x, at.y - rise, { steps: 4 })
    );
    yield* attempt(`hold ${selector}`, () => page.waitForTimeout(220));
    yield* attempt(`let go of ${selector}`, () => page.mouse.up());
  });

const tapChip = (page: Page, touch: boolean) =>
  Effect.gen(function* tapTheChip() {
    const at = yield* middleOf(page, ".chipctl");

    yield* attempt("tap the chip", () =>
      touch ? page.touchscreen.tap(at.x, at.y) : page.mouse.click(at.x, at.y)
    );
  });

const byPointer = (touch: boolean): Driver => ({
  back: (page) =>
    attempt("tap Back", () => page.locator(".controls .step").first().click()),
  make: (page, gesture) => {
    if (gesture === "Peek") {
      return pressAndLift(page, ".hand", 0);
    }

    if (gesture === "Drag") {
      return pressAndLift(page, ".chipctl", 260);
    }

    return gesture === "Flick"
      ? pressAndLift(page, ".hand", 100)
      : tapChip(page, touch);
  },
  name: touch ? "touch" : "mouse",
});

const KEYS: Readonly<Record<Gesture, string>> = {
  Drag: "r",
  Flick: "f",
  Next: "Enter",
  Peek: " ",
  Tap: "c",
};

const byKeys: Driver = {
  back: (page) =>
    attempt("press the left arrow", () => page.keyboard.press("ArrowLeft")),
  make: (page, gesture) =>
    attempt(`press the key for ${gesture}`, () =>
      page.keyboard.press(KEYS[gesture], {
        delay: gesture === "Peek" ? 260 : 0,
      })
    ),
  name: "keys",
};

const isGesture = (text: string): text is Gesture =>
  text === "Drag" ||
  text === "Flick" ||
  text === "Next" ||
  text === "Peek" ||
  text === "Tap";

const explore = (
  page: Page,
  driver: Driver,
  seen: Set<string>
): Effect.Effect<number, LearnCheckFailed> =>
  Effect.gen(function* exploreFromHere() {
    const here = yield* beatNow(page);

    if (seen.has(here)) {
      return 0;
    }

    seen.add(here);

    const choices = yield* choicesNow(page);
    let taken = 0;

    for (const choice of choices) {
      if (!isGesture(choice.gesture)) {
        return yield* new LearnCheckFailed({
          detail: `${here} offers "${choice.gesture}"`,
          step: "read a choice's gesture",
        });
      }

      yield* driver.make(page, choice.gesture);
      yield* arrivedAt(page, choice.to, `${driver.name} from ${here}`);
      taken += 1 + (yield* explore(page, driver, seen));
      yield* driver.back(page);
      yield* arrivedAt(page, here, `going back with ${driver.name}`);
    }

    return taken;
  });

const settled = (page: Page) =>
  attempt("wait for the table's moves to arrive", () =>
    page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>("[data-lesson]")?.dataset
          .arriving === undefined,
      undefined,
      { timeout: STEP_TIMEOUT_MS }
    )
  );

const READ_SLOWLY = /^(?:Intro|Recap|Whole\..+)$/u;

const readToTheEnd = (
  page: Page,
  reads: boolean
): Effect.Effect<void, LearnCheckFailed> =>
  Effect.gen(function* readOn() {
    const beat = yield* beatNow(page);

    if (reads && READ_SLOWLY.test(beat)) {
      yield* settled(page);
      yield* attempt("read the beat without touching the page", () =>
        page.waitForTimeout(READING_MS)
      );
    }

    if (beat !== "Recap") {
      yield* attempt("tap Skip", () =>
        page.locator(".controls .step").last().click()
      );
      yield* readToTheEnd(page, reads);
    }
  });

interface Look {
  readonly driver: Driver;
  readonly everyChoice: boolean;
  readonly height: number;
  readonly reads: boolean;
  readonly still: boolean;
  readonly theme: "dark" | "light";
  readonly touch: boolean;
  readonly width: number;
}

const LOOKS: readonly Look[] = [
  {
    driver: byPointer(true),
    everyChoice: true,
    height: 640,
    reads: true,
    still: false,
    theme: "light",
    touch: true,
    width: 360,
  },
  {
    driver: byKeys,
    everyChoice: true,
    height: 900,
    reads: false,
    still: false,
    theme: "dark",
    touch: false,
    width: 1440,
  },
  {
    driver: byPointer(false),
    everyChoice: false,
    height: 844,
    reads: false,
    still: true,
    theme: "dark",
    touch: false,
    width: 390,
  },
];

const checkTheEnd = (page: Page, name: string, reads: boolean) =>
  Effect.gen(function* checkRecap() {
    yield* readToTheEnd(page, reads);
    yield* attempt("see the recap", () =>
      page.locator(".recap h2").waitFor({ state: "visible", timeout: 4000 })
    );

    const door = yield* attempt("read Open a room", () =>
      page.locator(".recap a.button").getAttribute("href")
    );

    yield* attempt("tap Keep the card", () =>
      page.getByRole("button", { name: "Keep the card" }).click()
    );
    yield* attempt("wait for the card to reach the share sheet", () =>
      page.waitForFunction(
        () => {
          const sent: unknown = Object.getOwnPropertyDescriptor(
            globalThis,
            "__sent"
          )?.value;

          return Array.isArray(sent) && sent.length > 0;
        },
        undefined,
        { timeout: 20_000 }
      )
    );
    yield* attempt("tap Send to a friend", () =>
      page.getByRole("button", { name: "Send to a friend" }).click()
    );
    yield* attempt("open What beats what", () =>
      page.locator(".recap").getByText("What beats what").click()
    );

    const rows = yield* attempt("count the ranking", () =>
      page.locator("dialog.ranks[open] .rank b").allTextContents()
    );

    yield* attempt("close the ranking", () => page.keyboard.press("Escape"));

    const sent = yield* texts(page, "read what was shared", "__sent");

    yield* failWith(`${name}: end on the recap`, [
      ...(door === "/" ? [] : [`Open a room leads to ${door}`]),
      ...(rows.join("|") === RANKS.join("|")
        ? []
        : [`the ranking sheet lists ${rows.join(", ")}`]),
      ...(sent.some((each) =>
        /^file nostakes-what-beats-what\.png image\/png \d{5,}$/u.test(each)
      )
        ? []
        : [`Keep shared ${sent.join(", ")}`]),
      ...(sent.some((each) => /^link http.+\/learn$/u.test(each))
        ? []
        : [`Send shared ${sent.join(", ")}`]),
    ]);
  });

const checkLook = (engine: BrowserType, origin: string, look: Look) => {
  const policy = policyBreaks();
  const name = `${engine.name()} ${look.width}x${look.height} ${look.theme}${look.still ? " reduced motion" : ""} by ${look.driver.name}`;

  return Effect.gen(function* checkOneLook() {
    const opened = yield* mutedBrowser(engine);

    const context = yield* attempt("open a context", () =>
      opened.newContext({
        colorScheme: look.theme,
        hasTouch: look.touch,
        reducedMotion: look.still ? "reduce" : "no-preference",
        viewport: { height: look.height, width: look.width },
      })
    );

    yield* watchPolicy(context);
    yield* attempt("watch shifts and the share sheet", () =>
      context.addInitScript(WATCH)
    );

    const page = yield* attempt("open a page", () => context.newPage());
    const crashes: string[] = [];

    page.on("pageerror", (failure) => {
      crashes.push(failure.message);
    });
    policy.listen(page, name);
    yield* attempt("open the guide", () => page.goto(`${origin}${PAGE}`));
    yield* attempt("wait for the table", () =>
      page.locator(".chipctl").waitFor({ timeout: 20_000 })
    );
    yield* attempt("wait for the fonts", () =>
      page.evaluate(() => document.fonts.ready.then(() => true))
    );

    yield* attempt("wait for the page's own styles", () =>
      page.waitForFunction(
        () => getComputedStyle(document.body).marginLeft === "0px",
        undefined,
        { timeout: 20_000 }
      )
    );
    yield* attempt("count shifts from the first styled frame on", () =>
      page.evaluate(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            Object.defineProperty(globalThis, "__shiftsFrom", {
              configurable: true,
              value: performance.now(),
            });
          });
        });
      })
    );
    yield* attempt("wait for that frame", () =>
      page.waitForFunction(
        () => {
          const from: unknown = Object.getOwnPropertyDescriptor(
            globalThis,
            "__shiftsFrom"
          )?.value;

          return Number.isFinite(from);
        },
        undefined,
        { timeout: 20_000 }
      )
    );

    const taken = look.everyChoice
      ? yield* explore(page, look.driver, new Set())
      : 0;

    yield* checkTheEnd(page, name, look.reads);

    const shifts =
      engine.name() === "chromium"
        ? yield* texts(page, "read the layout shifts", "__shifts")
        : [];

    yield* policy.held.pipe(
      Effect.mapError(
        (failure) =>
          new LearnCheckFailed({
            detail: failure.message,
            step: `${name}: keep the page's policy`,
          })
      )
    );
    yield* failWith(`${name}: play every line without a fault`, [
      ...crashes,
      ...shifts.map((shift) => `layout shift: ${shift}`),
    ]);
    yield* Console.log(
      `${name}: ${look.everyChoice ? `took each of the ${taken} choices once and came back from it` : "skipped to the end"}, then kept the card and sent the link`
    );
  }).pipe(Effect.scoped);
};

const checkWithoutScripts = (engine: BrowserType, origin: string) =>
  Effect.gen(function* readWithScriptsOff() {
    const opened = yield* mutedBrowser(engine);

    const context = yield* attempt("open a context without scripts", () =>
      opened.newContext({
        javaScriptEnabled: false,
        viewport: { height: 640, width: 360 },
      })
    );

    const page = yield* attempt("open a page", () => context.newPage());

    yield* attempt("open the guide", () => page.goto(`${origin}${PAGE}`));

    const headings = yield* attempt("read the headings", () =>
      page.locator("h1, h2").allTextContents()
    );

    const ranking = yield* attempt("read the ranking", () =>
      page.locator(".ranked .rank b").allTextContents()
    );

    const habits = yield* attempt("count the habits", () =>
      page.locator(".guide h3").count()
    );

    const door = yield* attempt("find Open a room", () =>
      page.locator('.guide a.button[href="/"]').count()
    );

    yield* failWith(`${engine.name()}: read the guide with scripts off`, [
      ...(headings.join("|") === HEADINGS.join("|")
        ? []
        : [`the headings are ${headings.join(", ")}`]),
      ...(ranking.join("|") === RANKS.join("|")
        ? []
        : [`the ranking is ${ranking.join(", ")}`]),
      ...(habits >= 4 ? [] : [`${habits} habits`]),
      ...(door === 1 ? [] : ["no Open a room"]),
    ]);
    yield* Console.log(
      `${engine.name()}: with scripts off the guide reads as ${headings.length} headings, the ranking, and the habits`
    );
  }).pipe(Effect.scoped);

const program = Effect.gen(function* checkLearn() {
  const engines = yield* Config.String("LEARN_ENGINES").pipe(
    Config.withDefault("chromium")
  );

  const origin = yield* servedVite("start the web app", "WEB_PORT", {
    logLevel: "silent",
    root: WEB,
  }).pipe(
    Effect.mapError(
      (failure) =>
        new LearnCheckFailed({ detail: failure.detail, step: failure.step })
    )
  );

  const chosen = [chromium, webkit].filter((engine) =>
    engines.split(",").includes(engine.name())
  );

  yield* Effect.all(
    chosen.flatMap((engine) => [
      checkWithoutScripts(engine, origin),
      ...LOOKS.map((look) => checkLook(engine, origin, look)),
    ]),
    { discard: true }
  );
});

await Effect.runPromise(
  program.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
