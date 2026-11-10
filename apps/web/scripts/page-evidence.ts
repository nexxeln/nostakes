import { Console, DateTime, Effect, Option, pipe, Schema } from "effect";
import * as FileSystem from "effect/FileSystem";
import type { Page, WebSocket } from "playwright-core";

const EVIDENCE_ROOT = "/tmp/nostakes-soak-web-";

const KEPT_MOMENTS = 120;

const TEXT_LIMIT = 700;

const READ_LIMIT = "5 seconds";

const ROOMS_PATH = "/rooms";

const SLOW_PATCH_WARNING = "[foldkit] Slow patch";

const PASS_PREFIX = "nostakes.pass.";

const SHOWN_VALUES = new Set([
  "nostakes.counting",
  "nostakes.deck",
  "nostakes.sound",
  "nostakes.theme",
]);

const FrameGlimpseJson = Schema.fromJsonString(
  Schema.Struct({
    _tag: Schema.String,
    build: Schema.optional(Schema.Json),
    catchUp: Schema.optional(Schema.Struct({ _tag: Schema.String })),
    reason: Schema.optional(Schema.Json),
    result: Schema.optional(Schema.Struct({ _tag: Schema.String })),
    seq: Schema.optional(Schema.Json),
  })
);

const PassGlimpseJson = Schema.fromJsonString(
  Schema.Struct({ code: Schema.String, player: Schema.String })
);

const QUIET_FRAMES = new Set(["Ping", "Pong"]);

const shown = (label: string, value: Schema.Json | undefined) =>
  value === undefined ? [] : [`${label} ${JSON.stringify(value)}`];

const glimpse = (payload: string | Buffer) =>
  Schema.decodeUnknownOption(FrameGlimpseJson)(payload).pipe(
    Option.map(({ _tag, build, catchUp, reason, result, seq }) =>
      [
        _tag,
        ...shown("reason", reason),
        ...shown("build", build),
        ...shown("seq", seq),
        ...shown("catch-up", catchUp?._tag),
        ...shown("result", result?._tag),
      ].join(" ")
    )
  );

interface TableProbe extends HTMLElement {
  readonly snapshot: {
    readonly handId: number;
    readonly heroSeat: number | null;
    readonly seats: readonly unknown[];
  } | null;
}

interface Watched {
  readonly name: string;
  readonly page: Page;
  readonly moments: string[];
  readonly quiet: { frames: number };
}

const squeezed = (text: string) => {
  const flat = text.replaceAll(/\s+/gu, " ").trim();

  return flat.length > TEXT_LIMIT ? `${flat.slice(0, TEXT_LIMIT)}…` : flat;
};

const read = <A>(
  page: Page,
  run: (page: Page) => Promise<A>,
  say: (value: A) => string
) =>
  Effect.tryPromise(() => run(page)).pipe(
    Effect.timeout(READ_LIMIT),
    Effect.map(say),
    Effect.orElseSucceed(() => "unreadable")
  );

const storageLine = ([key, value]: readonly [string, string]) => {
  if (key.startsWith(PASS_PREFIX)) {
    return `${key} = ${Option.match(
      Schema.decodeOption(PassGlimpseJson)(value),
      {
        onNone: () => "unreadable",
        onSome: ({ code, player }) => `room ${code} as ${player}`,
      }
    )}`;
  }

  return SHOWN_VALUES.has(key) ? `${key} = ${value}` : key;
};

const readingOf = (page: Page) =>
  Effect.gen(function* readThePage() {
    const lines = (selector: string) =>
      read(
        page,
        (open) => open.locator(selector).allTextContents(),
        (found) => found.map(squeezed).join(" | ") || "none"
      );

    const status = yield* lines(".status-line");

    const update = yield* lines(
      ".update-line, .stuck-line, .status-line .problem"
    );

    const meta = yield* read(
      page,
      (open) =>
        open
          .locator('meta[name="nostakes-build"]')
          .evaluateAll((tags) =>
            tags.map((tag) => tag.getAttribute("content") ?? "empty")
          ),
      (builds) => builds.join(", ") || "none"
    );

    const table = yield* read(
      page,
      (open) =>
        open.evaluate(() => {
          const found =
            globalThis.document.querySelector<TableProbe>("nostakes-table");

          const self = found?.shadowRoot?.querySelector(".self");

          return {
            defined:
              globalThis.customElements.get("nostakes-table") !== undefined,
            onPage: found !== null,
            self:
              self === null || self === undefined ? "missing" : self.className,
            snapshot:
              found?.snapshot === null || found?.snapshot === undefined
                ? "none"
                : `hero seat ${String(found.snapshot.heroSeat)}, hand ${found.snapshot.handId}, ${found.snapshot.seats.length} seats`,
          };
        }),
      (seen) =>
        `${seen.defined ? "defined" : "not defined"}, ${seen.onPage ? "on the page" : "not on the page"}, .self "${seen.self}", snapshot ${seen.snapshot}`
    );

    const reloaded = yield* read(
      page,
      (open) =>
        open.evaluate(() =>
          globalThis.sessionStorage.getItem("nostakes.reloaded")
        ),
      (text) => text ?? "none"
    );

    const stored = yield* read(
      page,
      (open) => open.evaluate(() => Object.entries(globalThis.localStorage)),
      (entries) =>
        entries
          .filter(([key]) => key.startsWith("nostakes."))
          .toSorted(([one], [other]) => one.localeCompare(other))
          .map(storageLine)
          .join("; ") || "nothing"
    );

    const body = yield* read(
      page,
      (open) => open.locator("body").allInnerTexts(),
      (texts) => squeezed(texts.join(" "))
    );

    return [
      `  status line: ${status}`,
      `  update line: ${update}`,
      `  build meta: ${meta}`,
      `  table: ${table}`,
      `  sessionStorage nostakes.reloaded: ${reloaded}`,
      `  localStorage: ${stored}`,
      `  text: ${body}`,
    ].join("\n");
  });

