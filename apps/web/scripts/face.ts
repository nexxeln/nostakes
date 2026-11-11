import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  choicesOf,
  codeFor,
  HEADWEAR,
  isPlaced,
  PARTS,
  SPECIES,
} from "@nostakes/avatar";
import type { Avatar, Part } from "@nostakes/avatar";
import { Config, Console, Effect, Option, Schema } from "effect";
import { chromium, webkit } from "playwright-core";
import type { BrowserContext, BrowserType, Page } from "playwright-core";

import { mutedBrowser, servedVite } from "./local-site.ts";
import { policyBreaks, watchPolicy } from "./page-evidence.ts";

const WEB = new URL("..", import.meta.url).pathname;

const SMALLEST_TARGET_PX = 44;

const SCRUB_STEP_PX = 34;

const MOST_STEPS_A_SWIPE = 3;

const MOST_TABS = 60;

const PLACED: ReadonlySet<string> = new Set(
  PARTS.filter((part) => isPlaced(part))
);

const PART_LABELS: Readonly<Record<Part, string>> = {
  colour: "Colour",
  extra: "Extra",
  eyes: "Eyes",
  eyewear: "Glasses",
  headwear: "Hat",
  mark: "Mark",
  mouth: "Mouth",
  neck: "Neck",
  rank: "Card",
  species: "Fish",
  suit: "Suit",
};

const START: Avatar = {
  colour: "BlueYellow",
  extra: "None",
  eyes: "Pips",
  eyewear: "None",
  headwear: "None",
  mark: "None",
  mouth: "Line",
  neck: "None",
  rank: "Ace",
  species: "GreatWhite",
  suit: "Spade",
};

const WANTED: Avatar = {
  colour: "GreenPink",
  extra: "Toothpick",
  eyes: "Sleepy",
  eyewear: "Shades",
  headwear: "Cowboy",
  mark: "Scar",
  mouth: "Grin",
  neck: "BowTie",
  rank: "Seven",
  species: "Octopus",
  suit: "Heart",
};

const BUILD_ORDER: readonly Part[] = [
  "rank",
  "mouth",
  "eyes",
  "headwear",
  "eyewear",
  "neck",
  "mark",
  "extra",
  "species",
  "colour",
  "suit",
];

const KEYBOARD_ORDER: readonly Part[] = [
  "headwear",
  "eyes",
  "mouth",
  "neck",
  "rank",
  "eyewear",
  "mark",
  "extra",
  "species",
  "colour",
  "suit",
];

const DESKTOPS: readonly (readonly [number, number])[] = [
  [1440, 900],
  [1280, 720],
];

class FaceCheckFailed extends Schema.TaggedError<
  FaceCheckFailed,
  { readonly brand: unique symbol }
>()("FaceCheckFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `The face builder failed at "${this.step}": ${this.detail}. Run pnpm --filter @nostakes/web dev, open /, tap Your face, and try the same step at that size.`;
  }
}

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new FaceCheckFailed({ detail: String(cause), step }),
    try: run,
  });

const failWith = (step: string, problems: readonly string[]) =>
  problems.length === 0
    ? Effect.void
    : Effect.fail(new FaceCheckFailed({ detail: problems.join("; "), step }));

const plantProfile = (context: BrowserContext) =>
  attempt("start from a plain face", () =>
    context.addInitScript(
      (profile) => {
        if (localStorage.getItem("nostakes.profile") === null) {
          localStorage.setItem("nostakes.profile", profile);
        }
      },
      JSON.stringify({ avatar: codeFor(START), name: "Ana" })
    )
  );

