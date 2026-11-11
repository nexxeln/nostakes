import * as NodeServices from "@effect/platform-node/NodeServices";
import { Config, Console, Effect, Option, Schema } from "effect";
import * as FileSystem from "effect/FileSystem";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import { chromium, webkit } from "playwright-core";
import type { BrowserType, Page } from "playwright-core";
import { createServer } from "vite";
import type { ViteDevServer } from "vite";

import { mutedBrowser } from "./local-site.ts";
import {
  declaredColour,
  declaredText,
  ffmpegSwatches,
  swatchesOf,
  swatchProblems,
  swatchText,
} from "./moments/clip-colour.ts";
import type { Picture, Swatches } from "./moments/clip-colour.ts";
import { SHARE_STUB } from "./share-stub.ts";

const WEB = new URL("..", import.meta.url).pathname;

const STAGE_PORT = 5193;

const STAGE = `http://localhost:${STAGE_PORT}/scripts/moments`;

const SIZES = {
  Chat: { height: 1350, width: 1080 },
  Story: { height: 1920, width: 1080 },
} as const;

const SHORTEST_SECONDS = 2.9;

const LONGEST_SECONDS = 4.1;

const FPS = 30;

const MOST_BYTES = 2_000_000;

const MEAN_DIFFERENCE = 4;

const FAR_SHARE = 0.0005;

type Frame = keyof typeof SIZES;

class ClipCheckFailed extends Schema.TaggedError<
  ClipCheckFailed,
  { readonly brand: unique symbol }
>()("ClipCheckFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `Checking a moment's clip failed at "${this.step}": ${this.detail}. Open ${STAGE}/stage.html?view=live, tap the moment away, and tap Clip to see it.`;
  }
}

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new ClipCheckFailed({ detail: String(cause), step }),
    try: run,
  });

const decoded =
  <A, I>(schema: Schema.Codec<A, I>, step: string) =>
  (text: string) =>
    Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(text).pipe(
      Effect.mapError(
        (failure) => new ClipCheckFailed({ detail: failure.message, step })
      )
    );

const stageServer = Effect.acquireRelease(
  attempt("start the stage server", () =>
    createServer({
      configFile: false,
      logLevel: "warn",
      root: WEB,
      server: { port: STAGE_PORT, strictPort: true },
    })
  ).pipe(
    Effect.tap((server) =>
      attempt("listen for the stage", () => server.listen())
    )
  ),
  (server: ViteDevServer) => Effect.promise(() => server.close())
);

const CLIP_TOOLS = `
(() => {
  const late = { frames: 0, late: 0, longest: 0, last: -1 };
  window.__frames = late;
  const tick = (now) => {
    if (late.last >= 0) { const gap = now - late.last; late.frames += 1; late.longest = Math.max(late.longest, gap); if (gap > 25) late.late += 1; }
    late.last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__aac = async () => typeof AudioEncoder === "function" && (await AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 1, bitrate: 96000 })).supported === true;
  window.__bytes = async (index) => {
    const bytes = new Uint8Array(await window.__files[index].arrayBuffer());
    let binary = "";
    for (let at = 0; at < bytes.length; at += 32768) binary += String.fromCharCode(...bytes.subarray(at, at + 32768));
    return btoa(binary);
  };
  const lightGaps = (one, other) => {
    let total = 0;
    let far = 0;
    for (let at = 0; at < one.length; at += 4) {
      const gap = Math.max(Math.abs(one[at] - other[at]), Math.abs(one[at + 1] - other[at + 1]), Math.abs(one[at + 2] - other[at + 2]));
      const light = Math.abs(0.2126 * (one[at] - other[at]) + 0.7152 * (one[at + 1] - other[at + 1]) + 0.0722 * (one[at + 2] - other[at + 2]));
      total += gap;
      if (light > 40) far += 1;
    }
    return { far: far / (one.length / 4), mean: total / (one.length / 4) };
  };
  window.__rgba = (which) => {
    const bytes = window[which];
    let binary = "";
    for (let at = 0; at < bytes.length; at += 32768) binary += String.fromCharCode(...bytes.subarray(at, at + 32768));
    return btoa(binary);
  };
  window.__judge = async (clipIndex, stillIndex, title) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.src = URL.createObjectURL(window.__files[clipIndex]);
    document.body.append(video);
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve;
      video.onerror = () => reject(new Error("the clip does not load: " + (video.error ? video.error.message || video.error.code : "")));
    });
    const width = video.videoWidth;
    const height = video.videoHeight;
    const still = new OffscreenCanvas(width, height).getContext("2d");
    still.drawImage(await createImageBitmap(window.__files[stillIndex]), 0, 0, width, height);
    await new Promise((resolve) => {
      video.onseeked = resolve;
      video.currentTime = 1 / 120;
    });
    if ("requestVideoFrameCallback" in video) {
      await new Promise((resolve) => { video.requestVideoFrameCallback(resolve); requestAnimationFrame(() => requestAnimationFrame(resolve)); });
    }
    const first = new OffscreenCanvas(width, height).getContext("2d");
    first.drawImage(video, 0, 0);
    video.currentTime = 0;
    const box = [Math.max(0, Math.floor(title.x) - 6), Math.max(0, Math.floor(title.y) - 6), Math.ceil(title.width) + 12, Math.ceil(title.height) + 12];
    const opening = lightGaps(first.getImageData(...box).data, still.getImageData(...box).data);
    const ended = new Promise((resolve) => { video.onended = resolve; });
    const shown = { count: 0 };
    if ("requestVideoFrameCallback" in video) {
      const count = () => { shown.count += 1; video.requestVideoFrameCallback(count); };
      video.requestVideoFrameCallback(count);
    }
    await video.play();
    await Promise.race([ended, new Promise((resolve, reject) => setTimeout(() => reject(new Error("the clip never reached its end")), 20000))]);
    const last = new OffscreenCanvas(width, height).getContext("2d");
    last.drawImage(video, 0, 0);
    window.__lastFrame = last.getImageData(0, 0, width, height).data;
    window.__stillFrame = still.getImageData(0, 0, width, height).data;
    const closing = lightGaps(window.__lastFrame, window.__stillFrame);
    return JSON.stringify({ currentTime: video.currentTime, duration: video.duration, ended: video.ended, far: closing.far, height, mean: closing.mean, shown: shown.count, titleFar: opening.far, width });
  };
})();
`;

