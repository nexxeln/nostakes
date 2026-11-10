import * as NodeServices from "@effect/platform-node/NodeServices";
import { PING_FRAME, PING_INTERVAL_MS } from "@nostakes/protocol";
import {
  Config,
  Console,
  Effect,
  Option,
  pipe,
  Schedule,
  Schema,
} from "effect";
import { chromium, webkit } from "playwright-core";
import type {
  Browser,
  BrowserContext,
  BrowserType,
  Page,
} from "playwright-core";

import { localSite, mutedBrowser } from "./local-site.ts";

const WEB_PORT = 5196;

const PHONE = { height: 844, width: 390 };

const LANDSCAPE = { height: 390, width: 844 };

const NOTCH = { bottom: 34, left: 0, right: 0, top: 47 };

const NOTCH_LANDSCAPE = { bottom: 21, left: 47, right: 47, top: 0 };

const PAGE_COLOURS = { dark: "#0f1012", light: "#f4f1ea" } as const;

const TABLE = "nostakes-table";

class PhoneCheckFailed extends Schema.TaggedError<
  PhoneCheckFailed,
  { readonly brand: unique symbol }
>()("PhoneCheckFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `The phone check failed at "${this.step}": ${this.detail}. Open the app on a phone-sized window and repeat the step to see it.`;
  }
}

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new PhoneCheckFailed({ detail: String(cause), step }),
    try: run,
  });

interface Finding {
  readonly engine: string;
  readonly check: string;
  readonly passed: boolean;
  readonly detail: string;
}

const installPhoneSpies = () => {
  const counts = { locksActive: 0, locksRequested: 0 };
  const native = "wakeLock" in navigator;
  const held = new Set<{ readonly release: () => Promise<void> }>();

  const publish = () => {
    const root = document.documentElement;

    root.dataset.nativeWakeLock = String(native);
    root.dataset.locksActive = String(counts.locksActive);
    root.dataset.locksRequested = String(counts.locksRequested);
  };

  const count = (name: keyof typeof counts, by: number) => {
    counts[name] += by;
    publish();
  };

  document.addEventListener("DOMContentLoaded", publish);
  globalThis.localStorage.setItem("nostakes.sound", "off");
  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    value: {
      request: () => {
        let released = false;

        const sentinel = {
          release: () => {
            if (!released) {
              released = true;
              held.delete(sentinel);
              count("locksActive", -1);
            }

            return Promise.resolve();
          },
        };

        held.add(sentinel);
        count("locksRequested", 1);
        count("locksActive", 1);

        return Promise.resolve(sentinel);
      },
    },
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      for (const sentinel of held) {
        void sentinel.release();
      }
    }
  });
};

const spied = (page: Page, name: string) =>
  attempt(`read ${name}`, () =>
    page.evaluate(
      (key) => Number(document.documentElement.dataset[key] ?? "0"),
      name
    )
  );

const nativeWakeLock = (page: Page) =>
  attempt("read the native wake lock", () =>
    page.evaluate(
      () => document.documentElement.dataset.nativeWakeLock === "true"
    )
  );

const waitFor = <A>(
  read: Effect.Effect<A, PhoneCheckFailed>,
  done: (value: A) => boolean
) =>
  read.pipe(
    Effect.repeat({
      schedule: Schedule.spaced("100 millis"),
      times: 80,
      until: done,
    })
  );

const showPage = (page: Page, state: "hidden" | "visible") =>
  attempt(`make the page ${state}`, () =>
    page.evaluate((wanted) => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => wanted,
      });
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => wanted === "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    }, state)
  );

const phoneContext = (opened: Browser, engine: string) =>
  attempt(`open a phone in ${engine}`, () =>
    opened.newContext({
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: engine === "chromium",
      viewport: PHONE,
    })
  ).pipe(
    Effect.tap((context) =>
      attempt("install the spies", () =>
        context.addInitScript(installPhoneSpies, PING_FRAME)
      )
    )
  );