export const watchPages = () => {
  const started = performance.now();
  const watched: Watched[] = [];

  const note = (moments: string[], what: string) => {
    moments.push(
      `${((performance.now() - started) / 1000).toFixed(1)}s ${what}`
    );

    if (moments.length > KEPT_MOMENTS) {
      moments.splice(0, moments.length - KEPT_MOMENTS);
    }
  };

  const frame = (
    entry: Watched,
    direction: string,
    payload: string | Buffer
  ) => {
    Option.match(glimpse(payload), {
      onNone: () => {
        note(entry.moments, `${direction} an unreadable frame`);
      },
      onSome: (seen) => {
        if (QUIET_FRAMES.has(seen)) {
          entry.quiet.frames += 1;
        } else {
          note(
            entry.moments,
            `${direction} ${direction === "sent" ? (seen.split(" ")[0] ?? seen) : seen}`
          );
        }
      },
    });
  };

  const followSocket = (entry: Watched, socket: WebSocket) => {
    const path = new URL(socket.url()).pathname;

    note(entry.moments, `socket opens ${path}`);
    socket.on("framesent", ({ payload }) => {
      frame(entry, "sent", payload);
    });
    socket.on("framereceived", ({ payload }) => {
      frame(entry, "got", payload);
    });
    socket.on("socketerror", (problem) => {
      note(entry.moments, `socket error on ${path}: ${problem}`);
    });
    socket.on("close", () => {
      note(entry.moments, `socket closed ${path}`);
    });
  };

  const watch = (page: Page, name: string) => {
    const entry: Watched = { moments: [], name, page, quiet: { frames: 0 } };

    watched.push(entry);
    page.on("load", () => {
      note(entry.moments, `loaded ${page.url()}`);
    });
    page.on("console", (message) => {
      if (
        message.type() === "error" ||
        (message.type() === "warning" &&
          !message.text().startsWith(SLOW_PATCH_WARNING))
      ) {
        note(entry.moments, `console ${message.type()}: ${message.text()}`);
      }
    });
    page.on("pageerror", (problem) => {
      note(entry.moments, `page error: ${String(problem)}`);
    });
    page.on("requestfailed", (request) => {
      note(
        entry.moments,
        `request failed: ${request.method()} ${request.url()} (${request.failure()?.errorText ?? "no reason"})`
      );
    });
    page.on("response", (response) => {
      const { pathname } = new URL(response.url());
      const status = response.status();
      const method = response.request().method();
      const rooms = pathname.startsWith(ROOMS_PATH);

      if (status >= 400 || (rooms && (method !== "GET" || status >= 300))) {
        note(entry.moments, `${method} ${pathname} answered ${status}`);
      }
    });
    page.on("websocket", (socket) => {
      if (new URL(socket.url()).pathname.startsWith(ROOMS_PATH)) {
        followSocket(entry, socket);
      }
    });
  };

  const explain = (step: string) =>
    Effect.gen(function* explainFailure() {
      const fs = yield* FileSystem.FileSystem;
      const now = yield* DateTime.now;
      const dir = `${EVIDENCE_ROOT}${DateTime.formatIso(now).replaceAll(/[:.]/gu, "-")}`;

      const saved = yield* fs.makeDirectory(dir, { recursive: true }).pipe(
        Effect.as(true),
        Effect.orElseSucceed(() => false)
      );

      const pages = yield* pipe(
        watched,
        Effect.forEach((entry) =>
          Effect.gen(function* readOnePage() {
            const shot = `${dir}/${entry.name.replaceAll(/\W+/gu, "-")}.png`;
            const closed = entry.page.isClosed();

            const shotTaken =
              saved &&
              !closed &&
              (yield* Effect.tryPromise(() =>
                entry.page.screenshot({ path: shot, timeout: 5000 })
              ).pipe(
                Effect.as(true),
                Effect.orElseSucceed(() => false)
              ));

            const reading = closed
              ? "  the page is closed"
              : yield* readingOf(entry.page);

            return [
              `── ${entry.name} ── ${closed ? "closed" : entry.page.url()}`,
              reading,
              `  screenshot: ${shotTaken ? shot : "none"}`,
              `  since the page opened (${entry.quiet.frames} pings and pongs left out):`,
              ...entry.moments.map((moment) => `    ${moment}`),
            ].join("\n");
          })
        )
      );

      const text = [
        `What each page showed when "${step}" failed:`,
        ...pages,
        saved ? `Evidence saved in ${dir}` : `Could not create ${dir}`,
      ].join("\n");

      yield* fs
        .writeFileString(`${dir}/evidence.txt`, text)
        .pipe(Effect.ignore);
      yield* Console.error(text);

      return saved
        ? `What each page showed is printed above and saved in ${dir}`
        : "What each page showed is printed above";
    });

  return { explain, watch };
};

export type PageWatch = ReturnType<typeof watchPages>;