const JudgedSchema = Schema.Struct({
  currentTime: Schema.Finite,
  duration: Schema.Finite,
  ended: Schema.Boolean,
  far: Schema.Finite,
  height: Schema.Int,
  mean: Schema.Finite,
  shown: Schema.Int,
  titleFar: Schema.Finite,
  width: Schema.Int,
});

const TitleBoxSchema = Schema.Struct({
  height: Schema.Finite,
  width: Schema.Finite,
  x: Schema.Finite,
  y: Schema.Finite,
});

type TitleBox = typeof TitleBoxSchema.Type;

const TITLE_FAR = 0.05;

const NO_TITLE: TitleBox = { height: 0, width: 0, x: 0, y: 0 };

const SharedSchema = Schema.Array(
  Schema.Struct({
    activated: Schema.NullOr(Schema.Boolean),
    name: Schema.String,
    sameTask: Schema.Boolean,
    type: Schema.String,
  })
);

const FramesSchema = Schema.Struct({
  frames: Schema.Int,
  late: Schema.Int,
  longest: Schema.Finite,
});

interface Box {
  readonly body: number;
  readonly end: number;
  readonly type: string;
}

const boxesIn = (bytes: Uint8Array, from: number, to: number) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  const found: Box[] = [];
  let at = from;

  while (at + 8 <= to) {
    const size = view.getUint32(at);

    found.push({
      body: at + 8,
      end: at + size,
      type: String.fromCodePoint(...bytes.subarray(at + 4, at + 8)),
    });
    at += Math.max(8, size);
  }

  return found;
};

const inside = (bytes: Uint8Array, box: Box | undefined, type: string) =>
  box === undefined
    ? undefined
    : boxesIn(bytes, box.body, box.end).find((each) => each.type === type);

const atomsOf = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  const top = boxesIn(bytes, 0, bytes.length);
  const moov = top.find((box) => box.type === "moov");
  const mvhd = inside(bytes, moov, "mvhd");

  const tracks = (moov === undefined ? [] : boxesIn(bytes, moov.body, moov.end))
    .filter((box) => box.type === "trak")
    .map((trak) => {
      const mdia = inside(bytes, trak, "mdia");
      const hdlr = inside(bytes, mdia, "hdlr");

      const stsz = inside(
        bytes,
        inside(bytes, inside(bytes, mdia, "minf"), "stbl"),
        "stsz"
      );

      return {
        handler:
          hdlr === undefined
            ? ""
            : String.fromCodePoint(
                ...bytes.subarray(hdlr.body + 8, hdlr.body + 12)
              ),
        samples: stsz === undefined ? 0 : view.getUint32(stsz.body + 8),
      };
    });

  return {
    order: top.map((box) => box.type),
    seconds:
      mvhd === undefined
        ? 0
        : view.getUint32(mvhd.body + 16) / view.getUint32(mvhd.body + 12),
    tracks,
  };
};

const ProbeSchema = Schema.Struct({
  format: Schema.Struct({ duration: Schema.String }),
  streams: Schema.Array(
    Schema.Struct({
      channels: Schema.optional(Schema.Int),
      codec_name: Schema.String,
      codec_type: Schema.String,
      height: Schema.optional(Schema.Int),
      nb_frames: Schema.optional(Schema.String),
      profile: Schema.optional(Schema.String),
      r_frame_rate: Schema.optional(Schema.String),
      sample_rate: Schema.optional(Schema.String),
      width: Schema.optional(Schema.Int),
    })
  ),
});

