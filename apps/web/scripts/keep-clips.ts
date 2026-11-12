import * as NodeServices from "@effect/platform-node/NodeServices";
import { Config, Console, Effect, Option, Schema } from "effect";
import * as FileSystem from "effect/FileSystem";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import { chromium, firefox, webkit } from "playwright-core";
import type { BrowserType, Page } from "playwright-core";

import { MEDIA_PACKAGES } from "../src/client/moments/mediabunny/packages.ts";
import {
  FULL_CUT_FROM_GB,
  LIGHT_CUT_SCALE,
  NO_CLIP_BELOW_GB,
  SHORT_ONLY_BELOW_GB,
} from "../src/features/moments/clip-reach.ts";
import { mutedBrowser, servedVite } from "./local-site.ts";
import {
  declaredColour,
  declaredText,
  ffmpegSwatches,
  swatchesOf,
  swatchProblems,
  swatchText,
} from "./moments/clip-colour.ts";
import type { Picture, Swatches } from "./moments/clip-colour.ts";
import { policyBreaks, watchPolicy } from "./page-evidence.ts";
import {
  SAFARI_ACTIVATION,
  SHARE_STUB,
  sharedAtLeast,
  sharedOrAsked,
} from "./share-stub.ts";
import { StageOrigin } from "./stage-origin.ts";
import { PAGE_POLICY_ASKED, pagePolicy } from "./stage-policy.ts";

const WEB = new URL("..", import.meta.url).pathname;

const STAGE = "/scripts/moments";

const SIZES = {
  Chat: { height: 1350, width: 1080 },
  Story: { height: 1920, width: 1080 },
} as const;

const SHORTEST_SECONDS = 2.9;

const LONGEST_SECONDS = 4.6;

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
    return `Checking a moment's clip failed at "${this.step}": ${this.detail}. Open ${STAGE}/stage.html?view=live on the stage server, tap the moment away, and tap Clip to see it.`;
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

const clipPolicy = policyBreaks();

const policed = (page: Page, name: string) =>
  watchPolicy(page).pipe(
    Effect.andThen(
      Effect.sync(() => {
        clipPolicy.listen(page, name);
      })
    )
  );

const stageServer = servedVite("start the stage server", "STAGE_PORT", {
  configFile: false,
  logLevel: "warn",
  optimizeDeps: { include: MEDIA_PACKAGES },
  plugins: [pagePolicy()],
  root: WEB,
}).pipe(
  Effect.mapError(
    (failure) =>
      new ClipCheckFailed({ detail: failure.detail, step: failure.step })
  )
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
    video.playbackRate = 2;
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

const TKHD_WIDTH_AT = 76;

const FIXED_ONE = 65_536;

const videoWidthOf = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset);

  const moov = boxesIn(bytes, 0, bytes.length).find(
    (box) => box.type === "moov"
  );

  const trak = inside(bytes, moov, "trak");
  const tkhd = inside(bytes, trak, "tkhd");

  return tkhd === undefined
    ? 0
    : view.getUint32(tkhd.body + TKHD_WIDTH_AT) / FIXED_ONE;
};

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

interface Told {
  readonly channels: number;
  readonly longest: number;
  readonly mostBytes: number;
  readonly shortest: number;
}

interface Expected {
  readonly frame: Frame;
  readonly seconds: Told;
  readonly sound: boolean;
}

const SHORT_CLIP: Told = {
  channels: 2,
  longest: LONGEST_SECONDS,
  mostBytes: MOST_BYTES,
  shortest: SHORTEST_SECONDS,
};

const REPLAY: Told = {
  channels: 2,
  longest: 25.2,
  mostBytes: 2_600_000,
  shortest: 11.9,
};

const DRIFT_REPLAY: Told = {
  channels: 2,
  longest: 13,
  mostBytes: 2_600_000,
  shortest: 11,
};

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

  if (
    atoms.seconds < expected.seconds.shortest ||
    atoms.seconds > expected.seconds.longest
  ) {
    problems.push(`the clip lasts ${atoms.seconds.toFixed(2)} s`);
  }

  if (Math.abs(frames / FPS - atoms.seconds) > 0.1) {
    problems.push(
      `${frames} frames do not fill ${atoms.seconds.toFixed(2)} s at ${FPS} a second`
    );
  }

  if (bytes.length > expected.seconds.mostBytes) {
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
      sound.channels === expected.seconds.channels)
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