const openBuilder = (page: Page, origin: string, byKeyboard: boolean) =>
  Effect.gen(function* open() {
    yield* attempt("open the home page", () => page.goto(origin));
    yield* attempt("wait for the fonts", () =>
      page.evaluate(() => document.fonts.ready.then(() => true))
    );

    const landing = yield* attempt("look for the landing", () =>
      page.locator(".landing .hero-open").count()
    );

    if (landing > 0) {
      yield* attempt("open the create form", () =>
        page.locator(".landing .hero-open").first().click()
      );
    }

    yield* attempt("wait for the face row", () =>
      page.locator(".face-row").waitFor({ timeout: 10_000 })
    );

    if (byKeyboard) {
      yield* attempt("focus the face row", () =>
        page.locator(".face-row").focus()
      );
      yield* attempt("press Enter on the face row", () =>
        page.keyboard.press("Enter")
      );
    } else {
      yield* attempt("tap the face row", () => page.locator(".face-row").tap());
    }

    yield* attempt("wait for the builder", () =>
      page.locator(".face-builder").waitFor({ timeout: 10_000 })
    );
    yield* attempt("wait for the sheet to come to rest", () =>
      page.waitForFunction(
        () =>
          document
            .querySelector(".face-builder")
            ?.getAnimations()
            .every((animation) => animation.playState === "finished") === true
      )
    );
    yield* attempt("wait for the face to be drawn", () =>
      page.waitForFunction(
        () =>
          (document
            .querySelector("nostakes-face")
            ?.shadowRoot?.querySelectorAll("g.sheet").length ?? 0) > 3
      )
    );
  });

const wornLabel = (part: Part, choice: string) =>
  `${PART_LABELS[part]}: `.concat(
    choice
      .replaceAll(/(?<=[a-z])(?=[A-Z])/gu, " ")
      .toLowerCase()
      .replace(/^./u, (first) => first.toUpperCase())
  );

const expectedLabel = (part: Part, choice: string) => {
  if (part === "colour") {
    return wornLabel(part, choice).replace(/ (?=[a-z]+$)/u, " & ");
  }

  return part === "suit"
    ? `${wornLabel(part, choice)}s`
    : wornLabel(part, choice);
};

const waitForLabel = (page: Page, part: Part, choice: string) =>
  attempt(`see ${expectedLabel(part, choice)} beside the face`, () =>
    page.waitForFunction(
      ([selector, wanted]) =>
        document.querySelector(selector)?.getAttribute("aria-label") === wanted,
      [
        `.face-callout[data-part="${part}"]`,
        expectedLabel(part, choice),
      ] as const,
      { timeout: 4000 }
    )
  );

const waitForHeld = (page: Page, part: Part) =>
  attempt(`see ${PART_LABELS[part]} picked up`, () =>
    page.waitForFunction(
      (selector) => document.querySelector(selector) !== null,
      `.face-callout.is-held[data-part="${part}"]`,
      { timeout: 4000 }
    )
  );

const GRID = 40;

const SWIPE_COLUMNS = 16;

type Spot = "Bare" | "OtherSheet" | Part;

const pointOn = (page: Page, spot: Spot, held: Part | null) =>
  attempt("find a point on the face", () =>
    page.evaluate(
      ([wanted, picked, grid, columns]) => {
        const root = document.querySelector("nostakes-face")?.shadowRoot;
        const box = root?.querySelector(".face")?.getBoundingClientRect();

        if (root === null || root === undefined || box === undefined) {
          return null;
        }

        for (let row = 3; row < grid - 3; row += 1) {
          for (let column = 3; column < columns; column += 1) {
            const x = box.left + (box.width * column) / grid;
            const y = box.top + (box.height * row) / grid;

            const under =
              root.elementFromPoint(x, y)?.closest<SVGElement>("[data-part]")
                ?.dataset.part ?? null;

            const found =
              (wanted === "Bare" && under === null) ||
              (wanted === "OtherSheet" && under !== null && under !== picked) ||
              under === wanted;

            if (found) {
              return [x, y] as const;
            }
          }
        }

        return null;
      },
      [
        spot,
        held,
        GRID,
        spot === "Bare" || spot === "OtherSheet" ? SWIPE_COLUMNS : GRID - 3,
      ] as const
    )
  );

const heldNow = (page: Page) =>
  attempt("read which part is picked up", () =>
    page.evaluate(
      () =>
        document.querySelector<HTMLElement>(".face-callout.is-held")?.dataset
          .part ?? null
    )
  );

const wornNow = (page: Page, part: Part) =>
  attempt(`read what ${PART_LABELS[part]} says`, () =>
    page
      .locator(`.face-callout[data-part="${part}"]`)
      .getAttribute("aria-label")
  ).pipe(
    Effect.map(
      (label) =>
        choicesOf(part).find(
          (choice) => expectedLabel(part, choice) === label
        ) ?? START[part]
    )
  );