const probed = (path: string) =>
  Effect.gen(function* probe() {
    const spawner = yield* ChildProcessSpawner;

    const found = yield* spawner
      .string(
        ChildProcess.make("ffprobe", [
          "-v",
          "error",
          "-show_entries",
          "stream=codec_type,codec_name,profile,width,height,nb_frames,r_frame_rate,sample_rate,channels:format=duration",
          "-of",
          "json",
          path,
        ])
      )
      .pipe(Effect.option);

    if (Option.isNone(found)) {
      return Option.none();
    }

    const decodes = yield* spawner
      .string(
        ChildProcess.make("ffmpeg", [
          "-v",
          "error",
          "-i",
          path,
          "-f",
          "null",
          "-",
        ]),
        { includeStderr: true }
      )
      .pipe(Effect.orElseSucceed(() => "ffmpeg did not run"));

    const report = yield* decoded(
      ProbeSchema,
      "read ffprobe's answer"
    )(found.value);

    return Option.some({ decodes: decodes.trim(), report });
  });

interface Expected {
  readonly frame: Frame;
  readonly sound: boolean;
}

type Probed = typeof ProbeSchema.Type;

const atomProblems = (bytes: Uint8Array, expected: Expected) => {
  const problems: string[] = [];
  const atoms = atomsOf(bytes);
  const [video, audio] = atoms.tracks;
  const frames = video?.samples ?? 0;

  if (atoms.order.join(" ") !== "ftyp moov mdat") {
    problems.push(
      `the boxes run ${atoms.order.join(" ")}, so the movie header is not first`
    );
  }

  if (video?.handler !== "vide") {
    problems.push("the first track is not video");
  }

  if (expected.sound !== (audio?.handler === "soun")) {
    problems.push(
      expected.sound
        ? "the sting is missing"
        : "there is a sound track this browser cannot encode"
    );
  }

  if (atoms.seconds < SHORTEST_SECONDS || atoms.seconds > LONGEST_SECONDS) {
    problems.push(`the clip lasts ${atoms.seconds.toFixed(2)} s`);
  }

  if (Math.abs(frames / FPS - atoms.seconds) > 0.1) {
    problems.push(
      `${frames} frames do not fill ${atoms.seconds.toFixed(2)} s at ${FPS} a second`
    );
  }

  if (bytes.length > MOST_BYTES) {
    problems.push(`the clip is ${bytes.length} bytes`);
  }

  return { frames, problems };
};

const PROFILES = new Set(["High", "Main", "Constrained Baseline", "Baseline"]);

const videoReadWell = (report: Probed, frame: Frame, frames: number) => {
  const stream = report.streams.find((each) => each.codec_type === "video");
  const { height, width } = SIZES[frame];

  return stream?.codec_name === "h264" &&
    PROFILES.has(stream.profile ?? "") &&
    stream.width === width &&
    stream.height === height &&
    stream.r_frame_rate === `${FPS}/1` &&
    Number(stream.nb_frames) === frames
    ? []
    : [`ffprobe reads the video as ${JSON.stringify(stream)}`];
};

const soundReadWell = (report: Probed, expected: Expected) => {
  const sound = report.streams.find((each) => each.codec_type === "audio");

  return !expected.sound ||
    (sound?.codec_name === "aac" &&
      sound.profile === "LC" &&
      sound.sample_rate === "48000" &&
      sound.channels === 1)
    ? []
    : [`ffprobe reads the sound as ${JSON.stringify(sound)}`];
};

const fileProblems = (
  bytes: Uint8Array,
  expected: Expected,
  probe: Option.Option<{ readonly decodes: string; readonly report: Probed }>
) => {
  const atoms = atomProblems(bytes, expected);

  return [
    ...atoms.problems,
    ...Option.toArray(probe).flatMap(({ decodes, report }) => [
      ...videoReadWell(report, expected.frame, atoms.frames),
      ...soundReadWell(report, expected),
      ...(decodes.length > 0
        ? [`ffmpeg cannot decode it cleanly: ${decodes.slice(0, 300)}`]
        : []),
    ]),
  ];
};

const playbackProblems = (judged: typeof JudgedSchema.Type, frame: Frame) => {
  const problems: string[] = [];
  const { height, width } = SIZES[frame];

  if (!judged.ended || judged.currentTime < judged.duration - 1 / FPS) {
    problems.push(
      `playback stopped at ${judged.currentTime.toFixed(2)} of ${judged.duration.toFixed(2)} s`
    );
  }

  if (judged.width !== width || judged.height !== height) {
    problems.push(`the video plays at ${judged.width}x${judged.height}`);
  }

  if (judged.titleFar > TITLE_FAR) {
    problems.push(
      `the first frame does not open on the title: ${(judged.titleFar * 100).toFixed(1)}% of the title's pixels differ from the still`
    );
  }

  if (judged.mean > MEAN_DIFFERENCE || judged.far > FAR_SHARE) {
    problems.push(
      `the last frame is not the still picture: mean difference ${judged.mean.toFixed(2)}, ${(judged.far * 100).toFixed(2)}% of pixels far off`
    );
  }

  return problems;
};