const playbackProblems = (
  judged: typeof JudgedSchema.Type,
  expected: Expected
) => {
  const problems: string[] = [];
  const { height, width } = SIZES[expected.frame];

  if (!judged.ended || judged.currentTime < judged.duration - 1 / FPS) {
    problems.push(
      `playback stopped at ${judged.currentTime.toFixed(2)} of ${judged.duration.toFixed(2)} s`
    );
  }

  if (judged.width !== width || judged.height !== height) {
    problems.push(`the video plays at ${judged.width}x${judged.height}`);
  }

  if (judged.titleFar < TITLE_FAR) {
    problems.push(
      `the first frame gives the ending away: only ${(judged.titleFar * 100).toFixed(1)}% of the title's pixels differ from the still, so the title is already there`
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
        problems: playbackProblems(found, expected),
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
    const origin = yield* StageOrigin;

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

    yield* policed(page, engine.name());

    yield* throttled(page, engine, settings.throttle);
    yield* attempt("open the stage", () =>
      page.goto(
        `${origin}${STAGE}/stage.html?view=live&sample=${look.sample}&theme=${look.theme}`
      )
    );
    yield* attempt("wait for the pictures", () =>
      page
        .locator('nostakes-moment[data-drawn="Chat Story"]')
        .waitFor({ state: "attached", timeout: 60_000 })
    );

    const sound = true;

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
      sharedAtLeast(page, 2, 15_000)
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
      { frame: "Chat", seconds: SHORT_CLIP, sound }
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
    const origin = yield* StageOrigin;

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

    yield* policed(page, engine.name());
    const label = `${engine.name()}-asked`;

    yield* throttled(page, engine, settings.throttle);
    yield* attempt("open the stage", () =>
      page.goto(
        `${origin}${STAGE}/stage.html?view=live&sample=Bluff-2&theme=Dark`
      )
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
      sharedOrAsked(page, 120_000)
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
        sharedAtLeast(page, 1, 15_000)
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
    const origin = yield* StageOrigin;

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

    yield* policed(page, engine.name());
    const label = `${engine.name()}-no-encoder`;

    yield* attempt("open the stage", () =>
      page.goto(
        `${origin}${STAGE}/stage.html?view=live&sample=BigHand-2&theme=Light`
      )
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

const SHORT_LONGEST_SECONDS = 6;

const guardedClip = (engine: BrowserType, gigabytes: number) =>
  Effect.gen(function* guardClip() {
    const origin = yield* StageOrigin;
    const opened = yield* mutedBrowser(engine);

    const context = yield* attempt("open a phone-sized context", () =>
      opened.newContext({
        hasTouch: true,
        viewport: { height: 844, width: 390 },
      })
    );

    yield* attempt("report the device's memory", () =>
      Promise.all([
        context.addInitScript(SHARE_STUB),
        context.addInitScript(CLIP_TOOLS),
        context.addInitScript(
          `Object.defineProperty(Navigator.prototype, "deviceMemory", { configurable: true, get: () => ${gigabytes} });`
        ),
      ])
    );

    const page = yield* attempt("open a page", () => context.newPage());
    const label = `${engine.name()}-memory-${gigabytes}gb`;

    yield* policed(page, engine.name());
    yield* attempt("open the stage", () =>
      page.goto(
        `${origin}${STAGE}/stage.html?view=hand&hand=AcesCracked&theme=Light`
      )
    );
    yield* attempt("wait for the pictures", () =>
      page
        .locator('nostakes-moment[data-drawn="Chat Story"]')
        .waitFor({ state: "attached", timeout: 60_000 })
    );
    yield* attempt("tap the moment away", () =>
      page.locator("nostakes-moment .card").click()
    );
    yield* attempt("wait for the clip to be made or refused", () =>
      page
        .locator(
          'nostakes-moment[data-clip="Ready"], nostakes-moment[data-clip="Unavailable"]'
        )
        .waitFor({ state: "attached", timeout: 120_000 })
    );

    const state = yield* stateOf(page);

    if (gigabytes < NO_CLIP_BELOW_GB) {
      return {
        label,
        line: `${label}: clip ${state}`,
        problems:
          state === "Unavailable"
            ? []
            : [
                `${label}: a device reporting ${gigabytes} GB still made a clip`,
              ],
      };
    }

    yield* attempt("tap Clip", () =>
      page.locator("nostakes-moment .clip").click()
    );
    yield* attempt("wait for the clip to reach the share sheet", () =>
      sharedAtLeast(page, 1, 15_000)
    );

    const bytes = yield* fileOf(page, 0);
    const { seconds } = atomsOf(bytes);
    const width = videoWidthOf(bytes);
    const replayed = seconds > SHORT_LONGEST_SECONDS;
    const wanted = gigabytes >= SHORT_ONLY_BELOW_GB;

    const wantedWidth =
      gigabytes >= FULL_CUT_FROM_GB
        ? 1080
        : Math.round((1080 * LIGHT_CUT_SCALE) / 2) * 2;

    return {
      label,
      line: `${label}: ${replayed ? "the replay" : "the short clip"}, ${seconds.toFixed(2)} s, ${width} wide`,
      problems: [
        ...(replayed === wanted
          ? []
          : [
              `${label}: a device reporting ${gigabytes} GB got ${replayed ? "the replay" : "the short clip"}`,
            ]),
        ...(!replayed || width === wantedWidth
          ? []
          : [
              `${label}: a device reporting ${gigabytes} GB got a replay ${width} wide, not ${wantedWidth}`,
            ]),
      ],
    };
  }).pipe(Effect.scoped);

const turnTo = (page: Page, yours: boolean) =>
  attempt("deal the player in", () =>
    page.locator("nostakes-moment").evaluate((node, dealing) => {
      Reflect.set(node, "dealing", dealing);
    }, yours)
  );

const TURN_SETTLES_MS = 500;

const madeOf = (page: Page) =>
  attempt("read how much of the clip is made", () =>
    page
      .locator("nostakes-moment")
      .evaluate((node) =>
        node instanceof HTMLElement ? Number(node.dataset.made ?? "0") : 0
      )
  );

const abandonedClip = (engine: BrowserType) =>
  Effect.gen(function* abandonClip() {
    const origin = yield* StageOrigin;

    const opened = yield* mutedBrowser(engine);

    const page = yield* attempt("open a page", () =>
      opened.newPage({ viewport: { height: 844, width: 390 } })
    );

    yield* policed(page, engine.name());

    const label = `${engine.name()}-your-turn`;

    yield* attempt("open the stage", () =>
      page.goto(
        `${origin}${STAGE}/stage.html?view=live&sample=Cooler-2&theme=Light`
      )
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

    yield* attempt("wait for the first frames", () =>
      page.waitForFunction(
        () => {
          const node = globalThis.document.querySelector("nostakes-moment");

          return node instanceof HTMLElement && Number(node.dataset.made) > 0;
        },
        undefined,
        { timeout: 30_000 }
      )
    );
    yield* turnTo(page, true);
    yield* attempt("let a frame in flight land", () =>
      page.waitForTimeout(TURN_SETTLES_MS)
    );

    const turnStarts = yield* madeOf(page);

    yield* attempt("let the turn run", () => page.waitForTimeout(HELD_MS));

    const during = yield* stateOf(page);
    const turnEnds = yield* madeOf(page);

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
      line: `${label}: ${during} at ${turnStarts}% through ${HELD_MS} ms of the player's turn and ${turnEnds}% at its end, ${resumed ? "made after it" : "never made after it"}`,
      problems: [
        ...(during === "Making" && turnEnds === turnStarts
          ? []
          : [
              `${label}: the clip went on to ${during}, ${turnStarts}% to ${turnEnds}%, during the player's turn`,
            ]),
        ...(resumed
          ? []
          : [`${label}: the clip was not made once the turn passed`]),
      ],
    };
  }).pipe(Effect.scoped);

const OWED_LIMIT_MS = 240_000;

const clipText = (page: Page) =>
  attempt("read the Clip button", () =>
    page.locator("nostakes-moment .clip").evaluate((node) => ({
      shown: node.getClientRects().length > 0,
      text: node.textContent,
    }))
  );

const sharedCount = (page: Page) =>
  attempt("count what was shared", () =>
    page.evaluate<number>("window.__shared.length")
  );

const DRIFT_ANSWERS_WITHIN_MS = 5000;

const owedClip = (engine: BrowserType, settings: Settings) =>
  Effect.gen(function* oweClip() {
    const origin = yield* StageOrigin;
    const opened = yield* mutedBrowser(engine);

    const context = yield* attempt("open a phone-sized context", () =>
      opened.newContext({
        hasTouch: true,
        viewport: { height: 844, width: 390 },
      })
    );

    yield* attempt("stub a share sheet that wants a fresh tap", () =>
      Promise.all([
        context.addInitScript(SHARE_STUB),
        context.addInitScript(SAFARI_ACTIVATION),
      ])
    );

    const page = yield* attempt("open a page", () => context.newPage());
    const label = `${engine.name()}-owed`;
    const moment = page.locator("nostakes-moment");
    const problems: string[] = [];

    yield* policed(page, engine.name());
    yield* throttled(page, engine, settings.throttle);
    yield* attempt("open the stage", () =>
      page.goto(
        `${origin}${STAGE}/stage.html?view=hand&hand=AcesCracked&theme=Light`
      )
    );
    yield* attempt("wait for the pictures", () =>
      page
        .locator('nostakes-moment[data-drawn="Chat Story"]')
        .waitFor({ state: "attached", timeout: 60_000 })
    );
    yield* attempt("tap the moment away", () =>
      page.locator("nostakes-moment .card").click()
    );

    const offered = yield* attempt("wait for Drift", () =>
      page
        .locator("nostakes-moment .style")
        .waitFor({ state: "visible", timeout: 60_000 })
    ).pipe(
      Effect.as(true),
      Effect.catchTag("ClipCheckFailed", () => Effect.succeed(false))
    );

    if (!offered) {
      return {
        label,
        line: `${label}: no replay clip on this browser`,
        problems: [],
      };
    }

    const asked = performance.now();

    yield* attempt("tap Clip", () =>
      page.locator("nostakes-moment .clip").click()
    );
    yield* attempt("let the clip start", () => page.waitForTimeout(2000));
    yield* attempt("tap Drift", () =>
      page.locator("nostakes-moment .style").click()
    );

    const answered = yield* attempt("read the answer to Drift", () =>
      page
        .waitForFunction(
          () =>
            [
              ...(document
                .querySelector("nostakes-moment")
                ?.shadowRoot?.querySelectorAll(".clip, .style") ?? []),
            ].some((button) => (button.textContent ?? "").includes("Drift")),
          undefined,
          { timeout: DRIFT_ANSWERS_WITHIN_MS }
        )
        .catch(() => null)
        .then(() =>
          moment.evaluate((node) =>
            [...(node.shadowRoot?.querySelectorAll(".clip, .style") ?? [])]
              .map((button) => button.textContent)
              .join(" ")
          )
        )
    );

    if (!answered.includes("Drift")) {
      problems.push(`${label}: a tap on Drift showed nothing: ${answered}`);
    }

    yield* turnTo(page, true);
    yield* attempt("hold the next hand's turn", () =>
      page.waitForTimeout(HELD_MS)
    );
    yield* turnTo(page, false);
    yield* attempt("tell the next hand", () =>
      page.evaluate<null>("window.__tellHand('QuadsIntoBoat') ?? null")
    );
    yield* attempt("wait for the next moment", () =>
      page
        .locator('nostakes-moment:not([data-moment="1:BadBeat:2:0,1"])')
        .waitFor({ state: "attached", timeout: 30_000 })
    );
    yield* attempt("tap the next moment away", () =>
      page.locator("nostakes-moment .card").click()
    );

    const carried = yield* clipText(page);

    if (!carried.shown) {
      problems.push(
        `${label}: the clip the player asked for left with the next moment`
      );
    }

    const taps = { count: 0 };
    const shared = { at: Option.none<number>() };

    while (
      Option.isNone(shared.at) &&
      carried.shown &&
      performance.now() - asked < OWED_LIMIT_MS
    ) {
      if ((yield* sharedCount(page)) > 0) {
        shared.at = Option.some(performance.now() - asked);
      } else {
        const now = yield* clipText(page);
        const text = now.text ?? "";

        if (
          now.shown &&
          (text.startsWith("Share") || text.includes("Try again"))
        ) {
          taps.count += 1;
          yield* attempt("tap the clip", () =>
            page.locator("nostakes-moment .clip").click()
          );
        }

        yield* attempt("wait a moment", () => page.waitForTimeout(250));
      }
    }

    const took = Option.match(shared.at, {
      onNone: () => "never shared",
      onSome: (ms) => `shared ${Math.round(ms / 1000)} s after the tap`,
    });

    if (Option.isNone(shared.at)) {
      problems.push(
        `${label}: the clip the player asked for was never shared (${(yield* clipText(page)).text ?? ""})`
      );
    }

    return {
      label,
      line: `${label}: Drift answered "${answered}", the clip ${carried.shown ? "stayed" : "left"} through a turn and the next moment, ${took} after ${taps.count} more taps`,
      problems,
    };
  }).pipe(Effect.scoped);

const PAST_THE_OFFER_MS = 27_000;

const lingeredClip = (engine: BrowserType) =>
  Effect.gen(function* lingerClip() {
    const origin = yield* StageOrigin;
    const opened = yield* mutedBrowser(engine);

    const context = yield* attempt("open a phone-sized context", () =>
      opened.newContext({
        hasTouch: true,
        viewport: { height: 844, width: 390 },
      })
    );

    yield* attempt("stub the share sheet", () =>
      context.addInitScript(SHARE_STUB)
    );

    const page = yield* attempt("open a page", () => context.newPage());
    const label = `${engine.name()}-lingering`;
    const tab = page.locator("nostakes-moment .keeping");

    yield* policed(page, engine.name());
    yield* attempt("open the stage", () =>
      page.goto(
        `${origin}${STAGE}/stage.html?view=live&sample=Cooler-2&theme=Light`
      )
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
    yield* attempt("hold the turn past the Keep tab's time", () =>
      page.waitForTimeout(PAST_THE_OFFER_MS)
    );

    const lingering = yield* attempt("look for a lingering tab", () =>
      page.locator('nostakes-moment[data-lingering="true"]').count()
    );

    const hiddenInTurn = !(yield* attempt("look at the tab in the turn", () =>
      tab.isVisible()
    ));

    yield* turnTo(page, false);

    const backAfterTurn = yield* attempt("look at the tab after the turn", () =>
      tab.isVisible()
    );

    const made = yield* attempt("wait for the clip", () =>
      page
        .locator('nostakes-moment[data-clip="Ready"]')
        .waitFor({ state: "attached", timeout: 60_000 })
    ).pipe(
      Effect.as(true),
      Effect.catchTag("ClipCheckFailed", () => Effect.succeed(false))
    );

    const offered = made
      ? yield* attempt("tap Clip on the lingering tab", () =>
          page.locator("nostakes-moment .clip").click()
        ).pipe(
          Effect.andThen(
            attempt("wait for the clip to reach the share sheet", () =>
              sharedAtLeast(page, 1, 15_000)
            )
          ),
          Effect.as(true),
          Effect.catchTag("ClipCheckFailed", () => Effect.succeed(false))
        )
      : false;

    yield* attempt("hide the tab", () =>
      page.locator("nostakes-moment .hide").click()
    ).pipe(Effect.catchTag("ClipCheckFailed", () => Effect.void));

    const hidden = !(yield* attempt("look at the tab after Hide", () =>
      tab.isVisible()
    ));

    return {
      label,
      line: `${label}: ${lingering > 0 ? "lingered" : "left"} past the Keep tab's time, ${hiddenInTurn ? "hidden" : "shown"} in the turn, ${backAfterTurn ? "back" : "gone"} after it, ${made ? "made" : "never made"}, ${offered ? "shared" : "not shared"}, ${hidden ? "gone" : "still there"} after Hide`,
      problems: [
        ...(lingering > 0
          ? []
          : [`${label}: the tab left with the clip still being made`]),
        ...(hiddenInTurn
          ? []
          : [`${label}: the lingering tab stayed through the player's turn`]),
        ...(backAfterTurn
          ? []
          : [`${label}: the tab did not come back after the turn`]),
        ...(made ? [] : [`${label}: the clip was never made`]),
        ...(offered
          ? []
          : [`${label}: Clip on the lingering tab shared nothing`]),
        ...(hidden ? [] : [`${label}: Hide left the tab on the table`]),
      ],
    };
  }).pipe(Effect.scoped);

const FilmResultSchema = Schema.Struct({
  compared: Schema.optionalKey(
    Schema.NullOr(
      Schema.Struct({
        frames: Schema.Int,
        most: Schema.Int,
        pixels: Schema.Int,
      })
    )
  ),
  ms: Schema.optionalKey(Schema.Finite),
  redrawn: Schema.optionalKey(Schema.Int),
  state: Schema.String,
});

const filmResult = (engine: BrowserType, query: string) =>
  Effect.gen(function* makeTestFilm() {
    const origin = yield* StageOrigin;
    const opened = yield* mutedBrowser(engine);
    const page = yield* attempt("open a page", () => opened.newPage());

    yield* policed(page, engine.name());
    yield* attempt("open the film stage", () =>
      page.goto(`${origin}${STAGE}/film.html?${query}`)
    );
    yield* attempt("wait for the film", () =>
      page.waitForFunction(
        () => {
          const stage = document.querySelector("#stage");

          return (
            stage instanceof HTMLElement && stage.dataset.result !== undefined
          );
        },
        undefined,
        { timeout: 300_000 }
      )
    );

    return yield* read(
      page,
      'document.querySelector("#stage").dataset.result',
      FilmResultSchema,
      "read the film's result"
    );
  }).pipe(Effect.scoped);

const SyncResultSchema = Schema.Struct({
  flashes: Schema.optionalKey(Schema.Array(Schema.Finite)),
  frames: Schema.optionalKey(Schema.Int),
  state: Schema.String,
});

const SoundProbeSchema = Schema.Struct({
  streams: Schema.Array(
    Schema.Struct({
      bit_rate: Schema.optional(Schema.String),
      channel_layout: Schema.optional(Schema.String),
      channels: Schema.optional(Schema.Int),
      codec_name: Schema.optional(Schema.String),
      profile: Schema.optional(Schema.String),
      sample_rate: Schema.optional(Schema.String),
    })
  ),
});

const SYNC_FPS = 30;

const SYNC_RATE = 48_000;

const SYNC_TOLERANCE_MS = 2;

const QUIET_LEVEL = 1500;

const SEARCH_MS = 250;

const filmBytes = (page: Page) =>
  attempt("read the film's bytes", () =>
    page.evaluate<string>("window.__filmText()")
  ).pipe(Effect.map((text) => Uint8Array.from(Buffer.from(text, "base64"))));

const ffmpegTo = (args: readonly string[]) =>
  ChildProcessSpawner.pipe(
    Effect.flatMap((spawner) =>
      spawner.exitCode(
        ChildProcess.make("ffmpeg", ["-v", "error", "-y", ...args])
      )
    ),
    Effect.option
  );

interface Onset {
  readonly at: number;
  readonly quiet: boolean;
}

const onsetOf = (pcm: Int16Array, channel: number, around: number) => {
  const from = Math.max(
    0,
    Math.round(((around - SEARCH_MS) / 1000) * SYNC_RATE)
  );

  const to = Math.min(
    pcm.length / 2,
    Math.round(((around + SEARCH_MS) / 1000) * SYNC_RATE)
  );

  let loudest = 0;

  for (let at = from; at < to; at += 1) {
    loudest = Math.max(loudest, Math.abs(pcm[at * 2 + channel] ?? 0));
  }

  let found = -1;

  for (let at = from; at < to && found === -1; at += 1) {
    if (Math.abs(pcm[at * 2 + channel] ?? 0) > loudest / 2) {
      found = at;
    }
  }

  const onset: Onset = {
    at: found === -1 ? Number.NaN : (found * 1000) / SYNC_RATE,
    quiet: loudest < QUIET_LEVEL,
  };

  return onset;
};

type SoundStream = (typeof SoundProbeSchema.Type)["streams"][number];

interface Decoded {
  readonly flashes: readonly number[];
  readonly pcm: Int16Array;
  readonly sound: SoundStream | undefined;
}

const decodedSync = (path: string) =>
  Effect.gen(function* decodeSync() {
    const fs = yield* FileSystem.FileSystem;
    const spawner = yield* ChildProcessSpawner;

    const probe = yield* spawner
      .string(
        ChildProcess.make("ffprobe", [
          "-v",
          "error",
          "-select_streams",
          "a:0",
          "-show_entries",
          "stream=codec_name,profile,channels,channel_layout,sample_rate,bit_rate",
          "-of",
          "json",
          path,
        ])
      )
      .pipe(Effect.option);

    const pictures = yield* ffmpegTo([
      "-i",
      path,
      "-map",
      "0:v",
      "-vf",
      "scale=8:8,format=gray",
      "-fps_mode",
      "passthrough",
      "-f",
      "rawvideo",
      `${path}.gray`,
    ]);

    const sounds = yield* ffmpegTo([
      "-i",
      path,
      "-map",
      "0:a",
      "-f",
      "s16le",
      "-acodec",
      "pcm_s16le",
      "-ac",
      "2",
      "-ar",
      String(SYNC_RATE),
      `${path}.pcm`,
    ]);

    if (
      Option.isNone(probe) ||
      Option.isNone(pictures) ||
      Option.isNone(sounds)
    ) {
      return Option.none<Decoded>();
    }

    const gray = yield* fs.readFile(`${path}.gray`);
    const raw = yield* fs.readFile(`${path}.pcm`);

    const { streams } = yield* decoded(
      SoundProbeSchema,
      "read ffprobe's answer"
    )(probe.value);

    const flashes = Array.from(
      { length: gray.length / 64 },
      (_, frame) =>
        gray
          .subarray(frame * 64, frame * 64 + 64)
          .reduce((total, value) => total + value, 0) / 64
    ).flatMap((mean, frame) => (mean > 128 ? [(frame * 1000) / SYNC_FPS] : []));

    return Option.some<Decoded>({
      flashes,
      pcm: new Int16Array(
        raw.buffer,
        raw.byteOffset,
        Math.floor(raw.byteLength / 2)
      ),
      sound: streams[0],
    });
  });

const soundText = (sound: SoundStream | undefined) =>
  sound === undefined
    ? "no sound"
    : [
        sound.codec_name,
        sound.profile,
        sound.channel_layout,
        `${sound.sample_rate ?? "?"} Hz`,
        `at ${Math.round(Number(sound.bit_rate ?? "0") / 1000)} kb/s`,
      ].join(" ");

const syncVerdict = (
  label: string,
  planned: { readonly flashes: readonly number[]; readonly frames: number },
  found: Decoded
) => {
  const [first = 0, last = 0] = planned.flashes;
  const heard = found.pcm.length / 2;
  const shown = (planned.frames * SYNC_RATE) / SYNC_FPS;
  const [shownFirst = Number.NaN, shownLast = Number.NaN] = found.flashes;
  const left = onsetOf(found.pcm, 0, shownFirst);
  const right = onsetOf(found.pcm, 1, shownLast);

  const apart =
    onsetOf(found.pcm, 1, shownFirst).quiet &&
    onsetOf(found.pcm, 0, shownLast).quiet;

  const lateFirst = left.at - shownFirst;
  const lateLast = right.at - shownLast;
  const half = 500 / SYNC_FPS;
  const { sound } = found;

  const placed =
    found.flashes.length === 2 &&
    Math.abs(shownFirst - first) < half &&
    Math.abs(shownLast - last) < half;

  const timed =
    Math.abs(lateFirst) <= SYNC_TOLERANCE_MS &&
    Math.abs(lateLast) <= SYNC_TOLERANCE_MS;

  return {
    label,
    line: `${label}: ${soundText(sound)}; ${heard} samples of sound under ${shown} samples' worth of picture; flashes at ${found.flashes.map((at) => (at / 1000).toFixed(3)).join(" and ")} s; the left click ${lateFirst.toFixed(2)} ms after the first, the right click ${lateLast.toFixed(2)} ms after the last; ${apart ? "each click only in its own channel" : "a click leaks into the other channel"}`,
    problems: [
      ...(placed
        ? []
        : [
            `${label}: the flashes show at ${found.flashes.join(", ")} ms, not ${first} and ${last}`,
          ]),
      ...(sound?.channels === 2
        ? []
        : [`${label}: the sound is ${soundText(sound)}`]),
      ...(timed
        ? []
        : [
            `${label}: the clicks land ${lateFirst.toFixed(2)} and ${lateLast.toFixed(2)} ms from their flashes, more than ${SYNC_TOLERANCE_MS} ms`,
          ]),
      ...(apart ? [] : [`${label}: a click is heard in the other channel`]),
      ...(heard === shown
        ? []
        : [
            `${label}: the sound plays ${(((heard - shown) * 1000) / SYNC_RATE).toFixed(2)} ms longer than the picture, so a player holds the last frame or cuts the sound`,
          ]),
    ],
  };
};

type SoundPath = "Browser" | "Extension";

const syncedFilm = (engine: BrowserType, aac: SoundPath) =>
  Effect.gen(function* checkSync() {
    const label = `${engine.name()}-sync-${aac === "Browser" ? "browser-aac" : "aac-extension"}`;
    const origin = yield* StageOrigin;
    const fs = yield* FileSystem.FileSystem;
    const opened = yield* mutedBrowser(engine);
    const page = yield* attempt("open a page", () => opened.newPage());

    yield* policed(page, engine.name());
    yield* attempt("open the film stage", () =>
      page.goto(`${origin}${STAGE}/film.html?scene=sync&seconds=25&aac=${aac}`)
    );
    yield* attempt("wait for the film", () =>
      page.waitForFunction(
        () => {
          const stage = document.querySelector("#stage");

          return (
            stage instanceof HTMLElement && stage.dataset.result !== undefined
          );
        },
        undefined,
        { timeout: 300_000 }
      )
    );

    const result = yield* read(
      page,
      'document.querySelector("#stage").dataset.result',
      SyncResultSchema,
      "read the film's result"
    );

    if (result.state !== "Made") {
      return {
        label,
        line: `${label}: no film (${result.state})`,
        problems: [`${label}: the sync film was not made`],
      };
    }

    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "nostakes-sync" });
    const path = `${dir}/sync.mp4`;

    yield* fs.writeFile(path, yield* filmBytes(page));

    return Option.match(yield* decodedSync(path), {
      onNone: () => ({
        label,
        line: `${label}: no ffmpeg to read the film with`,
        problems: [],
      }),
      onSome: (found) =>
        syncVerdict(
          label,
          { flashes: result.flashes ?? [], frames: result.frames ?? 0 },
          found
        ),
    });
  }).pipe(Effect.scoped);

const StreamsSchema = Schema.Struct({
  streams: Schema.Array(
    Schema.Struct({
      codec_type: Schema.String,
      duration: Schema.optional(Schema.String),
    })
  ),
});

const streamsOf = (path: string) =>
  Effect.gen(function* probeStreams() {
    const spawner = yield* ChildProcessSpawner;

    const probe = yield* spawner
      .string(
        ChildProcess.make("ffprobe", [
          "-v",
          "error",
          "-show_entries",
          "stream=codec_type,duration",
          "-of",
          "json",
          path,
        ])
      )
      .pipe(Effect.option);

    return yield* Option.match(probe, {
      onNone: () => Effect.succeedNone,
      onSome: (text) =>
        decoded(
          StreamsSchema,
          "read ffprobe's streams"
        )(text).pipe(Effect.map(({ streams }) => Option.some(streams))),
    });
  });

const blockedExtension = (engine: BrowserType) =>
  Effect.gen(function* checkBlocked() {
    const label = `${engine.name()}-aac-extension-refused`;
    const origin = yield* StageOrigin;
    const fs = yield* FileSystem.FileSystem;
    const opened = yield* mutedBrowser(engine);
    const page = yield* attempt("open a page", () => opened.newPage());

    yield* attempt("open the film stage", () =>
      page.goto(
        `${origin}${STAGE}/film.html?scene=sync&seconds=25&aac=Extension&${PAGE_POLICY_ASKED}`
      )
    );
    yield* attempt("wait for the film", () =>
      page.waitForFunction(
        () => {
          const stage = document.querySelector("#stage");

          return (
            stage instanceof HTMLElement && stage.dataset.result !== undefined
          );
        },
        undefined,
        { timeout: 300_000 }
      )
    );

    const result = yield* read(
      page,
      'document.querySelector("#stage").dataset.result',
      SyncResultSchema,
      "read the film's result"
    );

    if (result.state !== "Made") {
      return {
        label,
        line: `${label}: no film (${result.state})`,
        problems: [
          `${label}: the clip failed when the AAC extension could not run, where it should have come out silent`,
        ],
      };
    }

    const dir = yield* fs.makeTempDirectoryScoped({
      prefix: "nostakes-refused",
    });

    const path = `${dir}/refused.mp4`;

    yield* fs.writeFile(path, yield* filmBytes(page));

    return Option.match(yield* streamsOf(path), {
      onNone: () => ({
        label,
        line: `${label}: no ffprobe to read the film with`,
        problems: [],
      }),
      onSome: (streams) => {
        const kinds = streams.map((stream) => stream.codec_type);

        return {
          label,
          line: `${label}: made with ${kinds.join(" and ")} while the worker ran under the page's policy`,
          problems:
            kinds.join(",") === "video"
              ? []
              : [
                  `${label}: expected a silent clip, got streams ${kinds.join(", ")}`,
                ],
        };
      },
    });
  }).pipe(Effect.scoped);

const SHARP_TIMES = [1500, 5000, 9000, 13_000, 17_000];

const LEAST_PSNR = 36;

const MOST_EDGE_ERROR = 12;

const EDGE_GRADIENT = 60;

const lumaOf = (rgb: Uint8Array) =>
  Float32Array.from(
    { length: rgb.length / 3 },
    (_, at) =>
      0.2126 * (rgb[at * 3] ?? 0) +
      0.7152 * (rgb[at * 3 + 1] ?? 0) +
      0.0722 * (rgb[at * 3 + 2] ?? 0)
  );

const sharpnessOf = (
  reference: Float32Array,
  shown: Float32Array,
  width: number
) => {
  let squared = 0;
  let edges = 0;
  let edgeError = 0;

  for (let at = width + 1; at < reference.length - width - 1; at += 1) {
    const gap = (reference[at] ?? 0) - (shown[at] ?? 0);

    squared += gap * gap;

    const gradient =
      Math.abs((reference[at + 1] ?? 0) - (reference[at - 1] ?? 0)) +
      Math.abs((reference[at + width] ?? 0) - (reference[at - width] ?? 0));

    if (gradient > EDGE_GRADIENT) {
      edges += 1;
      edgeError += Math.abs(gap);
    }
  }

  return {
    edge: edgeError / Math.max(1, edges),
    psnr:
      10 * Math.log10((255 * 255) / Math.max(1e-9, squared / reference.length)),
  };
};

const rgbFrame = (args: readonly string[], out: string) =>
  ffmpegTo([
    ...args,
    "-frames:v",
    "1",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    out,
  ]);

const sharpFilm = (engine: BrowserType) =>
  Effect.gen(function* checkSharpness() {
    const label = `${engine.name()}-sharpness`;
    const origin = yield* StageOrigin;
    const fs = yield* FileSystem.FileSystem;
    const opened = yield* mutedBrowser(engine);
    const page = yield* attempt("open a page", () => opened.newPage());

    yield* policed(page, engine.name());
    yield* attempt("open the film stage", () =>
      page.goto(
        `${origin}${STAGE}/film.html?scene=replay&frame=Story&refs=${SHARP_TIMES.join(",")}`
      )
    );
    yield* attempt("wait for the film", () =>
      page.waitForFunction(
        () => {
          const stage = document.querySelector("#stage");

          return (
            stage instanceof HTMLElement && stage.dataset.result !== undefined
          );
        },
        undefined,
        { timeout: 300_000 }
      )
    );

    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "nostakes-sharp" });
    const path = `${dir}/film.mp4`;
    const bytes = yield* filmBytes(page);

    yield* fs.writeFile(path, bytes);

    const references = yield* read(
      page,
      "JSON.stringify(window.__references)",
      Schema.Array(Schema.String),
      "read the reference frames"
    );

    const scores: {
      readonly ms: number;
      readonly edge: number;
      readonly psnr: number;
    }[] = [];

    for (const [index, ms] of SHARP_TIMES.entries()) {
      const png = `${dir}/reference-${ms}.png`;

      yield* fs.writeFile(png, Buffer.from(references[index] ?? "", "base64"));

      const drawn = yield* rgbFrame(["-i", png], `${png}.rgb`);

      const shown = yield* rgbFrame(
        [
          "-i",
          path,
          "-vf",
          `select=eq(n\\,${Math.round((ms * SYNC_FPS) / 1000)})`,
        ],
        `${path}.${ms}.rgb`
      );

      if (Option.isSome(drawn) && Option.isSome(shown)) {
        scores.push({
          ms,
          ...sharpnessOf(
            lumaOf(yield* fs.readFile(`${png}.rgb`)),
            lumaOf(yield* fs.readFile(`${path}.${ms}.rgb`)),
            1080
          ),
        });
      }
    }

    if (scores.length === 0) {
      return {
        label,
        line: `${label}: no ffmpeg to read the film with`,
        problems: [],
      };
    }

    const worstEdge = Math.max(...scores.map((score) => score.edge));
    const worstPsnr = Math.min(...scores.map((score) => score.psnr));

    return {
      label,
      line: `${label}: ${bytes.length} bytes; against the frames drawn from the film, PSNR ${worstPsnr.toFixed(1)} dB at worst and ${worstEdge.toFixed(2)} levels on text and card edges at worst (${scores.map((score) => `${(score.ms / 1000).toFixed(1)} s ${score.edge.toFixed(1)}`).join(", ")})`,
      problems:
        worstPsnr >= LEAST_PSNR && worstEdge <= MOST_EDGE_ERROR
          ? []
          : [
              `${label}: the vertical replay drifts from its own frames by PSNR ${worstPsnr.toFixed(1)} dB and ${worstEdge.toFixed(2)} levels on edges`,
            ],
    };
  }).pipe(Effect.scoped);

const EDGE_NOISE_LEVELS = 12;

const EDGE_NOISE_PIXELS = 50;

const redrawnFilms = (engine: BrowserType) =>
  Effect.gen(function* compareRedraws() {
    const label = `${engine.name()}-redraw`;
    const lines: string[] = [];
    const problems: string[] = [];

    for (const scene of ["scene=replay", "scene=pan&seconds=4"]) {
      const made = yield* filmResult(engine, `${scene}&compare=true`);
      const compared = made.compared ?? { frames: 0, most: 0, pixels: 0 };
      const perFrame = compared.pixels / Math.max(1, compared.frames);

      lines.push(
        `${scene}: ${made.redrawn ?? 0} frames redrawn in part, ${compared.frames} differ from whole frames in ${compared.pixels} luma pixels by at most ${compared.most}`
      );

      if (
        made.state !== "Made" ||
        made.compared === undefined ||
        made.compared === null ||
        compared.most > EDGE_NOISE_LEVELS ||
        perFrame > EDGE_NOISE_PIXELS
      ) {
        problems.push(
          `${label}: ${scene} made ${made.state}, and redrawing in part left ${compared.pixels} luma pixels in ${compared.frames} frames up to ${compared.most} levels from whole frames`
        );
      }
    }

    return { label, line: `${label}: ${lines.join("; ")}`, problems };
  });

const STORY_CARD_TOP = (SIZES.Story.height - SIZES.Chat.height) / 2;

const replayedClip = (
  engine: BrowserType,
  settings: Settings,
  look: {
    readonly hand: string;
    readonly style: "Broadcast" | "Drift";
    readonly theme: string;
  }
) =>
  Effect.gen(function* keepReplay() {
    const origin = yield* StageOrigin;
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
    const label = `${engine.name()}-${look.hand}-${look.theme.toLowerCase()}-replay${look.style === "Drift" ? "-drift" : ""}`;

    yield* throttled(page, engine, settings.throttle);
    yield* attempt("open the stage", () =>
      page.goto(
        `${origin}${STAGE}/stage.html?view=hand&hand=${look.hand}&theme=${look.theme}`
      )
    );
    yield* attempt("wait for the moment", () =>
      page
        .locator("nostakes-moment[data-moment]")
        .waitFor({ state: "attached", timeout: 60_000 })
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

    const sound = true;

    yield* attempt("wait for the pictures", () =>
      page
        .locator('nostakes-moment[data-drawn="Chat Story"]')
        .waitFor({ state: "attached", timeout: 60_000 })
    );
    yield* attempt("tap the moment away", () =>
      page.locator("nostakes-moment .card").click()
    );

    if (look.style === "Drift") {
      yield* attempt("choose Drift", () =>
        page.locator("nostakes-moment .style").click({ timeout: 60_000 })
      );
      yield* attempt("wait for Drift to say it is being made", () =>
        page.waitForFunction(
          () =>
            [
              ...(globalThis.document
                .querySelector("nostakes-moment")
                ?.shadowRoot?.querySelectorAll(".clip, .style") ?? []),
            ].some((button) =>
              (button.textContent ?? "").startsWith("Making Drift")
            ),
          undefined,
          { timeout: 15_000 }
        )
      );
    }

    const before = yield* read(
      page,
      "JSON.stringify(window.__frames)",
      FramesSchema,
      "count frames"
    );

    const started = performance.now();

    yield* attempt("wait for the replay to be made or refused", () =>
      page.waitForFunction(
        () => {
          const node = globalThis.document.querySelector("nostakes-moment");

          return (
            node instanceof HTMLElement &&
            node.dataset.made === undefined &&
            ["Failed", "Ready", "Share", "Unavailable"].includes(
              node.dataset.clip ?? ""
            )
          );
        },
        undefined,
        { timeout: 240_000 }
      )
    );

    const readyMs = Math.round(performance.now() - started);

    const after = yield* read(
      page,
      "JSON.stringify(window.__frames)",
      FramesSchema,
      "count frames"
    );

    const state = yield* stateOf(page);

    if (state !== "Ready" && state !== "Share") {
      return {
        label,
        line: `${label}: no replay on this browser (${state})`,
        problems:
          settings.require === "nothing"
            ? []
            : [`${label}: no replay was made`],
      };
    }

    yield* attempt("tap Story", () =>
      page.locator("nostakes-moment .story").click()
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

    if (clipIndex === -1 || stillIndex === -1) {
      return {
        label,
        line: `${label}: the share sheet got ${shared.map((entry) => entry.type).join(", ")}`,
        problems: [
          `${label}: the replay or the still never reached the share sheet`,
        ],
      };
    }

    const verdict = yield* judged(
      page,
      settings,
      {
        clip: clipIndex,
        label,
        still: stillIndex,
        title: { ...title, y: title.y + STORY_CARD_TOP },
      },
      {
        frame: "Story",
        seconds: look.style === "Drift" ? DRIFT_REPLAY : REPLAY,
        sound,
      }
    );

    return {
      label,
      line: `${label}: ${verdict.bytes} bytes, ready ${readyMs} ms after the moment left, ${after.late - before.late} late frames of ${after.frames - before.frames}, title on frame 0 off by ${((verdict.played?.titleFar ?? 1) * 100).toFixed(1)}%, last frame mean difference ${verdict.played?.mean.toFixed(2) ?? "?"} with ${((verdict.played?.far ?? 0) * 100).toFixed(2)}% far off, ${verdict.played?.duration.toFixed(2) ?? "?"} s${sound ? ", with sound" : ", silent"}; ${verdict.colours}`,
      problems: verdict.problems.map((problem) => `${label}: ${problem}`),
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
    Schema.NullOr(Schema.Struct({ codec: Schema.String }))
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
    const origin = yield* StageOrigin;

    const opened = yield* mutedBrowser(engine);
    const context = yield* attempt("open a context", () => opened.newContext());

    yield* attempt("add the judge", () => context.addInitScript(CLIP_TOOLS));

    const page = yield* attempt("open a page", () => context.newPage());

    yield* policed(page, engine.name());

    yield* throttled(page, engine, settings.throttle);
    yield* attempt("open the clip stage", () =>
      page.goto(
        `${origin}${STAGE}/clip.html?sample=${look.sample}&theme=${look.theme}&frame=${look.frame}&pace=${look.pace}`
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
      { frame: look.frame, seconds: SHORT_CLIP, sound: true }
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

const reported = (checked: {
  readonly line: string;
  readonly problems: readonly string[];
}) =>
  Effect.gen(function* reportClip() {
    yield* Console.log(
      `${checked.problems.length === 0 ? "ok  " : "FAIL"} ${checked.line}`
    );

    for (const problem of checked.problems) {
      yield* Console.log(`     ${problem}`);
    }

    return checked.problems;
  });

const namedFlows = (
  only: readonly string[],
  engine: BrowserType,
  settings: Settings
) => [
  ...(only.includes("refused") ? [refusedClip(engine)] : []),
  ...(only.includes("turn") ? [abandonedClip(engine)] : []),
  ...(only.includes("owed") ? [owedClip(engine, settings)] : []),
];

const namedChecks = (
  only: readonly string[],
  chosen: readonly BrowserType[],
  settings: Settings
) =>
  Effect.gen(function* checkNamed() {
    const problems: string[] = [];

    for (const engine of chosen) {
      for (const flow of namedFlows(only, engine, settings)) {
        problems.push(...(yield* reported(yield* flow)));
      }
    }

    return problems;
  });

const firefoxChecks = (wanted: boolean) =>
  Effect.gen(function* checkFirefox() {
    const problems: string[] = [];

    for (const flow of wanted
      ? [syncedFilm(firefox, "Browser"), blockedExtension(firefox)]
      : []) {
      problems.push(...(yield* reported(yield* flow)));
    }

    return problems;
  });

const checks = Effect.gen(function* checkClips() {
  const engines = yield* listOf("CLIP_ENGINES", "chromium,webkit,firefox");
  const samples = yield* listOf("CLIP_SAMPLES", "BigHand-2,BadBeat-1");
  const hands = yield* listOf("CLIP_HANDS", "AcesCracked");
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

  const only = yield* listOf("CLIP_ONLY", "");

  const chosen = [chromium, webkit].filter((engine) =>
    engines.includes(engine.name())
  );

  const problems: string[] = [
    ...(yield* firefoxChecks(only.length === 0 && engines.includes("firefox"))),
    ...(yield* namedChecks(only, chosen, settings)),
  ];

  const quietChat = pace === "Quiet" && frames.includes("Chat");

  for (const engine of only.length > 0 ? [] : chosen) {
    if (quietChat) {
      for (const flow of [
        refusedClip(engine),
        askedClip(engine, settings),
        abandonedClip(engine),
        lingeredClip(engine),
        owedClip(engine, settings),
        redrawnFilms(engine),
        syncedFilm(engine, "Browser"),
        syncedFilm(engine, "Extension"),
        blockedExtension(engine),
        sharpFilm(engine),
        guardedClip(engine, 1),
        guardedClip(engine, 2),
        guardedClip(engine, 4),
        guardedClip(engine, 8),
      ]) {
        problems.push(...(yield* reported(yield* flow)));
      }

      for (const hand of hands) {
        for (const theme of themes) {
          problems.push(
            ...(yield* reported(
              yield* replayedClip(engine, settings, {
                hand,
                style: "Broadcast",
                theme,
              })
            ))
          );
        }
      }

      problems.push(
        ...(yield* reported(
          yield* replayedClip(engine, settings, {
            hand: hands[0] ?? "AcesCracked",
            style: "Drift",
            theme: themes[0] ?? "Light",
          })
        ))
      );
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

          problems.push(...(yield* reported(checked)));
        }
      }
    }
  }

  yield* clipPolicy.held.pipe(
    Effect.catchTag("PolicyViolated", (failure) =>
      Effect.sync(() => {
        problems.push(failure.message);
      })
    )
  );

  return problems.length === 0
    ? yield* Effect.void
    : yield* new ClipCheckFailed({
        detail: problems.join("; "),
        step: "check the clips",
      });
});

const program = stageServer.pipe(
  Effect.flatMap((origin) =>
    checks.pipe(Effect.provideService(StageOrigin, origin))
  )
);

await Effect.runPromise(
  program.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