const stepsBetween = (part: Part, from: string, to: string) => {
  const choices = choicesOf(part);

  return (
    (choices.indexOf(to) - choices.indexOf(from) + choices.length) %
    choices.length
  );
};

const swipe = <E>(
  page: Page,
  context: BrowserContext,
  from: readonly [number, number],
  steps: number,
  whileDown: Effect.Effect<unknown, E>
) =>
  Effect.gen(function* swipeAcross() {
    const [x, y] = from;
    const reach = steps * SCRUB_STEP_PX + 4;

    const moves = Array.from(
      { length: 8 },
      (_, index) => ((index + 1) * reach) / 8
    );

    if (context.browser()?.browserType().name() === "chromium") {
      const session = yield* attempt("open a touch session", () =>
        context.newCDPSession(page)
      );

      yield* attempt("put a finger down", () =>
        session.send("Input.dispatchTouchEvent", {
          touchPoints: [{ x, y }],
          type: "touchStart",
        })
      );

      for (const dx of moves) {
        yield* attempt("drag the finger", () =>
          session.send("Input.dispatchTouchEvent", {
            touchPoints: [{ x: x + dx, y }],
            type: "touchMove",
          })
        );
      }

      yield* whileDown;
      yield* attempt("lift the finger", () =>
        session.send("Input.dispatchTouchEvent", {
          touchPoints: [],
          type: "touchEnd",
        })
      );
      yield* attempt("close the touch session", () => session.detach());
    } else {
      yield* attempt("press on the face", () => page.mouse.move(x, y));
      yield* attempt("hold the press", () => page.mouse.down());

      for (const dx of moves) {
        yield* attempt("drag across the face", () =>
          page.mouse.move(x + dx, y)
        );
      }

      yield* whileDown;
      yield* attempt("let go", () => page.mouse.up());
    }
  });

const pickUp = (page: Page, part: Part) =>
  Effect.gen(function* pickUpPart() {
    const held = yield* heldNow(page);

    if (held === part) {
      return false;
    }

    const faceTakesTaps = held === null || PLACED.has(held);

    const on =
      faceTakesTaps && isPlaced(part) ? yield* pointOn(page, part, null) : null;

    yield* on === null
      ? attempt(`tap ${PART_LABELS[part]} beside the face`, () =>
          page.locator(`.face-callout[data-part="${part}"]`).tap()
        )
      : attempt(`tap the ${PART_LABELS[part]} on the face`, () =>
          page.touchscreen.tap(on[0], on[1])
        );
    yield* waitForHeld(page, part);

    return on !== null;
  });

const flipByTouch = (page: Page, context: BrowserContext, part: Part) =>
  Effect.gen(function* flip() {
    let now = yield* wornNow(page, part);
    let fromOtherSheets = 0;

    while (now !== WANTED[part]) {
      const steps = Math.min(
        stepsBetween(part, now, WANTED[part]),
        MOST_STEPS_A_SWIPE
      );

      const onSheet = yield* pointOn(page, "OtherSheet", part);
      const from = onSheet ?? (yield* pointOn(page, "Bare", part));

      if (from === null) {
        return yield* new FaceCheckFailed({
          detail: "no spot on the face to swipe from",
          step: `swipe to flip ${PART_LABELS[part]}`,
        });
      }

      const choices = choicesOf(part);

      now = choices[(choices.indexOf(now) + steps) % choices.length] ?? now;
      fromOtherSheets += onSheet === null ? 0 : 1;
      yield* swipe(page, context, from, steps, waitForLabel(page, part, now));
      yield* waitForLabel(page, part, now);
      yield* waitForHeld(page, part);
    }

    return fromOtherSheets;
  });

const buildByTouch = (page: Page, context: BrowserContext) =>
  Effect.gen(function* build() {
    const touched: Part[] = [];
    let fromOtherSheets = 0;

    for (const part of BUILD_ORDER) {
      const onFace = yield* pickUp(page, part);

      if (onFace) {
        touched.push(part);
      }

      fromOtherSheets += yield* flipByTouch(page, context, part);
      yield* waitForLabel(page, part, WANTED[part]);
    }

    return { fromOtherSheets, touched };
  });