interface Settings {
  readonly dir: Option.Option<string>;
  readonly require: "nothing" | "sound" | "video";
  readonly throttle: number;
}

const read = <A, I>(
  page: Page,
  script: string,
  schema: Schema.Codec<A, I>,
  step: string
) =>
  attempt(step, () => page.evaluate<string>(script)).pipe(
    Effect.flatMap(decoded(schema, step))
  );

const throttled = (page: Page, engine: BrowserType, rate: number) =>
  engine.name() === "chromium" && rate > 1
    ? attempt("open the devtools session", () =>
        page.context().newCDPSession(page)
      ).pipe(
        Effect.flatMap((session) =>
          attempt("throttle the CPU", () =>
            session.send("Emulation.setCPUThrottlingRate", { rate })
          )
        )
      )
    : Effect.void;

const fileOf = (page: Page, index: number) =>
  attempt("read the clip's bytes", () =>
    page.evaluate<string>(`window.__bytes(${index})`)
  ).pipe(Effect.map((text) => Uint8Array.from(Buffer.from(text, "base64"))));

const pictureOf = (
  page: Page,
  which: string,
  size: { readonly height: number; readonly width: number }
) =>
  attempt(`read the ${which} pixels`, () =>
    page.evaluate<string>(`window.__rgba(${JSON.stringify(which)})`)
  ).pipe(
    Effect.map((text): Picture => ({
      channels: 4,
      height: size.height,
      pixels: Uint8Array.from(Buffer.from(text, "base64")),
      width: size.width,
    }))
  );

const coloursOf = (
  page: Page,
  bytes: Uint8Array,
  clip: {
    readonly expected: Expected;
    readonly height: number;
    readonly path: string;
    readonly width: number;
  }
) =>
  Effect.gen(function* checkColours() {
    const declared = declaredColour(bytes);

    const size = { height: clip.height, width: clip.width };
    const still = yield* pictureOf(page, "__stillFrame", size);

    const shown = swatchesOf(
      still,
      yield* pictureOf(page, "__lastFrame", size)
    );

    const frames = atomsOf(bytes).tracks[0]?.samples ?? 0;

    const viaFfmpeg: Option.Option<{
      readonly honours: Swatches;
      readonly ignores: Swatches;
    }> = yield* ffmpegSwatches(clip.path, still, {
      frames,
      fullRange: declared.stream?.fullRange ?? false,
      ...size,
    });

    const problems = [
      ...(declared.stream?.fullRange === false
        ? []
        : [
            `the stream declares ${declaredText(declared.stream)}, not limited range`,
          ]),
      ...(JSON.stringify(declared.colr) === JSON.stringify(declared.stream)
        ? []
        : [
            `the colr box says ${declaredText(declared.colr)} while the stream says ${declaredText(declared.stream)}`,
          ]),
      ...swatchProblems("in this browser", shown),
      ...Option.toArray(viaFfmpeg).flatMap(({ honours, ignores }) => [
        ...swatchProblems("in a player that honours the flags", honours),
        ...swatchProblems("in a player that ignores them", ignores),
      ]),
    ];

    return {
      line: `declares ${declaredText(declared.stream)}, colr ${declared.colr === null ? "none" : "the same"}; shows ${swatchText(shown)}${Option.match(
        viaFfmpeg,
        {
          onNone: () => "",
          onSome: ({ honours, ignores }) =>
            `; ffmpeg honouring the flags ${swatchText(honours)}; ignoring them ${swatchText(ignores)}`,
        }
      )}`,
      problems,
    };
  });

const judged = (
  page: Page,
  settings: Settings,
  names: {
    readonly clip: number;
    readonly label: string;
    readonly still: number;
    readonly title: TitleBox;
  },
  expected: Expected
) =>
  Effect.gen(function* judgeClip() {
    const fs = yield* FileSystem.FileSystem;
    const bytes = yield* fileOf(page, names.clip);

    const dir = yield* Option.match(settings.dir, {
      onNone: () => fs.makeTempDirectoryScoped({ prefix: "nostakes-clip" }),
      onSome: (chosen) =>
        fs.makeDirectory(chosen, { recursive: true }).pipe(Effect.as(chosen)),
    });

    const path = `${dir}/${names.label}.mp4`;

    yield* fs.writeFile(path, bytes);

    const probe = yield* probed(path);
    const { height, width } = SIZES[expected.frame];

    const played = yield* read(
      page,
      `window.__judge(${names.clip}, ${names.still}, ${JSON.stringify(names.title)})`,
      JudgedSchema,
      "play the clip to its end"
    ).pipe(
      Effect.map((found) => ({
        found,
        problems: playbackProblems(found, expected.frame),
      })),
      Effect.catchTag("ClipCheckFailed", (failed) =>
        Effect.succeed({ found: null, problems: [failed.detail] })
      )
    );

    const colours = yield* coloursOf(page, bytes, {
      expected,
      height,
      path,
      width,
    });

    return {
      bytes: bytes.length,
      colours: colours.line,
      path,
      played: played.found,
      probed: Option.isSome(probe),
      problems: [
        ...fileProblems(bytes, expected, probe),
        ...played.problems,
        ...colours.problems,
      ],
    };
  }).pipe(Effect.scoped);