const button = (page: Page, name: string | RegExp) =>
  attempt(`press ${String(name)}`, () =>
    page.getByRole("button", { exact: true, name }).first().click()
  );

const sitDown = (page: Page, who: string) =>
  Effect.gen(function* takeASeat() {
    yield* attempt(`${who} taps an empty seat`, () =>
      page.locator(`${TABLE} [aria-label^="Take seat"]`).first().click()
    );
    yield* button(page, "Sit down");
    yield* attempt(`${who} is seated`, () =>
      page
        .locator(`${TABLE} .self:not(.gone)`)
        .waitFor({ state: "attached", timeout: 15_000 })
    );
  });

const style = (page: Page, selector: string, property: string) =>
  attempt(`read ${property} of ${selector}`, () =>
    page.evaluate(
      ([target, name]) => {
        const node = document.querySelector(target);

        return node === null
          ? "missing"
          : getComputedStyle(node).getPropertyValue(name).trim();
      },
      [selector, property] as const
    )
  );

const themeColours = (page: Page) =>
  attempt("read the theme colours", () =>
    page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLMetaElement>(
          'meta[name="theme-color"]'
        ),
      ].map(({ content }) => content)
    )
  );

const box = (page: Page, selector: string) =>
  attempt(`measure ${selector}`, () =>
    page.locator(selector).first().boundingBox()
  ).pipe(
    Effect.flatMap((found) =>
      found === null
        ? Effect.fail(
            new PhoneCheckFailed({ detail: "not on screen", step: selector })
          )
        : Effect.succeed(found)
    )
  );

const ManifestJson = Schema.fromJsonString(
  Schema.Struct({
    display: Schema.String,
    icons: Schema.Array(Schema.Struct({ src: Schema.String })),
  })
);

const manifestOf = (page: Page) =>
  Effect.gen(function* readManifest() {
    const href = yield* attempt("find the manifest", () =>
      page.locator('link[rel="manifest"]').getAttribute("href")
    );

    const response = yield* attempt("fetch the manifest", () =>
      page.request.get(new URL(href ?? "/missing", page.url()).href)
    );

    const text = yield* attempt("read the manifest", () => response.text());

    return {
      manifest: Schema.decodeUnknownOption(ManifestJson)(text),
      type: response.headers()["content-type"] ?? "",
    };
  });

const insetsFor = (context: BrowserContext, page: Page, insets: typeof NOTCH) =>
  attempt("open a devtools session", () => context.newCDPSession(page)).pipe(
    Effect.flatMap((session) =>
      attempt("emulate the notch", () =>
        session.send("Emulation.setSafeAreaInsetsOverride", { insets })
      )
    ),
    Effect.as(true),
    Effect.orElseSucceed(() => false)
  );

