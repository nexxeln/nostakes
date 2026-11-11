import * as NodeServices from "@effect/platform-node/NodeServices";
import { Config, Console, Effect, Schema } from "effect";
import { chromium, webkit } from "playwright-core";
import type { BrowserType, Page } from "playwright-core";
import { preview } from "vite";

import { mutedBrowser, servedVite } from "./local-site.ts";
import { policyBreaks, watchPolicy } from "./page-evidence.ts";

const WEB = new URL("..", import.meta.url).pathname;

const SCROLL_STEP_PX = 240;

const SETTLE_MS = 160;

const PICTURES_TIMEOUT_MS = 15_000;

const CPU_SLOWDOWN = 4;

const FRAME_LIMIT_MS = 32;

class LandingCheckFailed extends Schema.TaggedError<
  LandingCheckFailed,
  { readonly brand: unique symbol }
>()("LandingCheckFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `The landing failed at "${this.step}": ${this.detail}. Run pnpm --filter @nostakes/web dev, clear the site's storage, and open / at that size to see it.`;
  }
}

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new LandingCheckFailed({ detail: String(cause), step }),
    try: run,
  });

const failWith = (step: string, problems: readonly string[]) =>
  problems.length === 0
    ? Effect.void
    : Effect.fail(
        new LandingCheckFailed({ detail: problems.join("; "), step })
      );

const SHIFT_WATCH = `
window.__shifts = [];
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (!entry.hadRecentInput) {
      window.__shifts.push({
        sources: (entry.sources || []).map((source) => source.node ? (source.node.className || source.node.nodeName) + "" : "?").join(", "),
        value: entry.value,
      });
    }
  }
}).observe({ buffered: true, type: "layout-shift" });
`;

const ShiftsSchema = Schema.Array(
  Schema.Struct({ sources: Schema.String, value: Schema.Number })
);

const TraceEventSchema = Schema.Struct({
  args: Schema.optional(
    Schema.Struct({
      frame_reporter: Schema.optional(Schema.Struct({ state: Schema.String })),
      name: Schema.optional(Schema.String),
    })
  ),
  dur: Schema.optional(Schema.Number),
  name: Schema.String,
  ph: Schema.String,
  pid: Schema.Number,
  tid: Schema.Number,
});

type TraceEvent = typeof TraceEventSchema.Type;

const decodeEvents = Schema.decodeUnknownSync(Schema.Array(TraceEventSchema));

const MAIN_THREAD = "CrRendererMain";

const MAIN_TASK = "ThreadControllerImpl::RunTask";

const FRAME = "PipelineReporter";

const threadOf = ({ pid, tid }: TraceEvent) => `${pid}:${tid}`;

const summary = (events: readonly TraceEvent[]) => {
  const main = new Set(
    events.flatMap((event) =>
      event.ph === "M" && event.args?.name === MAIN_THREAD
        ? [threadOf(event)]
        : []
    )
  );

  const tasks = events.flatMap((event) =>
    event.ph === "X" && event.name === MAIN_TASK && main.has(threadOf(event))
      ? [(event.dur ?? 0) / 1000]
      : []
  );

  const frames = events.flatMap((event) =>
    event.ph === "b" && event.name === FRAME
      ? [event.args?.frame_reporter?.state ?? "unknown"]
      : []
  );

  const count = (state: string) =>
    frames.filter((each) => each === state).length;

  return {
    dropped: count("STATE_DROPPED"),
    late: tasks.filter((task) => task > FRAME_LIMIT_MS),
    presented: count("STATE_PRESENTED_ALL") + count("STATE_PRESENTED_PARTIAL"),
    slowest: Math.max(0, ...tasks),
    tasks: tasks.length,
  };
};

const read = <A>(
  page: Page,
  step: string,
  code: string,
  schema: Schema.Codec<A, unknown>
) =>
  attempt(step, () => page.evaluate<unknown>(code)).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(schema)),
    Effect.mapError(
      (failure) => new LandingCheckFailed({ detail: failure.message, step })
    )
  );

interface Look {
  readonly height: number;
  readonly phone: boolean;
  readonly still: boolean;
  readonly theme: "dark" | "light";
  readonly width: number;
}

const nameOf = (look: Look) =>
  `${look.width}x${look.height} ${look.theme}${look.still ? " still" : ""}`;

const scrollToEnd = (page: Page) =>
  Effect.gen(function* scrollDown() {
    const box = yield* attempt("measure the page", () =>
      page.evaluate(() => ({
        height: innerHeight,
        total: document.documentElement.scrollHeight,
        width: innerWidth,
      }))
    );

    yield* attempt("put the pointer on the page", () =>
      page.mouse.move(box.width / 2, box.height / 2)
    );

    for (let at = 0; at < box.total; at += SCROLL_STEP_PX) {
      yield* attempt("scroll", () => page.mouse.wheel(0, SCROLL_STEP_PX));
      yield* attempt("let the scroll settle", () =>
        page.waitForTimeout(SETTLE_MS)
      );
    }
  });