const showTray = (page: Page, part: Part) =>
  Effect.gen(function* show() {
    const shown = yield* attempt("read the tray", () =>
      page.evaluate(
        () =>
          document.querySelector<HTMLElement>(".face-choices")?.dataset.part ??
          ""
      )
    );

    if (shown !== part) {
      yield* attempt(`tap ${PART_LABELS[part]} beside the face`, () =>
        page.locator(`.face-callout[data-part="${part}"]`).tap()
      );
    }
  });

const artOverflow = (page: Page) =>
  attempt("measure the face against the sheet", () =>
    page.evaluate(() => {
      const builder = document.querySelector(".face-builder");
      const root = document.querySelector("nostakes-face")?.shadowRoot;
      const sheets = [...(root?.querySelectorAll("g.sheet") ?? [])];

      if (builder === null || sheets.length === 0) {
        return ["the face is not drawn"];
      }

      const clip = builder.getBoundingClientRect();
      const tops = sheets.map((sheet) => sheet.getBoundingClientRect().top);
      const top = Math.min(...tops);

      return top < Math.max(clip.top, 0)
        ? [`runs ${Math.ceil(Math.max(clip.top, 0) - top)} px off the top`]
        : [];
    })
  );

const tallestFaces = (page: Page, name: string) =>
  Effect.gen(function* tallest() {
    const problems: string[] = [];

    for (const species of SPECIES) {
      yield* showTray(page, "species");
      yield* attempt(`tap ${species} in the tray`, () =>
        page.locator(`#face-choice-species-${species}`).tap()
      );
      yield* waitForLabel(page, "species", species);
      yield* showTray(page, "headwear");

      for (const headwear of HEADWEAR) {
        yield* attempt(`tap ${headwear} in the tray`, () =>
          page.locator(`#face-choice-headwear-${headwear}`).tap()
        );
        yield* waitForLabel(page, "headwear", headwear);
        problems.push(
          ...(yield* artOverflow(page)).map(
            (problem) => `${species} in ${headwear}: ${problem}`
          )
        );
      }
    }

    yield* failWith(
      `${name}: fit every fish in every hat, with its card`,
      problems
    );
  });

const smallTargets = (page: Page) =>
  attempt("measure every target", () =>
    page.evaluate((least) => {
      const builder = document.querySelector(".face-builder");

      const small = [...(builder?.querySelectorAll("button") ?? [])].flatMap(
        (button) => {
          const box = button.getBoundingClientRect();

          return box.width > 0 &&
            (box.width < least - 0.5 || box.height < least - 0.5)
            ? [
                `${button.getAttribute("aria-label") ?? button.textContent} is ${Math.round(box.width)} by ${Math.round(box.height)}`,
              ]
            : [];
        }
      );

      const done = document
        .querySelector(".face-done")
        ?.getBoundingClientRect();

      return [
        ...small,
        ...(builder !== null && builder.scrollHeight > builder.clientHeight + 1
          ? [
              `the sheet scrolls (${builder.scrollHeight} in ${builder.clientHeight})`,
            ]
          : []),
        ...(done === undefined || done.bottom > innerHeight || done.top < 0
          ? ["Done is not on the screen"]
          : []),
      ];
    }, SMALLEST_TARGET_PX)
  );

const savedCode = (page: Page) =>
  attempt("read the saved face", () =>
    page.evaluate(() => localStorage.getItem("nostakes.profile") ?? "")
  ).pipe(
    Effect.map((stored) =>
      Schema.decodeOption(
        Schema.fromJsonString(Schema.Struct({ avatar: Schema.String }))
      )(stored).pipe(
        Option.map(({ avatar }) => avatar),
        Option.getOrElse(() => "")
      )
    )
  );

const sheetState = (page: Page) =>
  attempt("read where focus is", () =>
    page.evaluate(() => ({
      focus: document.activeElement?.className ?? "",
      hint:
        document
          .querySelector("nostakes-face")
          ?.shadowRoot?.querySelector(".hint")
          ?.hasAttribute("hidden") === false,
      open: document.querySelector(".face-builder") !== null,
      outsideInert:
        document.querySelector("main.page")?.hasAttribute("inert") === true,
    }))
  );

