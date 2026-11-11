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
import { watchPages } from "./page-evidence.ts";
import type { PageWatch } from "./page-evidence.ts";

const WEB_PORT = 5196;

const PHONE = { height: 844, width: 390 };

const LANDSCAPE = { height: 390, width: 844 };

const NOTCH = { bottom: 34, left: 0, right: 0, top: 47 };

const NOTCH_LANDSCAPE = { bottom: 21, left: 47, right: 47, top: 0 };

const PAGE_COLOURS = { dark: "#16141d", light: "#f6f1e8" } as const;

const TABLE = "nostakes-table";

const MISSING_ROOM = "QT8VND";

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

const IOS_FOCUS_ZOOM_BELOW_PX = 16;

const ZOOMED_IN = 2;

const PINCHED_ABOVE = 1.2;

const PINCH_AT_Y = 300;

const fieldSizes = (page: Page, screen: string) =>
  attempt(`read the text fields' font sizes on ${screen}`, () =>
    page.evaluate(() =>
      [...document.querySelectorAll("input, select, textarea")].map((field) =>
        Number(getComputedStyle(field).fontSize.replace("px", ""))
      )
    )
  ).pipe(Effect.map((sizes) => ({ screen, sizes })));

const pretendZoom = (page: Page, scale: number) =>
  attempt(`pretend the page is zoomed to ${scale}`, () =>
    page.evaluate((wanted) => {
      const viewport = globalThis.visualViewport;

      if (viewport !== null) {
        Object.defineProperty(viewport, "scale", {
          configurable: true,
          get: () => wanted,
        });
        viewport.dispatchEvent(new Event("resize"));
      }
    }, scale)
  );

const forgetPretendZoom = (page: Page) =>
  attempt("stop pretending the page is zoomed", () =>
    page.evaluate(() => {
      const viewport = globalThis.visualViewport;

      if (viewport !== null) {
        Reflect.deleteProperty(viewport, "scale");
        viewport.dispatchEvent(new Event("resize"));
      }
    })
  );

const zoomHintShown = (page: Page) =>
  attempt("look for the zoom hint", () =>
    page.evaluate(() => {
      const hint = document.querySelector(".zoom-hint");

      return hint === null ? false : getComputedStyle(hint).display !== "none";
    })
  );

const visualScale = (page: Page) =>
  attempt("read the visual viewport's scale", () =>
    page.evaluate(() => globalThis.visualViewport?.scale ?? 1)
  );

const pinchTable = (context: BrowserContext, page: Page, scaleFactor: number) =>
  attempt("open a devtools session", () => context.newCDPSession(page)).pipe(
    Effect.flatMap((session) =>
      attempt(`pinch the table by ${scaleFactor}`, () =>
        session.send("Input.synthesizePinchGesture", {
          gestureSourceType: "touch",
          relativeSpeed: 600,
          scaleFactor,
          x: PHONE.width / 2,
          y: PINCH_AT_Y,
        })
      )
    ),
    Effect.as(""),
    Effect.catchTag("PhoneCheckFailed", (failure) =>
      Effect.succeed(failure.detail)
    )
  );

const setPageScale = (
  context: BrowserContext,
  page: Page,
  pageScaleFactor: number
) =>
  attempt("open a devtools session", () => context.newCDPSession(page)).pipe(
    Effect.flatMap((session) =>
      attempt(`set the page scale to ${pageScaleFactor}`, () =>
        session.send("Emulation.setPageScaleFactor", { pageScaleFactor })
      )
    )
  );

const TABLE_TAKES_PAN_AND_PINCH = "phones-control-pinch";

const letTablePanAndPinch = (page: Page, on: boolean) =>
  attempt(on ? "let the table pan and pinch" : "give the table back", () =>
    page.evaluate(
      ([id, wanted, table]) => {
        document.querySelector(`#${id}`)?.remove();

        if (wanted) {
          const sheet = document.createElement("style");

          sheet.id = id;
          sheet.textContent = `${table} { touch-action: manipulation !important; }`;
          document.head.append(sheet);
        }
      },
      [TABLE_TAKES_PAN_AND_PINCH, on, TABLE] as const
    )
  );

