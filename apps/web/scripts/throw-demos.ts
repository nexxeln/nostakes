import * as NodeServices from "@effect/platform-node/NodeServices";
import { Config, Console, Effect, Schema } from "effect";
import * as FileSystem from "effect/FileSystem";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";

import { localWebApp, mutedBrowser } from "./local-site.ts";

const DEMOS = [
  {
    file: "gags-all-nine",
    script: "nine",
    sheet: Array.from({ length: 9 }, (_, index) => 1550 + index * 1150),
  },
  {
    file: "gags-self",
    script: "self",
    sheet: Array.from({ length: 9 }, (_, index) => 850 + index * 1250),
  },
  { file: "gags-pileup", script: "pileup", sheet: [] },
] as const;

const YOUR_FACE_STILLS_MS = [
  700, 1700, 2700, 3700, 4700, 5700, 6700, 7700, 8700,
];

const THROTTLE = 4;

const FRAME_BUDGET_MS = 1000 / 60;

const FPS = 30;

const SIZE = { height: 844, width: 390 } as const;

const REDUCED_STILL_MS = 900;

class DemoFailed extends Schema.TaggedError<
  DemoFailed,
  { readonly brand: unique symbol }
>()("DemoFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `Making the throw demos failed at "${this.step}": ${this.detail}. Check that ffmpeg is on the PATH and open scripts/layout/stage.html?scene=throw to look.`;
  }
}

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new DemoFailed({ detail: String(cause), step }),
    try: run,
  });

const ffmpeg = (step: string, args: readonly string[]) =>
  Effect.gen(function* runFfmpeg() {
    const spawner = yield* ChildProcessSpawner;

    const code = yield* spawner
      .exitCode(
        ChildProcess.make("ffmpeg", [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          ...args,
        ])
      )
      .pipe(
        Effect.mapError(
          (failure) => new DemoFailed({ detail: String(failure), step })
        )
      );

    return code === 0
      ? yield* Effect.void
      : yield* new DemoFailed({ detail: `ffmpeg exited with ${code}`, step });
  });

const stageUrl = (app: string, script: string, players: number) =>
  `${app}/scripts/layout/stage.html?scene=throw&players=${players}&script=${script}`;

const opened = (
  browser: Browser,
  app: string,
  script: string,
  reducedMotion: "reduce" | "no-preference"
) =>
  Effect.gen(function* openStage() {
    const context = yield* attempt("open a phone", () =>
      browser.newContext({
        colorScheme: "light",
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
        reducedMotion,
        viewport: SIZE,
      })
    );

    const page = yield* attempt("open the stage", () => context.newPage());

    page.on("pageerror", (failure) => {
      process.stderr.write(`page error: ${failure.message}\n`);
    });

    yield* attempt("install the clock", () => page.clock.install({ time: 0 }));
    yield* attempt("load the stage", () => page.goto(stageUrl(app, script, 6)));
    yield* attempt("wait for the stage", () =>
      page
        .locator("html[data-staged]")
        .waitFor({ state: "attached", timeout: 60_000 })
    );
    yield* attempt("wait for fonts", () =>
      page.evaluate(() => document.fonts.ready.then(() => true))
    );
    yield* attempt("let the table settle", () => page.clock.runFor(1500));
    yield* attempt("stop the clock", () => page.clock.pauseAt(60_000));

    return page;
  });

