import * as NodeServices from "@effect/platform-node/NodeServices";
import { Config, Console, Effect, Schema } from "effect";
import * as FileSystem from "effect/FileSystem";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";

import { mutedBrowser, servedVite } from "../local-site.ts";
import {
  FPS,
  FRAME_COUNT,
  LENGTH_MS,
  TEMPO,
  beatOfMs,
  msOfBeat,
} from "./timeline.ts";

const WEB = new URL("../..", import.meta.url).pathname;

const STAGE = "/scripts/launch/stage.html";

const FRAMINGS = {
  tall: { file: "launch-9x16", height: 960, label: "9x16", width: 540 },
  wide: { file: "launch-16x9", height: 540, label: "16x9", width: 960 },
} as const;

type FramingName = keyof typeof FRAMINGS;

const PIXEL_RATIO = 2;

const CLOCK_PAUSED_AT = 300_000;

class LaunchFailed extends Schema.TaggedError<
  LaunchFailed,
  { readonly brand: unique symbol }
>()("LaunchFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `Making the launch video failed at "${this.step}": ${this.detail}. Build the packages first (pnpm build), check that ffmpeg is on the PATH, and open ${STAGE} on the stage server to look.`;
  }
}

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new LaunchFailed({ detail: String(cause), step }),
    try: run,
  });

const PointerSchema = Schema.NullOr(
  Schema.Struct({ down: Schema.Boolean, x: Schema.Finite, y: Schema.Finite })
);

type Pointer = typeof PointerSchema.Type;

const stepAt = (page: Page, ms: number) =>
  attempt(`draw the stage at ${ms.toFixed(0)} ms`, () =>
    page.evaluate((at) => {
      globalThis.window.launch?.at(at);

      return globalThis.window.launch?.pointer() ?? null;
    }, ms)
  ).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(PointerSchema)),
    Effect.mapError(
      (failure) =>
        new LaunchFailed({ detail: String(failure), step: "read the pointer" })
    )
  );

const moved = (page: Page, before: Pointer, now: Pointer) =>
  Effect.gen(function* movePointer() {
    if (now === null) {
      if (before?.down === true) {
        yield* attempt("lift the pointer", () => page.mouse.up());
      }

      if (before !== null) {
        yield* attempt("park the pointer", () => page.mouse.move(2, 2));
      }

      return;
    }

    yield* attempt("move the pointer", () => page.mouse.move(now.x, now.y));

    if (now.down && before?.down !== true) {
      yield* attempt("press", () => page.mouse.down());
    }

    if (!now.down && before?.down === true) {
      yield* attempt("release", () => page.mouse.up());
    }
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
          (failure) => new LaunchFailed({ detail: String(failure), step })
        )
      );

    return code === 0
      ? yield* Effect.void
      : yield* new LaunchFailed({ detail: `ffmpeg exited with ${code}`, step });
  });

const frameName = (index: number) => `${String(index).padStart(5, "0")}.png`;

const filmed = (
  opened: Browser,
  origin: string,
  framing: FramingName,
  dir: string,
  stills: readonly number[]
) =>
  Effect.gen(function* film() {
    const files = yield* FileSystem.FileSystem;
    const look = FRAMINGS[framing];
    const frames = `${dir}/frames-${look.label}`;

    yield* files.makeDirectory(frames, { recursive: true });

    const context = yield* attempt("open a light, muted window", () =>
      opened.newContext({
        colorScheme: "light",
        deviceScaleFactor: PIXEL_RATIO,
        reducedMotion: "no-preference",
        viewport: { height: look.height, width: look.width },
      })
    );

    const page = yield* attempt("open the stage", () => context.newPage());

    page.on("pageerror", (failure) => {
      process.stderr.write(`page error: ${failure.message}\n`);
    });

    yield* attempt("install the clock", () => page.clock.install({ time: 0 }));
    yield* attempt("load the stage", () =>
      page.goto(`${origin}${STAGE}?frame=${framing}`)
    );
    yield* attempt("wait for the stage", () =>
      page
        .locator("html[data-staged]")
        .waitFor({ state: "attached", timeout: 60_000 })
    );
    yield* attempt("wait for fonts", () =>
      page.evaluate(() => document.fonts.ready.then(() => true))
    );

    yield* attempt("stop the clock", () => page.clock.pauseAt(CLOCK_PAUSED_AT));

    const last =
      stills.length === 0
        ? FRAME_COUNT
        : Math.min(
            FRAME_COUNT,
            Math.round((msOfBeat(Math.max(...stills)) * FPS) / 1000) + 1
          );

    const wanted = new Set(
      stills.map((beat) => Math.round((msOfBeat(beat) * FPS) / 1000))
    );

    let pointer: Pointer = null;
    const started = performance.now();

    for (let index = 0; index < last; index += 1) {
      const ms = (index * 1000) / FPS;

      const tick =
        Math.round(((index + 1) * 1000) / FPS) -
        Math.round((index * 1000) / FPS);

      const next = yield* stepAt(page, ms);

      yield* moved(page, pointer, next);
      pointer = next;

      if (stills.length === 0 || wanted.has(index)) {
        const name =
          stills.length === 0
            ? `${frames}/${frameName(index)}`
            : `${dir}/still-${look.label}-${beatOfMs(ms).toFixed(2)}.png`;

        yield* attempt("take the frame", () =>
          page.screenshot({ path: name, type: "png" })
        );
      }

      yield* attempt("run the clock", () => page.clock.runFor(tick));

      if (index % 150 === 0) {
        yield* Console.log(
          `${look.label}: frame ${index}/${last} after ${((performance.now() - started) / 1000).toFixed(0)} s`
        );
      }
    }

    const raised = yield* attempt("read the raise", () =>
      page.evaluate(() => document.documentElement.dataset.raised ?? "none")
    );

    yield* Console.log(`${look.label}: the chip drag raised to ${raised}`);
    yield* attempt("close the window", () => context.close());

    return frames;
  });