const scaleAfterPinch = (page: Page) =>
  waitFor(visualScale(page), (scale) => scale > PINCHED_ABOVE);

const letsPinch = (touchAction: string) =>
  touchAction === "auto" ||
  touchAction === "manipulation" ||
  touchAction.split(" ").includes("pinch-zoom");

const touchActionsUnder = (page: Page) =>
  attempt("read touch-action under a face, the cards, the chip, the felt", () =>
    page.evaluate((table) => {
      const host = document.querySelector(table);
      const root = host?.shadowRoot;

      if (host === null || root === null || root === undefined) {
        return [];
      }

      const centreOf = (selector: string) => {
        const found = root.querySelector(selector)?.getBoundingClientRect();

        return found === undefined
          ? undefined
          : {
              x: found.left + found.width / 2,
              y: found.top + found.height / 2,
            };
      };

      const frame = host.getBoundingClientRect();

      const points = [
        ["a face", centreOf(".tile .frame")],
        ["your cards", centreOf(".hand .hc:last-child")],
        ["the chip", centreOf(".chipctl")],
        [
          "the felt",
          {
            x: frame.left + frame.width / 2,
            y: frame.top + frame.height * 0.45,
          },
        ],
      ] as const;

      return points.map(([name, point]) => {
        const values: string[] = [];

        let node: Element | null =
          point === undefined ? null : root.elementFromPoint(point.x, point.y);

        while (node !== null) {
          values.push(getComputedStyle(node).touchAction);

          const parent: Element | null = node.parentElement;
          const owner = node.getRootNode();

          node = parent ?? (owner instanceof ShadowRoot ? owner.host : null);
        }

        return { name, values };
      });
    }, TABLE)
  );

const pinchForbidden = (
  found: readonly {
    readonly name: string;
    readonly values: readonly string[];
  }[]
) =>
  found.flatMap(({ name, values }) =>
    values.every(letsPinch)
      ? []
      : [`${name}: ${values.filter((value) => value !== "auto").join(" > ")}`]
  );

const wideOverflow = (page: Page) =>
  attempt("measure the page's width", () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - globalThis.innerWidth
    )
  );

type Note<R> = (
  check: string,
  passed: boolean,
  detail: string
) => Effect.Effect<void, PhoneCheckFailed, R>;

const zoomedModeCheck = <R>(
  engineName: string,
  context: BrowserContext,
  page: Page,
  note: Note<R>
) =>
  Effect.gen(function* checkZoomedMode() {
    const realScale =
      engineName === "chromium"
        ? yield* setPageScale(context, page, ZOOMED_IN).pipe(
            Effect.andThen(
              waitFor(visualScale(page), (n) => n > PINCHED_ABOVE)
            ),
            Effect.map((scale) => scale > PINCHED_ABOVE),
            Effect.orElseSucceed(() => false)
          )
        : false;

    if (!realScale) {
      yield* pretendZoom(page, ZOOMED_IN);
    }

    yield* Effect.sleep("200 millis");

    const zoomedTouch = yield* style(page, TABLE, "touch-action");
    const zoomedHint = yield* zoomHintShown(page);
    const zoomedUnder = pinchForbidden(yield* touchActionsUnder(page));

    yield* note(
      "zoomed in, nothing under a face, your cards, the chip, or the felt stops a pinch",
      zoomedUnder.length === 0,
      zoomedUnder.join("; ") || "pan and pinch everywhere"
    );

    yield* realScale ? setPageScale(context, page, 1) : forgetPretendZoom(page);

    yield* Effect.sleep("200 millis");

    const restoredTouch = yield* style(page, TABLE, "touch-action");
    const restoredHint = yield* zoomHintShown(page);

    yield* note(
      "zoomed in, the table pans and pinches like the page and says how to get back; at its own scale it takes its gestures again",
      zoomedTouch === "manipulation" &&
        zoomedHint &&
        restoredTouch === "pinch-zoom" &&
        !restoredHint,
      `${realScale ? "page really scaled to 2" : "scale stubbed, this build ignores a page scale"}: zoomed ${zoomedTouch}, hint ${zoomedHint}; back ${restoredTouch}, hint ${restoredHint}`
    );
  });