const liveClip = (
  engine: BrowserType,
  settings: Settings,
  look: { readonly sample: string; readonly theme: string }
) =>
  Effect.gen(function* keepClip() {
    const opened = yield* mutedBrowser(engine);

    const context = yield* attempt("open a phone-sized context", () =>
      opened.newContext({
        hasTouch: true,
        viewport: { height: 844, width: 390 },
      })
    );

    yield* attempt("stub the share sheet", () =>
      Promise.all([
        context.addInitScript(SHARE_STUB),
        context.addInitScript(CLIP_TOOLS),
      ])
    );

    const page = yield* attempt("open a page", () => context.newPage());

    yield* throttled(page, engine, settings.throttle);
    yield* attempt("open the stage", () =>
      page.goto(
        `${STAGE}/stage.html?view=live&sample=${look.sample}&theme=${look.theme}`
      )
    );
    yield* attempt("wait for the pictures", () =>
      page
        .locator('nostakes-moment[data-drawn="Chat Story"]')
        .waitFor({ state: "attached", timeout: 60_000 })
    );

    const sound = yield* attempt("ask whether this browser encodes AAC", () =>
      page.evaluate<boolean>("window.__aac()")
    );

    const title = yield* attempt("measure the title on the card", () =>
      page.locator("nostakes-moment").evaluate((node) => {
        const part = node.shadowRoot?.querySelector('[data-part="title"]');

        const box =
          part instanceof SVGGraphicsElement
            ? part.getBBox()
            : { height: 0, width: 0, x: 0, y: 0 };

        return JSON.stringify({
          height: box.height,
          width: box.width,
          x: box.x,
          y: box.y,
        });
      })
    ).pipe(Effect.flatMap(decoded(TitleBoxSchema, "measure the title")));

    yield* attempt("tap the moment away", () =>
      page.locator("nostakes-moment .card").click()
    );

    const before = yield* read(
      page,
      "JSON.stringify(window.__frames)",
      FramesSchema,
      "count frames"
    );

    const started = performance.now();

    yield* attempt("wait for the clip to be made or refused", () =>
      page
        .locator(
          'nostakes-moment[data-clip="Ready"], nostakes-moment[data-clip="Unavailable"]'
        )
        .waitFor({ state: "attached", timeout: 120_000 })
    );

    const readyMs = Math.round(performance.now() - started);

    const after = yield* read(
      page,
      "JSON.stringify(window.__frames)",
      FramesSchema,
      "count frames"
    );

    const state = yield* attempt("read the clip state", () =>
      page
        .locator("nostakes-moment")
        .evaluate((node) =>
          node instanceof HTMLElement ? (node.dataset.clip ?? "none") : "none"
        )
    );

    const label = `${engine.name()}-${look.sample}-${look.theme.toLowerCase()}-chat`;

    if (state !== "Ready") {
      const shown = yield* attempt("look for the Clip button", () =>
        page.locator("nostakes-moment .clip").isVisible()
      );

      return {
        label,
        line: `${label}: no clip on this browser (${state}), Clip button ${shown ? "shown" : "hidden"}`,
        problems: [
          ...(shown
            ? [`${label}: the Clip button shows though no clip can be made`]
            : []),
          ...(settings.require === "nothing"
            ? []
            : [`${label}: no clip was made`]),
        ],
      };
    }

    yield* attempt("tap Keep", () =>
      page.locator("nostakes-moment .keep").click()
    );
    yield* attempt("tap Clip", () =>
      page.locator("nostakes-moment .clip").click()
    );
    yield* attempt("wait for both taps to reach the share sheet", () =>
      page.waitForFunction("window.__shared.length >= 2", undefined, {
        timeout: 15_000,
      })
    );

    const shared = yield* read(
      page,
      "JSON.stringify(window.__shared)",
      SharedSchema,
      "read what was shared"
    );

    const clipIndex = shared.findIndex((entry) => entry.type === "video/mp4");
    const stillIndex = shared.findIndex((entry) => entry.type === "image/png");
    const offered = shared[clipIndex];
    const tapProblems: string[] = [];

    if (offered === undefined || stillIndex === -1) {
      return {
        label,
        line: `${label}: the share sheet got ${shared.map((entry) => entry.type).join(", ")}`,
        problems: [
          `${label}: the clip or the still never reached the share sheet`,
        ],
      };
    }

    if (!offered.sameTask || offered.activated === false) {
      tapProblems.push(
        `${label}: the clip reached the share sheet outside the tap`
      );
    }

    const verdict = yield* judged(
      page,
      settings,
      { clip: clipIndex, label, still: stillIndex, title },
      { frame: "Chat", sound }
    );

    return {
      label,
      line: `${label}: ${verdict.bytes} bytes, ready ${readyMs} ms after the moment left, ${after.late - before.late} late frames of ${after.frames - before.frames}, title on frame 0 off by ${((verdict.played?.titleFar ?? 1) * 100).toFixed(1)}%, last frame mean difference ${verdict.played?.mean.toFixed(2) ?? "?"} with ${((verdict.played?.far ?? 0) * 100).toFixed(2)}% far off${verdict.probed ? "" : ", no ffprobe"}${sound ? ", with sound" : ", silent"}; ${verdict.colours}`,
      problems: [
        ...tapProblems,
        ...verdict.problems.map((problem) => `${label}: ${problem}`),
        ...(settings.require === "sound" && !sound
          ? [`${label}: this browser cannot encode the sting`]
          : []),
      ],
    };
  }).pipe(Effect.scoped);