const picturesDrawn = () =>
  [...document.querySelectorAll("nostakes-landing-picture")].every(
    (host) => host.shadowRoot?.querySelector(".native svg") !== null
  );

const STILL_PIECES = `[...document.querySelectorAll(".chat-link, .deal-hole, .deal-up, .ring-look")].flatMap((node) => {
  const style = getComputedStyle(node);
  const wanted = node.classList.contains("ring-look") ? "0" : "1";
  return style.opacity === wanted && style.transform === "none" && node.getAnimations().length === 0 ? [] : [node.className + " " + style.opacity + " " + style.transform];
}).concat([...document.querySelectorAll("nostakes-landing-picture")].flatMap((host) => {
  const moving = [...(host.shadowRoot?.querySelectorAll("*") ?? [])].filter((node) => node.getAnimations().length > 0);
  return moving.length === 0 ? [] : [host.getAttribute("aria-label").slice(0, 20) + " moves " + moving.length + " parts"];
}))`;

const WIDER = `[...document.querySelectorAll(".landing *")].filter((node) => !(node instanceof SVGElement) && node.getClientRects().length > 0).flatMap((node) => {
  const box = node.getBoundingClientRect();
  return box.right > innerWidth + 1 || box.left < -1 ? [node.className + " " + Math.round(box.left) + ".." + Math.round(box.right)] : [];
}).slice(0, 5)`;

const checkLook = (engine: BrowserType, origin: string, look: Look) => {
  const policy = policyBreaks();
  const name = `${engine.name()} ${nameOf(look)}`;

  return Effect.gen(function* checkOneLook() {
    const opened = yield* mutedBrowser(engine);

    const context = yield* attempt("open a context", () =>
      opened.newContext({
        colorScheme: look.theme,
        hasTouch: look.phone,
        reducedMotion: look.still ? "reduce" : "no-preference",
        viewport: { height: look.height, width: look.width },
      })
    );

    yield* watchPolicy(context);
    yield* attempt("watch layout shifts", () =>
      context.addInitScript(SHIFT_WATCH)
    );

    const page = yield* attempt("open a page", () => context.newPage());
    const crashes: string[] = [];

    page.on("pageerror", (failure) => {
      crashes.push(failure.message);
    });
    policy.listen(page, name);

    yield* attempt("open /", () => page.goto(`${origin}/`));
    yield* attempt("wait for the landing", () =>
      page.locator(".landing .hero-title").waitFor({ timeout: 20_000 })
    );
    yield* attempt("wait for the fonts", () =>
      page.evaluate(() => document.fonts.ready.then(() => true))
    );

    const open = yield* attempt("find the first Open a room", () =>
      page.locator(".hero-open").boundingBox()
    );

    yield* failWith(
      "show Open a room without scrolling",
      open !== null && open.y + open.height <= look.height
        ? []
        : [
            `${name}: the button ends at ${open === null ? "nowhere" : Math.round(open.y + open.height)}`,
          ]
    );

    yield* scrollToEnd(page);
    yield* attempt("wait for both pictures", () =>
      page.waitForFunction(picturesDrawn, undefined, {
        timeout: PICTURES_TIMEOUT_MS,
      })
    );
    yield* scrollToEnd(page);

    const wider = yield* read(
      page,
      "look for anything wider than the screen",
      WIDER,
      Schema.Array(Schema.String)
    );

    yield* failWith(`${name}: keep everything inside the screen`, wider);

    const shifts = yield* read(
      page,
      "read the layout shifts",
      "window.__shifts",
      ShiftsSchema
    );

    yield* failWith(
      `${name}: never move the layout after the first paint`,
      shifts.map(({ sources, value }) => `${value.toFixed(4)} from ${sources}`)
    );

    if (look.still) {
      const moving = yield* read(
        page,
        "read the scenes under reduced motion",
        STILL_PIECES,
        Schema.Array(Schema.String)
      );

      yield* failWith(`${name}: show every scene finished`, moving);
    }

    yield* attempt("tap the last Open a room", () =>
      page.locator(".close-open").click()
    );
    yield* attempt("reach the create form at the top", () =>
      page.waitForFunction(
        () =>
          document.querySelector(".home .text-input") !== null && scrollY === 0,
        undefined,
        { timeout: 5000 }
      )
    );

    yield* failWith(`${name}: run without errors`, crashes);
    yield* policy.held.pipe(
      Effect.mapError(
        (failure) =>
          new LandingCheckFailed({ detail: failure.message, step: name })
      )
    );
    yield* Console.log(
      `${name}: no shift, nothing wider than the screen, Open a room reached`
    );
  }).pipe(Effect.scoped);
};

const SETTLE_FIRST_MS = 3000;