const pinchCheck = <R>(
  engineName: string,
  context: BrowserContext,
  page: Page,
  note: Note<R>
) =>
  Effect.gen(function* checkRealPinch() {
    if (engineName === "chromium") {
      yield* letTablePanAndPinch(page, true);

      const controlPinch = yield* pinchTable(context, page, ZOOMED_IN);
      const controlScale = yield* scaleAfterPinch(page);

      yield* setPageScale(context, page, 1);
      yield* letTablePanAndPinch(page, false);
      yield* Effect.sleep("300 millis");

      if (controlScale > PINCHED_ABOVE) {
        const pinchedIn = yield* pinchTable(context, page, ZOOMED_IN);
        const inScale = yield* scaleAfterPinch(page);

        yield* Effect.sleep("200 millis");

        const pinchedTouch = yield* style(page, TABLE, "touch-action");
        const pinchedHint = yield* zoomHintShown(page);

        yield* note(
          "a pinch that starts on the table zooms the page, and the zoomed table then pans and pinches and says how to get back",
          pinchedIn === "" &&
            inScale > PINCHED_ABOVE &&
            pinchedTouch === "manipulation" &&
            pinchedHint,
          `pinched to ${inScale.toFixed(2)} ${pinchedIn}, table ${pinchedTouch}, hint ${pinchedHint}`.trim()
        );
        yield* setPageScale(context, page, 1);
      } else {
        yield* note(
          "a pinch that starts on the table zooms the page",
          true,
          `not checked: this browser build does not apply a synthesized pinch at all, since a control pinch over a table set to pan and pinch stayed at ${controlScale.toFixed(2)}${controlPinch === "" ? "" : ` (${controlPinch})`}; the touch-action and page-scale checks above still ran`
        );
      }
    } else {
      yield* note(
        "pinching the table",
        true,
        "not checked: this engine cannot synthesize a pinch"
      );
    }
  });

const zoomChecks = <R>(
  engineName: string,
  context: BrowserContext,
  page: Page,
  note: Note<R>
) =>
  zoomedModeCheck(engineName, context, page, note).pipe(
    Effect.andThen(pinchCheck(engineName, context, page, note))
  );