const askedClip = (engine: BrowserType, settings: Settings) =>
  Effect.gen(function* askForClip() {
    const opened = yield* mutedBrowser(engine);

    const context = yield* attempt("open a phone-sized context", () =>
      opened.newContext({
        hasTouch: true,
        viewport: { height: 844, width: 390 },
      })
    );

    yield* attempt("stub the share sheet", () =>
      Promise.all([
        context.addInitScript(SHARE_STUB),
        context.addInitScript(CLIP_TOOLS),
      ])
    );

    const page = yield* attempt("open a page", () => context.newPage());
    const label = `${engine.name()}-asked`;

    yield* throttled(page, engine, settings.throttle);
    yield* attempt("open the stage", () =>
      page.goto(`${STAGE}/stage.html?view=live&sample=Bluff-2&theme=Dark`)
    );
    yield* attempt("wait for the pictures", () =>
      page
        .locator('nostakes-moment[data-drawn="Chat Story"]')
        .waitFor({ state: "attached", timeout: 60_000 })
    );
    yield* attempt("tap the moment away", () =>
      page.locator("nostakes-moment .card").click()
    );

    const offered = yield* attempt("wait for the Clip button", () =>
      page
        .locator("nostakes-moment .clip")
        .waitFor({ state: "visible", timeout: 30_000 })
    ).pipe(
      Effect.as(true),
      Effect.catchTag("ClipCheckFailed", () => Effect.succeed(false))
    );

    if (!offered) {
      return {
        label,
        line: `${label}: no Clip button on this browser`,
        problems:
          settings.require === "nothing"
            ? []
            : [`${label}: the Clip button never showed`],
      };
    }

    yield* attempt("tap Clip before it is ready", () =>
      page.locator("nostakes-moment .clip").click()
    );
    yield* attempt("wait for the clip to be shared or to ask for a tap", () =>
      page.waitForFunction(
        `window.__shared.length > 0 || document.querySelector("nostakes-moment").dataset.clip === "Share"`,
        undefined,
        { timeout: 120_000 }
      )
    );

    const before = yield* read(
      page,
      "JSON.stringify(window.__shared)",
      SharedSchema,
      "read what was shared"
    );

    const secondTap = before.length === 0;

    if (secondTap) {
      yield* attempt("tap Share clip", () =>
        page.locator("nostakes-moment .clip").click()
      );
      yield* attempt("wait for the share sheet", () =>
        page.waitForFunction("window.__shared.length > 0", undefined, {
          timeout: 15_000,
        })
      );
    }

    const shared = yield* read(
      page,
      "JSON.stringify(window.__shared)",
      SharedSchema,
      "read what was shared"
    );

    const [clip] = shared;
    const problems: string[] = [];

    if (clip?.type !== "video/mp4") {
      problems.push(`${label}: the share sheet got ${clip?.type ?? "nothing"}`);
    } else if (secondTap ? !clip.sameTask : clip.activated === false) {
      problems.push(`${label}: the clip reached the share sheet without a tap`);
    }

    return {
      label,
      line: `${label}: a tap before the clip was ready ${secondTap ? "turned the button into Share clip, and a second tap shared it" : "shared it as soon as it was made"}`,
      problems,
    };
  }).pipe(Effect.scoped);