const measureFrames = (origin: string, look: Look, settle: number) =>
  Effect.gen(function* measureOneLook() {
    const opened = yield* mutedBrowser(chromium);

    const context = yield* attempt("open a context", () =>
      opened.newContext({
        colorScheme: look.theme,
        hasTouch: look.phone,
        viewport: { height: look.height, width: look.width },
      })
    );

    const page = yield* attempt("open a page", () => context.newPage());

    const session = yield* attempt("open devtools", () =>
      context.newCDPSession(page)
    );

    const events: unknown[] = [];

    session.on("Tracing.dataCollected", ({ value }) => {
      events.push(...value);
    });

    yield* attempt("slow the CPU", () =>
      session.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN })
    );
    yield* attempt("open /", () => page.goto(`${origin}/`));
    yield* attempt("wait for the landing", () =>
      page.locator(".landing .hero-title").waitFor({ timeout: 30_000 })
    );
    yield* attempt("wait before scrolling", () => page.waitForTimeout(settle));

    const total = yield* attempt("measure the page", () =>
      page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
    );

    const complete = Effect.callback<"Traced">((resume) => {
      session.once("Tracing.tracingComplete", () => {
        resume(Effect.succeed("Traced"));
      });
    });

    const traced = Effect.all(
      [
        complete,
        attempt("finish the trace", () => session.send("Tracing.end")),
      ],
      { concurrency: "unbounded", discard: true }
    );

    yield* attempt("start a trace", () =>
      session.send("Tracing.start", {
        categories:
          "toplevel,devtools.timeline,disabled-by-default-devtools.timeline.frame",
        transferMode: "ReportEvents",
      })
    );
    yield* attempt("scroll the whole page like a finger", () =>
      session.send("Input.synthesizeScrollGesture", {
        gestureSourceType: look.phone ? "touch" : "mouse",
        speed: 1200,
        x: Math.round(look.width / 2),
        y: Math.round(look.height / 2),
        yDistance: -total,
      })
    );
    yield* traced;

    const seen = summary(decodeEvents(events));

    yield* Console.log(
      `${nameOf(look)} at ${CPU_SLOWDOWN}x CPU, scrolling ${settle === 0 ? "at once" : `after ${settle} ms`}: ${seen.tasks} main-thread tasks, slowest ${seen.slowest.toFixed(1)} ms, ${seen.late.length} over ${FRAME_LIMIT_MS} ms${seen.late.map((task) => ` (${task.toFixed(1)} ms)`).join("")}; ${seen.presented} frames presented, ${seen.dropped} dropped`
    );
  }).pipe(Effect.scoped);

const builtSite = Effect.acquireRelease(
  attempt(
    "serve the built site (run pnpm --filter @nostakes/web build first)",
    () =>
      preview({
        logLevel: "silent",
        preview: { port: 0, strictPort: true },
        root: WEB,
      })
  ),
  (served) => Effect.promise(() => served.close())
).pipe(
  Effect.flatMap((served) => {
    const [address] = served.resolvedUrls?.local ?? [];

    return address === undefined
      ? Effect.fail(
          new LandingCheckFailed({
            detail: "it reported no address",
            step: "serve the built site",
          })
        )
      : Effect.succeed(address.replace(/\/$/u, ""));
  })
);

const LOOKS: readonly Look[] = [
  { height: 640, phone: true, still: false, theme: "light", width: 360 },
  { height: 640, phone: true, still: false, theme: "dark", width: 360 },
  { height: 640, phone: true, still: true, theme: "light", width: 360 },
  { height: 900, phone: false, still: false, theme: "light", width: 1440 },
  { height: 900, phone: false, still: true, theme: "dark", width: 1440 },
];

const program = Effect.gen(function* checkLanding() {
  const engines = yield* Config.String("LANDING_ENGINES").pipe(
    Config.withDefault("chromium")
  );

  const frames = yield* Config.Boolean("LANDING_FRAMES").pipe(
    Config.withDefault(false)
  );

  const origin = yield* servedVite("start the web app", "WEB_PORT", {
    logLevel: "silent",
    root: WEB,
  }).pipe(
    Effect.mapError(
      (failure) =>
        new LandingCheckFailed({ detail: failure.detail, step: failure.step })
    )
  );

  const chosen = [chromium, webkit].filter((engine) =>
    engines.split(",").includes(engine.name())
  );

  yield* Effect.all(
    chosen.flatMap((engine) =>
      LOOKS.map((look) => checkLook(engine, origin, look))
    ),
    { discard: true }
  );

  if (frames) {
    const built = yield* builtSite;

    yield* Effect.all(
      LOOKS.flatMap((look) =>
        !look.still && look.theme === "light"
          ? [
              measureFrames(built, look, SETTLE_FIRST_MS),
              measureFrames(built, look, 0),
            ]
          : []
      ),
      { discard: true }
    );
  }
});

await Effect.runPromise(
  program.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