const filmed = (
  browser: Browser,
  app: string,
  script: string,
  dir: string,
  file: string,
  sheet: readonly number[]
) =>
  Effect.gen(function* film() {
    const files = yield* FileSystem.FileSystem;
    const frames = `${dir}/frames-${file}`;

    yield* files.makeDirectory(frames, { recursive: true });

    const page = yield* opened(browser, app, script, "no-preference");

    const lengthMs = yield* attempt("read the length", () =>
      page.evaluate(() => globalThis.window.throwDemo?.lengthMs ?? 0)
    );

    const count = Math.round((lengthMs * FPS) / 1000);

    for (let index = 0; index < count; index += 1) {
      const ms = (index * 1000) / FPS;
      const tick = Math.round(((index + 1) * 1000) / FPS) - Math.round(ms);

      yield* attempt("draw the frame", () =>
        page.evaluate((at) => globalThis.window.throwDemo?.at(at), ms)
      );
      yield* attempt("take the frame", () =>
        page.screenshot({
          path: `${frames}/${String(index).padStart(5, "0")}.png`,
        })
      );
      yield* attempt("run the clock", () => page.clock.runFor(tick));
    }

    const wav = yield* attempt("render the sound", () =>
      page.evaluate(() => globalThis.window.throwDemo?.wav() ?? "")
    );

    const sound = `${dir}/${file}.wav`;

    yield* files.writeFile(sound, Uint8Array.from(Buffer.from(wav, "base64")));
    yield* attempt("close the window", () => page.context().close());

    yield* ffmpeg(`encode ${file}`, [
      "-framerate",
      String(FPS),
      "-i",
      `${frames}/%05d.png`,
      "-i",
      sound,
      "-map",
      "0:v",
      "-map",
      "1:a",
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-vf",
      "scale=out_color_matrix=bt709:out_range=tv",
      "-colorspace",
      "bt709",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-color_range",
      "tv",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-ar",
      "48000",
      "-t",
      (lengthMs / 1000).toFixed(3),
      "-movflags",
      "+faststart",
      `${dir}/${file}.mp4`,
    ]);
    yield* files.remove(frames, { recursive: true });
    yield* files.remove(sound);
    yield* Console.log(`wrote ${dir}/${file}.mp4`);

    if (sheet.length > 0) {
      const picked = sheet
        .map((ms) => `eq(n,${Math.round((ms * FPS) / 1000)})`)
        .join("+");

      yield* ffmpeg(`contact sheet for ${file}`, [
        "-i",
        `${dir}/${file}.mp4`,
        "-vf",
        `select='${picked}',scale=390:-1,tile=${Math.ceil(sheet.length / 3)}x3`,
        "-fps_mode",
        "vfr",
        "-frames:v",
        "1",
        `${dir}/${file}-sheet.png`,
      ]);
      yield* Console.log(`wrote ${dir}/${file}-sheet.png`);
    }
  });

const reducedStill = (
  browser: Browser,
  app: string,
  script: string,
  dir: string,
  file: string
) =>
  Effect.gen(function* still() {
    const page = yield* opened(browser, app, script, "reduce");
    const steps = Math.round((REDUCED_STILL_MS + 400) / 50);

    for (let index = 0; index <= steps; index += 1) {
      yield* attempt("draw the frame", () =>
        page.evaluate((at) => globalThis.window.throwDemo?.at(at), index * 50)
      );
      yield* attempt("run the clock", () => page.clock.runFor(50));
    }

    yield* attempt("take the still", () =>
      page.screenshot({ path: `${dir}/${file}-reduced-motion.png` })
    );
    yield* attempt("close the window", () => page.context().close());
    yield* Console.log(`wrote ${dir}/${file}-reduced-motion.png`);
  });

const coversYourHand = (page: Page) =>
  attempt("measure the gag against your cards and the chip", () =>
    page.evaluate(() => {
      const root = document.querySelector("nostakes-table")?.shadowRoot;

      if (root === null || root === undefined) {
        return ["no table"];
      }

      const guarded = [".hand", ".chipctl:not(.gone)"].flatMap((selector) => {
        const node = root.querySelector(selector);

        return node === null ? [] : [node.getBoundingClientRect()];
      });

      return [...root.querySelectorAll(".gag, .reaction")].flatMap((node) => {
        const box = node.getBoundingClientRect();
        const shown = Number(getComputedStyle(node).opacity) > 0.05;

        const crossing = guarded.some(
          (other) =>
            Math.min(box.right, other.right) - Math.max(box.left, other.left) >
              1 &&
            Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) >
              1
        );

        return shown && crossing ? [node.className] : [];
      });
    })
  );