const refusedClip = (engine: BrowserType) =>
  Effect.gen(function* refuseClip() {
    const opened = yield* mutedBrowser(engine);

    const context = yield* attempt("open a phone-sized context", () =>
      opened.newContext({
        hasTouch: true,
        viewport: { height: 844, width: 390 },
      })
    );

    yield* attempt("take the video encoder away", () =>
      context.addInitScript("delete globalThis.VideoEncoder;")
    );

    const page = yield* attempt("open a page", () => context.newPage());
    const label = `${engine.name()}-no-encoder`;

    yield* attempt("open the stage", () =>
      page.goto(`${STAGE}/stage.html?view=live&sample=BigHand-2&theme=Light`)
    );
    yield* attempt("wait for the pictures", () =>
      page
        .locator('nostakes-moment[data-drawn="Chat Story"]')
        .waitFor({ state: "attached", timeout: 60_000 })
    );
    yield* attempt("tap the moment away", () =>
      page.locator("nostakes-moment .card").click()
    );
    yield* attempt("wait for the clip to be refused", () =>
      page
        .locator('nostakes-moment[data-clip="Unavailable"]')
        .waitFor({ state: "attached", timeout: 30_000 })
    );

    const shown = yield* attempt("look for the Clip button", () =>
      page.locator("nostakes-moment .clip").isVisible()
    );

    const kept = yield* attempt("look for Keep", () =>
      page.locator("nostakes-moment .keep").isVisible()
    );

    return {
      label,
      line: `${label}: Keep ${kept ? "shown" : "hidden"}, Clip ${shown ? "shown" : "hidden"}`,
      problems: [
        ...(shown ? [`${label}: the Clip button shows with no encoder`] : []),
        ...(kept ? [] : [`${label}: Keep is gone with the clip`]),
      ],
    };
  }).pipe(Effect.scoped);

const HELD_MS = 4000;

const stateOf = (page: Page) =>
  attempt("read the clip state", () =>
    page
      .locator("nostakes-moment")
      .evaluate((node) =>
        node instanceof HTMLElement ? (node.dataset.clip ?? "none") : "none"
      )
  );

const turnTo = (page: Page, yours: boolean) =>
  attempt("deal the player in", () =>
    page.locator("nostakes-moment").evaluate((node, dealing) => {
      Reflect.set(node, "dealing", dealing);
    }, yours)
  );

const abandonedClip = (engine: BrowserType) =>
  Effect.gen(function* abandonClip() {
    const opened = yield* mutedBrowser(engine);

    const page = yield* attempt("open a page", () =>
      opened.newPage({ viewport: { height: 844, width: 390 } })
    );

    const label = `${engine.name()}-your-turn`;

    yield* attempt("open the stage", () =>
      page.goto(`${STAGE}/stage.html?view=live&sample=Cooler-2&theme=Light`)
    );
    yield* attempt("wait for the pictures", () =>
      page
        .locator('nostakes-moment[data-drawn="Chat Story"]')
        .waitFor({ state: "attached", timeout: 60_000 })
    );
    yield* attempt("tap the moment away", () =>
      page.locator("nostakes-moment .card").click()
    );

    const started = yield* attempt("wait for the clip to start", () =>
      page
        .locator('nostakes-moment[data-clip="Making"]')
        .waitFor({ state: "attached", timeout: 30_000 })
    ).pipe(
      Effect.as(true),
      Effect.catchTag("ClipCheckFailed", () => Effect.succeed(false))
    );

    if (!started) {
      return { label, line: `${label}: no clip on this browser`, problems: [] };
    }

    yield* turnTo(page, true);
    yield* attempt("let the turn run", () => page.waitForTimeout(HELD_MS));

    const during = yield* stateOf(page);

    yield* turnTo(page, false);

    const resumed = yield* attempt("wait for the clip after the turn", () =>
      page
        .locator('nostakes-moment[data-clip="Ready"]')
        .waitFor({ state: "attached", timeout: 60_000 })
    ).pipe(
      Effect.as(true),
      Effect.catchTag("ClipCheckFailed", () => Effect.succeed(false))
    );

    return {
      label,
      line: `${label}: ${during} through ${HELD_MS} ms of the player's turn, ${resumed ? "made after it" : "never made after it"}`,
      problems: [
        ...(during === "Waiting"
          ? []
          : [
              `${label}: the clip went on to ${during} during the player's turn`,
            ]),
        ...(resumed
          ? []
          : [`${label}: the clip was not made once the turn passed`]),
      ],
    };
  }).pipe(Effect.scoped);

const StagedSchema = Schema.Struct({
  failure: Schema.optional(Schema.String),
  lateBefore: Schema.optional(Schema.Int),
  lateDuring: Schema.optional(Schema.Int),
  longestBeforeMs: Schema.optional(Schema.Int),
  longestDuringMs: Schema.optional(Schema.Int),
  ms: Schema.optional(Schema.Int),
  size: Schema.optional(Schema.Int),
  slices: Schema.optional(Schema.Array(Schema.Int)),
  support: Schema.optional(
    Schema.NullOr(
      Schema.Struct({ codec: Schema.String, sound: Schema.Boolean })
    )
  ),
  title: Schema.optional(TitleBoxSchema),
});