const scored = (opened: Browser, origin: string, dir: string) =>
  Effect.gen(function* score() {
    const files = yield* FileSystem.FileSystem;
    const page = yield* attempt("open the score page", () => opened.newPage());

    yield* attempt("load the score", () =>
      page.goto(`${origin}${STAGE}?score=1`)
    );
    yield* attempt("wait for the score", () =>
      page
        .locator("html[data-staged]")
        .waitFor({ state: "attached", timeout: 60_000 })
    );

    const wav = yield* attempt("render the score", () =>
      page.evaluate(() => globalThis.window.launchScore?.() ?? "")
    );

    yield* attempt("close the score page", () => page.close());

    const path = `${dir}/score.wav`;

    yield* files.writeFile(path, Uint8Array.from(Buffer.from(wav, "base64")));
    yield* Console.log(`wrote ${path}`);

    return path;
  });

const encoded = (
  dir: string,
  framing: FramingName,
  frames: string,
  score: string
) =>
  Effect.gen(function* encode() {
    const look = FRAMINGS[framing];
    const out = `${dir}/${look.file}.mp4`;

    yield* ffmpeg(`encode ${look.file}`, [
      "-framerate",
      String(FPS),
      "-i",
      `${frames}/%05d.png`,
      "-i",
      score,
      "-map",
      "0:v",
      "-map",
      "1:a",
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "17",
      "-profile:v",
      "high",
      "-pix_fmt",
      "yuv420p",
      "-colorspace",
      "bt709",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-color_range",
      "tv",
      "-vf",
      "scale=out_color_matrix=bt709:out_range=tv",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-t",
      (LENGTH_MS / 1000).toFixed(3),
      "-movflags",
      "+faststart",
      out,
    ]);
    yield* ffmpeg(`contact sheet for ${look.file}`, [
      "-i",
      out,
      "-vf",
      `fps=${TEMPO}/60:start_time=${((60 / TEMPO) * 0.5).toFixed(3)},scale=${framing === "wide" ? 384 : 216}:-1,tile=11x8:padding=6:margin=6:color=0xf6f1e8`,
      "-frames:v",
      "1",
      `${dir}/${look.file}-contact.png`,
    ]);
    yield* Console.log(`wrote ${out} and its contact sheet`);
  });

const program = Effect.gen(function* launchVideo() {
  const files = yield* FileSystem.FileSystem;

  const dir = yield* Config.String("LAUNCH_DIR").pipe(
    Config.withDefault("/tmp/nostakes-launch")
  );

  const framings = yield* Config.String("LAUNCH_FRAMINGS").pipe(
    Config.withDefault("wide,tall"),
    Config.map((text) =>
      text.split(",").filter((each): each is FramingName => each in FRAMINGS)
    )
  );

  const stills = yield* Config.String("LAUNCH_STILLS").pipe(
    Config.withDefault(""),
    Config.map((text) =>
      text
        .split(",")
        .filter((each) => each.length > 0)
        .map(Number)
    )
  );

  yield* files.makeDirectory(dir, { recursive: true });

  const origin = yield* servedVite("start the stage server", "STAGE_PORT", {
    configFile: false,
    logLevel: "warn",
    root: WEB,
  }).pipe(
    Effect.mapError(
      (failure) =>
        new LaunchFailed({ detail: failure.detail, step: failure.step })
    )
  );

  const opened = yield* mutedBrowser(chromium).pipe(
    Effect.mapError(
      (failure) =>
        new LaunchFailed({ detail: failure.detail, step: failure.step })
    )
  );

  const scoreOnly = yield* Config.Boolean("LAUNCH_SCORE_ONLY").pipe(
    Config.withDefault(false)
  );

  const score = stills.length === 0 ? yield* scored(opened, origin, dir) : "";

  if (scoreOnly) {
    return;
  }

  for (const framing of framings) {
    const frames = yield* filmed(opened, origin, framing, dir, stills);

    if (stills.length === 0) {
      yield* encoded(dir, framing, frames, score);
      yield* files.remove(frames, { recursive: true });
    }
  }
});

await Effect.runPromise(
  program.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