const phoneChecks = (engine: BrowserType, app: string, watched: PageWatch) =>
  Effect.gen(function* runPhoneChecks() {
    const name = engine.name();
    const findings: Finding[] = [];

    const note = (check: string, passed: boolean, detail: string) =>
      Effect.gen(function* noteFinding() {
        const explained = passed
          ? detail
          : `${detail}. ${yield* watched.explain(`${name}: ${check}`)}`;

        findings.push({ check, detail: explained, engine: name, passed });
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

    yield* watched.watch(host, `${name} host`);
    yield* watched.watch(guest, `${name} guest`);

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
    const homeFields = yield* fieldSizes(host, "home");

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
    const joinFields = yield* fieldSizes(guest, "the invitation");

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
      "no part of the page zooms on a double tap, the strips around the room included",
      (yield* style(host, "html", "touch-action")) === "manipulation",
      yield* style(host, "html", "touch-action")
    );
    yield* note(
      "the table keeps one-finger touches for its gestures and lets a pinch through",
      (yield* style(host, TABLE, "touch-action")) === "pinch-zoom",
      yield* style(host, TABLE, "touch-action")
    );

    const forbidding = pinchForbidden(yield* touchActionsUnder(host));

    yield* note(
      "nothing under a face, your cards, the chip, or the felt stops a pinch",
      forbidding.length === 0,
      forbidding.join("; ") || "pinch allowed at each"
    );

    const overflow = yield* wideOverflow(host);

    yield* note(
      "nothing in the room is wider than the screen, so the page starts at its own scale",
      overflow <= 0,
      `${overflow}px wider`
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
    yield* button(host, "Menu");
    yield* button(host, "Add chips");
    yield* attempt("wait for the chips field", () =>
      host.locator(".sheet input").first().waitFor({ timeout: 5000 })
    );

    const chipFields = yield* fieldSizes(host, "adding chips");

    yield* button(host, "Close");
    yield* button(host, "Menu");
    yield* attempt("open the house rules", () =>
      host.locator(".rules-card").first().click()
    );
    yield* attempt("open the blinds", () =>
      host
        .locator(".sheet")
        .getByText("Blinds", { exact: true })
        .first()
        .click()
    );
    yield* attempt("wait for the rules' number fields", () =>
      host.locator(".sheet input").first().waitFor({ timeout: 5000 })
    );

    const ruleFields = yield* fieldSizes(host, "the house rules");

    yield* button(host, "Close");

    const screens = [homeFields, joinFields, chipFields, ruleFields];

    yield* note(
      "every text field is 16px or more, so focusing one never zooms the page",
      screens.every(({ sizes }) =>
        sizes.every((size) => size >= IOS_FOCUS_ZOOM_BELOW_PX)
      ) && screens.every(({ sizes }) => sizes.length > 0),
      screens
        .map(({ screen, sizes }) => `${screen} ${sizes.join("/")}`)
        .join(", ")
    );

    yield* zoomChecks(engine.name(), hostContext, host, note);

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
    yield* button(host, "Leave");
    yield* button(host, "Leave the room");

    const left = yield* waitFor(spied(host, "locksActive"), (n) => n === 0);

    yield* note("leaving lets the screen sleep", left === 0, `${left} held`);

    const realCode = new URL(host.url()).pathname.split("/").at(-1) ?? "";

    yield* attempt("plant a pass for a room the server never had", () =>
      guest.evaluate(
        ([real, missing]) => {
          const pass = globalThis.localStorage.getItem(`nostakes.pass.${real}`);

          globalThis.localStorage.setItem(
            `nostakes.pass.${missing}`,
            (pass ?? "").replace(real, missing)
          );
        },
        [realCode, MISSING_ROOM] as const
      )
    );
    yield* attempt("the guest goes home", () =>
      guest.goto(`${app}/?mute=1`, { waitUntil: "networkidle" })
    );

    const listed = yield* waitFor(
      attempt("read the guest's rooms", () =>
        guest.locator(".room-row-code").allTextContents()
      ),
      (codes) => !codes.includes(MISSING_ROOM)
    );

    yield* note(
      "home lists the rooms you can go back to and drops one the server does not have",
      listed.join(",") === realCode,
      listed.join(",")
    );

    yield* attempt("open a table defined after its snapshot", () =>
      guest.goto(`${app}/scripts/layout/stage.html?players=3&boards=1&late=1`)
    );
    yield* attempt("wait for the late table", () =>
      guest.locator("html[data-staged]").waitFor({ state: "attached" })
    );

    const lateNames = yield* attempt("read the late table's names", () =>
      guest.locator(`${TABLE} .label .name`).allTextContents()
    );

    yield* note(
      "a table defined after its first snapshot still draws it",
      lateNames.length === 3,
      lateNames.join(",")
    );

    yield* attempt("open a moment defined after its hand", () =>
      guest.goto(`${app}/scripts/moments/stage.html?view=late`)
    );

    const lateMoment = yield* attempt("wait for the late moment", () =>
      guest
        .locator("nostakes-moment[data-moment]")
        .getAttribute("data-moment", { timeout: 10_000 })
    ).pipe(Effect.orElseSucceed(() => null));

    yield* note(
      "a moment whose hand is set before its definition arrives still calls the hand out",
      (lateMoment ?? "").includes(":Bluff:"),
      lateMoment ?? "no moment"
    );

    const broken = yield* watched.policyHeld.pipe(
      Effect.match({
        onFailure: (failure) => Option.some(failure.message),
        onSuccess: () => Option.none<string>(),
      })
    );

    yield* note(
      "keeps to the page's Content Security Policy",
      Option.isNone(broken),
      Option.getOrElse(broken, () => "no violation on either page")
    );

    return findings;
  });

const checkEngine = (engine: BrowserType, app: string) =>
  Effect.gen(function* checkOneEngine() {
    const watched = watchPages();

    return yield* phoneChecks(engine, app, watched).pipe(
      Effect.catchTag("PhoneCheckFailed", (failure) =>
        watched.explain(`${engine.name()}: ${failure.step}`).pipe(
          Effect.flatMap((evidence) =>
            Effect.fail(
              new PhoneCheckFailed({
                detail: `${failure.detail}\n${evidence}`,
                step: failure.step,
              })
            )
          )
        )
      )
    );
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