const stagedClip = (
  engine: BrowserType,
  settings: Settings,
  look: {
    readonly frame: Frame;
    readonly pace: string;
    readonly sample: string;
    readonly theme: string;
  }
) =>
  Effect.gen(function* stageClip() {
    const opened = yield* mutedBrowser(engine);
    const context = yield* attempt("open a context", () => opened.newContext());

    yield* attempt("add the judge", () => context.addInitScript(CLIP_TOOLS));

    const page = yield* attempt("open a page", () => context.newPage());

    yield* throttled(page, engine, settings.throttle);
    yield* attempt("open the clip stage", () =>
      page.goto(
        `${STAGE}/clip.html?sample=${look.sample}&theme=${look.theme}&frame=${look.frame}&pace=${look.pace}`
      )
    );
    yield* attempt("wait for the clip", () =>
      page
        .locator("html[data-staged]")
        .waitFor({ state: "attached", timeout: 180_000 })
    );

    const staged = yield* attempt("read the stage", () =>
      page
        .locator("#stage")
        .evaluate((node) =>
          node instanceof HTMLElement ? (node.dataset.result ?? "") : ""
        )
    ).pipe(Effect.flatMap(decoded(StagedSchema, "read the stage")));

    const label = `${engine.name()}-${look.sample}-${look.theme.toLowerCase()}-${look.frame.toLowerCase()}`;

    if (staged.support === null || staged.support === undefined) {
      return {
        label,
        line: `${label}: no clip on this browser ${staged.failure ?? ""}`,
        problems:
          settings.require === "nothing" ? [] : [`${label}: no clip was made`],
      };
    }

    const verdict = yield* judged(
      page,
      settings,
      { clip: 1, label, still: 0, title: staged.title ?? NO_TITLE },
      { frame: look.frame, sound: staged.support.sound }
    );

    return {
      label,
      line: `${label}: ${verdict.bytes} bytes in ${staged.ms ?? 0} ms (${look.pace}), main-thread slices ${(staged.slices ?? []).join(" ")} ms, late frames ${staged.lateDuring ?? 0} during and ${staged.lateBefore ?? 0} in a second before, longest ${staged.longestDuringMs ?? 0} ms against ${staged.longestBeforeMs ?? 0} ms, title on frame 0 off by ${((verdict.played?.titleFar ?? 1) * 100).toFixed(1)}%, last frame mean difference ${verdict.played?.mean.toFixed(2) ?? "?"}`,
      problems: verdict.problems.map((problem) => `${label}: ${problem}`),
    };
  }).pipe(Effect.scoped);

const listOf = (name: string, fallback: string) =>
  Config.String(name).pipe(
    Config.withDefault(fallback),
    Config.map((text) => text.split(",").filter((each) => each.length > 0))
  );

const program = Effect.gen(function* checkClips() {
  const engines = yield* listOf("CLIP_ENGINES", "chromium,webkit");
  const samples = yield* listOf("CLIP_SAMPLES", "BigHand-2,BadBeat-1");
  const themes = yield* listOf("CLIP_THEMES", "Light");
  const frames = yield* listOf("CLIP_FRAMES", "Chat");

  const pace = yield* Config.String("CLIP_PACE").pipe(
    Config.withDefault("Quiet")
  );

  const dir = yield* Config.String("CLIPS_DIR").pipe(Config.option);

  const throttle = yield* Config.Number("CLIP_THROTTLE").pipe(
    Config.withDefault(1)
  );

  const require = yield* Config.Literals(
    ["nothing", "sound", "video"],
    "CLIP_REQUIRE"
  ).pipe(Config.withDefault("nothing" as const));

  const settings: Settings = { dir, require, throttle };

  yield* stageServer;

  const chosen = [chromium, webkit].filter((engine) =>
    engines.includes(engine.name())
  );

  const problems: string[] = [];

  for (const engine of chosen) {
    if (pace === "Quiet" && frames.includes("Chat")) {
      for (const flow of [
        refusedClip(engine),
        askedClip(engine, settings),
        abandonedClip(engine),
      ]) {
        const checked = yield* flow;

        yield* Console.log(
          `${checked.problems.length === 0 ? "ok  " : "FAIL"} ${checked.line}`
        );
        problems.push(...checked.problems);
      }
    }

    for (const sample of samples) {
      for (const theme of themes) {
        for (const frame of frames) {
          const checked =
            frame === "Chat" && pace === "Quiet"
              ? yield* liveClip(engine, settings, { sample, theme })
              : yield* stagedClip(engine, settings, {
                  frame: frame === "Story" ? "Story" : "Chat",
                  pace,
                  sample,
                  theme,
                });

          yield* Console.log(
            `${checked.problems.length === 0 ? "ok  " : "FAIL"} ${checked.line}`
          );

          for (const problem of checked.problems) {
            yield* Console.log(`     ${problem}`);
          }

          problems.push(...checked.problems);
        }
      }
    }
  }

  return problems.length === 0
    ? yield* Effect.void
    : yield* new ClipCheckFailed({
        detail: problems.join("; "),
        step: "check the clips",
      });
});

await Effect.runPromise(
  program.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