const checkEngine = (engine: BrowserType, app: string) =>
  Effect.gen(function* phoneChecks() {
    const name = engine.name();
    const findings: Finding[] = [];

    const note = (check: string, passed: boolean, detail: string) =>
      Effect.sync(() => {
        findings.push({ check, detail, engine: name, passed });
      });

    const opened = yield* mutedBrowser(engine);
    const hostContext = yield* phoneContext(opened, name);
    const guestContext = yield* phoneContext(opened, name);

    const host = yield* attempt("open the host's page", () =>
      hostContext.newPage()
    );

    const guest = yield* attempt("open the guest's page", () =>
      guestContext.newPage()
    );

    const pings = { sent: 0 };

    host.on("websocket", (socket) => {
      socket.on("framesent", ({ payload }) => {
        if (payload === PING_FRAME) {
          pings.sent += 1;
        }
      });
    });

    yield* attempt("open the home page", () =>
      host.goto(`${app}/?mute=1`, { waitUntil: "networkidle" })
    );

    const { manifest, type } = yield* manifestOf(host);

    yield* note(
      "manifest opens standalone with three icons",
      Option.exists(
        manifest,
        ({ display, icons }) => display === "standalone" && icons.length === 3
      ),
      `type ${type}`
    );

    const lightColours = yield* themeColours(host);

    yield* note(
      "theme-color names both schemes before a choice",
      lightColours.join(",") === `${PAGE_COLOURS.light},${PAGE_COLOURS.dark}`,
      lightColours.join(",")
    );
    yield* attempt("type the host's name", () =>
      host.getByPlaceholder("Name").fill("Ana")
    );
    yield* button(host, "Open a room");
    yield* attempt("land in the room", () =>
      host.waitForURL(/\/r\/[2-9A-Z]{6}$/u)
    );
    yield* attempt("the guest opens the link", () =>
      guest.goto(`${host.url()}?mute=1`)
    );
    yield* attempt("type the guest's name", () =>
      guest.getByPlaceholder("Name").fill("Ben")
    );
    yield* button(guest, "Join the room");
    yield* sitDown(host, "the host");
    yield* sitDown(guest, "the guest");
    yield* note(
      "no wake lock while the game waits",
      (yield* spied(host, "locksActive")) === 0,
      "seated, not started"
    );
    yield* button(host, "Start the game");

    const awake = yield* waitFor(spied(host, "locksActive"), (n) => n === 1);

    yield* note(
      "wake lock held in a running game",
      awake === 1,
      `${awake} held`
    );
    yield* note(
      "the room cannot pull to refresh or bounce",
      (yield* style(host, "html", "overscroll-behavior-y")) === "none",
      yield* style(host, "html", "overscroll-behavior-y")
    );
    yield* note(
      "the room selects no text",
      (yield* style(host, ".room", "user-select")) === "none" ||
        (yield* style(host, ".room", "-webkit-user-select")) === "none",
      `${yield* style(host, ".room", "user-select")} / ${yield* style(host, ".room", "-webkit-user-select")}`
    );
    yield* note(
      "the room never zooms on a double tap",
      (yield* style(host, ".room", "touch-action")) === "manipulation",
      yield* style(host, ".room", "touch-action")
    );
    yield* note(
      "the table takes every touch for its gestures",
      (yield* style(host, TABLE, "touch-action")) === "none",
      yield* style(host, TABLE, "touch-action")
    );

    const keyHints = yield* attempt("read the key hints", () =>
      host
        .locator(`${TABLE} .keys`)
        .evaluateAll((nodes) =>
          nodes.map((node) => getComputedStyle(node).display)
        )
    );

    yield* note(
      "a touch phone shows no key hints",
      keyHints.length > 0 && keyHints.every((display) => display === "none"),
      keyHints.join(",")
    );

    const callout = yield* style(host, ".room", "-webkit-touch-callout");

    yield* note(
      "no long-press callout in the room",
      callout === "none" || callout === "",
      callout === "" ? "not checked: this engine has no callout" : callout
    );

    yield* button(host, "Menu");
    yield* button(host, "Sit out");

    const satOut = yield* waitFor(spied(host, "locksActive"), (n) => n === 0);

    yield* note(
      "sitting out lets the screen sleep",
      satOut === 0,
      `${satOut} held`
    );
    yield* button(host, "Sit back in");

    const backIn = yield* waitFor(spied(host, "locksActive"), (n) => n === 1);

    yield* note(
      "sitting back in keeps it awake",
      backIn === 1,
      `${backIn} held`
    );
    yield* button(host, "Close");
    yield* showPage(host, "hidden");

    const hidden = yield* waitFor(spied(host, "locksActive"), (n) => n === 0);

    yield* showPage(host, "visible");

    const shown = yield* waitFor(spied(host, "locksActive"), (n) => n === 1);

    yield* note(
      "a hidden tab lets go, and takes the lock again when shown",
      hidden === 0 && shown === 1,
      `hidden ${hidden}, shown ${shown}`
    );
    yield* Effect.sleep("500 millis");

    const pingsBefore = pings.sent;

    yield* showPage(host, "visible");

    const pingsAfter = yield* waitFor(
      Effect.sync(() => pings.sent),
      (n) => n > pingsBefore
    );

    yield* note(
      "showing the page wakes the client, which probes the line at once",
      pingsAfter > pingsBefore,
      `pings ${pingsBefore} then ${pingsAfter}, the interval is ${PING_INTERVAL_MS / 1000}s`
    );
    yield* button(host, "Menu");
    yield* button(host, "Use the dark theme");
    yield* note(
      "choosing dark paints the browser chrome dark",
      (yield* themeColours(host)).every(
        (colour) => colour === PAGE_COLOURS.dark
      ),
      (yield* themeColours(host)).join(",")
    );
    yield* button(host, "Use the light theme");
    yield* note(
      "choosing light paints it light",
      (yield* themeColours(host)).every(
        (colour) => colour === PAGE_COLOURS.light
      ),
      (yield* themeColours(host)).join(",")
    );
    yield* button(host, "Close");

    const emulated = yield* insetsFor(hostContext, host, NOTCH);

    if (emulated) {
      const header = yield* box(host, ".room-header");
      const table = yield* box(host, TABLE);

      yield* note(
        "portrait notch: the bar clears the status bar and the table clears the home indicator",
        header.height >= NOTCH.top + 40 &&
          table.y + table.height <= PHONE.height - NOTCH.bottom + 1,
        `bar ${header.height}px, table ends at ${table.y + table.height}px`
      );
      yield* attempt("turn the phone", () => host.setViewportSize(LANDSCAPE));
      yield* insetsFor(hostContext, host, NOTCH_LANDSCAPE);
      yield* Effect.sleep("300 millis");

      const turned = yield* box(host, TABLE);

      yield* note(
        "landscape notch: the table keeps clear of both sides",
        turned.x >= NOTCH_LANDSCAPE.left - 1 &&
          turned.x + turned.width <=
            LANDSCAPE.width - NOTCH_LANDSCAPE.right + 1,
        `table from ${turned.x}px to ${turned.x + turned.width}px`
      );
    } else {
      yield* note(
        "safe-area insets",
        true,
        "not checked: this engine cannot emulate a notch"
      );
    }

    yield* note(
      "the engine has its own wake lock",
      true,
      (yield* nativeWakeLock(host)) ? "yes" : "no, the app skips it"
    );
    yield* button(host, "Menu");
    yield* button(host, "Leave the room");

    const left = yield* waitFor(spied(host, "locksActive"), (n) => n === 0);

    yield* note("leaving lets the screen sleep", left === 0, `${left} held`);

    return findings;
  }).pipe(Effect.scoped);

const program = Effect.gen(function* checkPhones() {
  const { app } = yield* localSite(WEB_PORT, "verify_phones");

  const engines = yield* Config.String("PHONE_ENGINES").pipe(
    Config.withDefault("chromium,webkit")
  );

  const chosen = [chromium, webkit].filter((engine) =>
    engines.split(",").includes(engine.name())
  );

  const findings = (yield* pipe(
    chosen,
    Effect.forEach((engine) => checkEngine(engine, app))
  )).flat();

  yield* Effect.forEach(
    findings,
    ({ check, detail, engine, passed }) =>
      Console.log(
        `${passed ? "ok  " : "FAIL"} ${engine}: ${check} (${detail})`
      ),
    { discard: true }
  );

  const failed = findings.filter(({ passed }) => !passed);

  return failed.length === 0
    ? yield* Effect.void
    : yield* new PhoneCheckFailed({
        detail: failed
          .map(({ check, engine }) => `${engine}: ${check}`)
          .join("; "),
        step: "phone behaviour",
      });
});

await Effect.runPromise(
  program.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