const expectSaved = (page: Page, name: string) =>
  Effect.gen(function* saved() {
    yield* attempt("wait for the builder to close", () =>
      page
        .locator(".face-builder")
        .waitFor({ state: "detached", timeout: 4000 })
    );

    const code = yield* savedCode(page);
    const after = yield* sheetState(page);

    yield* failWith(`${name}: Done saves the face shown`, [
      ...(code === codeFor(WANTED)
        ? []
        : [`saved ${code}, but the face shown was ${codeFor(WANTED)}`]),
      ...(after.focus.includes("face-row")
        ? []
        : [`focus went to "${after.focus}" instead of back to the face row`]),
      ...(after.outsideInert ? ["the page behind stayed inert"] : []),
    ]);
  });

const checkByTouch = (engine: BrowserType, origin: string) =>
  Effect.gen(function* touch() {
    const name = `${engine.name()} 360x640 by touch`;
    const browser = yield* mutedBrowser(engine);
    const policy = policyBreaks();

    const context = yield* attempt("open a phone", () =>
      browser.newContext({
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: engine.name() === "chromium",
        viewport: { height: 640, width: 360 },
      })
    );

    yield* watchPolicy(context);
    yield* plantProfile(context);

    const page = yield* attempt("open a page", () => context.newPage());

    policy.listen(page, name);
    yield* openBuilder(page, origin, false);

    const before = yield* sheetState(page);

    yield* failWith(`${name}: open the sheet`, [
      ...(before.focus.includes("face-builder")
        ? []
        : [`focus is on "${before.focus}", not the sheet`]),
      ...(before.outsideInert ? [] : ["the page behind is not inert"]),
      ...(before.hint ? [] : ["the first-touch hint is not shown"]),
      ...(yield* smallTargets(page)),
    ]);

    yield* tallestFaces(page, name);

    const { fromOtherSheets, touched } = yield* buildByTouch(page, context);
    const built = yield* sheetState(page);

    yield* failWith(`${name}: build a face`, [
      ...(built.hint
        ? ["the hint is still shown after touching the face"]
        : []),
      ...(touched.length >= 2
        ? []
        : [`only ${touched.join(", ")} could be picked up on the face itself`]),
      ...(fromOtherSheets >= 3
        ? []
        : [
            `only ${fromOtherSheets} swipes could start on another part's sheet`,
          ]),
      ...(yield* smallTargets(page)),
    ]);

    yield* attempt("tap Shuffle", () => page.locator(".face-shuffle").tap());
    yield* attempt("tap Undo", () => page.locator(".face-undo").tap());

    for (const part of PARTS) {
      yield* waitForLabel(page, part, WANTED[part]);
    }

    yield* attempt("tap Done", () => page.locator(".face-done").tap());
    yield* expectSaved(page, name);
    yield* policy.held;
    yield* attempt("close the phone", () => context.close());
    yield* Console.log(
      `${name}: every fish fits in every hat, built a face from scratch (${touched.length} parts picked up on the face, ${fromOtherSheets} swipes started on another part's sheet, labels followed each drag before release), every target at least ${SMALLEST_TARGET_PX} px, Done saved it`
    );
  }).pipe(Effect.scoped);

const focusedPart = (page: Page) =>
  attempt("read the focused control", () =>
    page.evaluate(() => {
      const active = document.activeElement;

      return {
        done: active?.classList.contains("face-done") === true,
        inside:
          active?.closest(".face-builder") !== null || active === document.body,
        part: active instanceof HTMLElement ? (active.dataset.part ?? "") : "",
      };
    })
  );

const tabTo = (
  page: Page,
  tab: string,
  step: string,
  reached: (at: { readonly done: boolean; readonly part: string }) => boolean
) =>
  Effect.gen(function* tabUntil() {
    const escaped: string[] = [];

    for (let presses = 0; presses < MOST_TABS; presses += 1) {
      const at = yield* focusedPart(page);

      if (!at.inside) {
        escaped.push(`focus left the sheet after ${presses} presses`);
      }

      if (reached(at)) {
        return escaped;
      }

      yield* attempt("press Tab", () => page.keyboard.press(tab));
    }

    return yield* new FaceCheckFailed({
      detail: `not reached in ${MOST_TABS} presses of ${tab}`,
      step,
    });
  });