const yourFace = (
  browser: Browser,
  app: string,
  dir: string,
  script: "you" | "yourself"
) =>
  Effect.gen(function* youAreHit() {
    const page = yield* opened(browser, app, script, "no-preference");
    const problems: string[] = [];
    const last = Math.max(...YOUR_FACE_STILLS_MS) + 600;

    for (const at of Array.from(
      { length: last / 50 },
      (_, index) => index * 50
    )) {
      yield* attempt("draw the frame", () =>
        page.evaluate((ms) => globalThis.window.throwDemo?.at(ms), at)
      );

      const covering = yield* coversYourHand(page);

      problems.push(...covering.map((what) => `${what} at ${at} ms`));

      if (YOUR_FACE_STILLS_MS.includes(at)) {
        yield* attempt("take the still", () =>
          page.screenshot({
            clip: { height: 260, width: 390, x: 0, y: 584 },
            path: `${dir}/${script}-${String(at).padStart(5, "0")}.png`,
          })
        );
      }

      yield* attempt("run the clock", () => page.clock.runFor(50));
    }

    yield* attempt("close the window", () => page.context().close());

    yield* problems.length === 0
      ? Console.log(
          `every gag at your own face (${script}) stayed off your cards and the chip; stills in ${dir}/${script}-*.png`
        )
      : new DemoFailed({
          detail: problems.slice(0, 8).join(", "),
          step: "keep the gags off your cards",
        });
  });

const framesUnderLoad = (browser: Browser, app: string) =>
  Effect.gen(function* timeFrames() {
    const context = yield* attempt("open a phone", () =>
      browser.newContext({
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true,
        viewport: SIZE,
      })
    );

    const page = yield* attempt("open the stage", () => context.newPage());

    const session = yield* attempt("open a devtools session", () =>
      context.newCDPSession(page)
    );

    yield* attempt("throttle the CPU", () =>
      session.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
    );
    yield* attempt("load the stage", () =>
      page.goto(`${stageUrl(app, "pileup", 9)}&live=1`)
    );

    const frames = yield* attempt("time the pile-up", () =>
      page
        .waitForFunction(() => globalThis.window.throwFrames, undefined, {
          timeout: 60_000,
        })
        .then((handle) => handle.jsonValue())
    );

    yield* attempt("close the window", () => context.close());

    const pairs = frames ?? [];

    const timed = Array.from({ length: pairs.length / 2 }, (_, index) => ({
      at: pairs[index * 2 + 1] ?? 0,
      ms: pairs[index * 2] ?? 0,
    }));

    const slow = timed
      .filter(({ ms }) => ms > FRAME_BUDGET_MS * 1.5)
      .map(({ at, ms }) => `${ms.toFixed(0)} ms at ${at.toFixed(0)}`);

    const sorted = timed.map(({ ms }) => ms).toSorted((a, b) => a - b);
    const missed = sorted.filter((ms) => ms > FRAME_BUDGET_MS * 1.5).length;
    const worst = sorted.at(-1) ?? 0;
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;

    yield* Console.log(
      `nine seats, two waves of three throws, CPU at ${THROTTLE}x: ${sorted.length} frames, median ${median.toFixed(1)} ms, worst ${worst.toFixed(1)} ms, ${missed} over ${(FRAME_BUDGET_MS * 1.5).toFixed(0)} ms (${slow.join(", ")})`
    );
  });

const program = Effect.gen(function* makeDemos() {
  const dir = yield* Config.String("THROWS_DIR").pipe(
    Config.withDefault("/tmp/nostakes-throws")
  );

  const only = yield* Config.String("THROWS_ONLY").pipe(Config.withDefault(""));
  const files = yield* FileSystem.FileSystem;
  const web = yield* localWebApp;
  const browser = yield* mutedBrowser(chromium);

  yield* files.makeDirectory(dir, { recursive: true });

  const perfOnly = only === "frames";

  for (const demo of perfOnly ? [] : DEMOS) {
    if (only !== "" && !only.split(",").includes(demo.script)) {
      continue;
    }

    yield* filmed(browser, web.url, demo.script, dir, demo.file, demo.sheet);
  }

  if (!perfOnly) {
    yield* reducedStill(browser, web.url, "nine", dir, "gags");
    yield* yourFace(browser, web.url, dir, "you");
    yield* yourFace(browser, web.url, dir, "yourself");
  }

  yield* framesUnderLoad(browser, web.url);
});

await Effect.runPromise(
  program.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