const trayProblems = (page: Page) =>
  attempt("measure the tray", () =>
    page.evaluate(() => {
      const tray = document
        .querySelector(".face-tray")
        ?.getBoundingClientRect();

      const builder = document.querySelector(".face-builder");

      const done = document
        .querySelector(".face-done")
        ?.getBoundingClientRect();

      const cut = [...document.querySelectorAll(".face-choice")].filter(
        (choice) =>
          tray === undefined ||
          choice.getBoundingClientRect().bottom > tray.bottom + 1 ||
          choice.getBoundingClientRect().bottom > innerHeight
      );

      return [
        ...(cut.length === 0 ? [] : [`${cut.length} choices are cut off`]),
        ...(builder !== null && builder.scrollHeight > builder.clientHeight + 1
          ? ["the sheet scrolls"]
          : []),
        ...(done === undefined || done.bottom > innerHeight
          ? ["Done is not on the screen"]
          : []),
      ];
    })
  );

const checkByKeyboard = (
  engine: BrowserType,
  origin: string,
  [width, height]: readonly [number, number]
) =>
  Effect.gen(function* keyboard() {
    const name = `${engine.name()} ${width}x${height} by keyboard`;
    const tab = engine.name() === "webkit" ? "Alt+Tab" : "Tab";
    const browser = yield* mutedBrowser(engine);
    const policy = policyBreaks();

    const context = yield* attempt("open a desktop", () =>
      browser.newContext({ viewport: { height, width } })
    );

    yield* watchPolicy(context);
    yield* plantProfile(context);

    const page = yield* attempt("open a page", () => context.newPage());

    policy.listen(page, name);
    yield* openBuilder(page, origin, true);

    yield* failWith(`${name}: show every fish in the tray at once`, [
      ...(yield* trayProblems(page)),
      ...(yield* artOverflow(page)),
    ]);

    const escaped: string[] = [];

    for (const part of KEYBOARD_ORDER) {
      escaped.push(
        ...(yield* tabTo(
          page,
          tab,
          `${name}: reach ${PART_LABELS[part]} with ${tab}`,
          (at) => at.part === part
        ))
      );

      for (
        let presses = stepsBetween(part, START[part], WANTED[part]);
        presses > 0;
        presses -= 1
      ) {
        yield* attempt("press the right arrow", () =>
          page.keyboard.press("ArrowRight")
        );
      }

      yield* waitForLabel(page, part, WANTED[part]);
    }

    escaped.push(
      ...(yield* tabTo(
        page,
        tab,
        `${name}: reach Done with ${tab}`,
        (at) => at.done
      ))
    );
    yield* failWith(`${name}: keep focus in the sheet`, escaped);
    yield* attempt("press Enter on Done", () => page.keyboard.press("Enter"));
    yield* expectSaved(page, name);
    yield* policy.held;
    yield* attempt("close the desktop", () => context.close());
    yield* Console.log(
      `${name}: all eight fish fit the tray, reached all ${KEYBOARD_ORDER.length} parts with ${tab}, flipped each with the arrow keys, focus never left the sheet, Done saved the face`
    );
  }).pipe(Effect.scoped);

const program = Effect.gen(function* checkFaceBuilder() {
  const engines = yield* Config.String("FACE_ENGINES").pipe(
    Config.withDefault("chromium,webkit")
  );

  const origin = yield* servedVite("start the web app", "WEB_PORT", {
    logLevel: "silent",
    root: WEB,
  }).pipe(
    Effect.mapError(
      (failure) =>
        new FaceCheckFailed({ detail: failure.detail, step: failure.step })
    )
  );

  const chosen = [chromium, webkit].filter((engine) =>
    engines.split(",").includes(engine.name())
  );

  for (const engine of chosen) {
    yield* checkByTouch(engine, origin);

    for (const desktop of DESKTOPS) {
      yield* checkByKeyboard(engine, origin, desktop);
    }
  }
});

await Effect.runPromise(
  program.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
