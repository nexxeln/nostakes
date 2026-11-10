import * as NodeServices from "@effect/platform-node/NodeServices";
import { DEFAULT_AVATAR, render } from "@nostakes/avatar";
import { Console, Effect, Predicate, Schema } from "effect";
import * as FileSystem from "effect/FileSystem";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import { chromium } from "playwright-core";
import type { Browser, CDPSession, Page } from "playwright-core";
import { createServer } from "vite";
import type { ViteDevServer } from "vite";

const WEB = new URL("..", import.meta.url).pathname;

const PUBLIC = `${WEB}public/`;

const STAGE_PORT = 5198;

const FRAME = { height: 630, width: 1200 };

const VIEW = { height: 420, width: 800 };

const VIEW_SCALE = FRAME.width / VIEW.width;

const CLIP_FPS = 30;

class BrandFailed extends Schema.TaggedError<
  BrandFailed,
  { readonly brand: unique symbol }
>()("BrandFailed", { detail: Schema.String, step: Schema.String }) {
  override get message() {
    return `Could not make the brand assets at "${this.step}": ${this.detail}. Build the packages first (pnpm build), and check that ffmpeg is on the PATH for the clip.`;
  }
}

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new BrandFailed({ detail: String(cause), step }),
    try: run,
  });

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

const browser = Effect.acquireRelease(
  attempt("launch a headless, muted browser", () =>
    chromium.launch({ args: ["--mute-audio"], headless: true })
  ),
  (opened: Browser) => Effect.promise(() => opened.close())
);

const sharkSvg = (size: number) =>
  render(DEFAULT_AVATAR, { expression: "Resting", size });

const svgInside = (svg: string) =>
  svg.slice(svg.indexOf(">") + 1, svg.lastIndexOf("</svg>"));

const roundSvg = (svg: string) =>
  [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
    '<defs><clipPath id="nostakes-face"><circle cx="50" cy="50" r="50"/></clipPath></defs>',
    `<g clip-path="url(#nostakes-face)">${svgInside(svg)}</g>`,
    "</svg>",
  ].join("");

interface Picture {
  readonly size: number;
  readonly round: boolean;
  readonly safeZone: boolean;
}

const MASKABLE_FACE_SHARE = 0.8;

const MASKABLE_BACKGROUND = "#0f1012";

const pictureHtml = ({ round, safeZone, size }: Picture) => {
  const face = safeZone ? Math.round(size * MASKABLE_FACE_SHARE) : size;
  const inset = (size - face) / 2;

  return [
    "<!doctype html><html><head><style>",
    `html,body{margin:0;background:${safeZone ? MASKABLE_BACKGROUND : "transparent"}}`,
    `body{padding:${inset}px}`,
    `div{width:${face}px;height:${face}px;line-height:0;overflow:hidden;border-radius:${round ? "50%" : "0"}}`,
    "svg{width:100%;height:100%;display:block}",
    `</style></head><body><div>${sharkSvg(face)}</div></body></html>`,
  ].join("");
};

const picture = (page: Page, wanted: Picture) =>
  Effect.gen(function* drawPicture() {
    const step = `draw the shark at ${wanted.size}px`;

    yield* attempt(step, () =>
      page.setViewportSize({ height: wanted.size, width: wanted.size })
    );
    yield* attempt(step, () => page.setContent(pictureHtml(wanted)));

    return yield* attempt(step, () =>
      page.screenshot({ omitBackground: true, type: "png" })
    );
  });

const ICO_HEADER_BYTES = 6;

const ICO_ENTRY_BYTES = 16;

const icoOf = (images: readonly { size: number; png: Uint8Array }[]) => {
  const tableBytes = ICO_HEADER_BYTES + ICO_ENTRY_BYTES * images.length;

  const offsets = images.map(
    (_, index) =>
      tableBytes +
      images.slice(0, index).reduce((sum, { png }) => sum + png.length, 0)
  );

  const bytes = new Uint8Array(
    (offsets.at(-1) ?? tableBytes) + (images.at(-1)?.png.length ?? 0)
  );

  const view = new DataView(bytes.buffer);

  view.setUint16(2, 1, true);
  view.setUint16(4, images.length, true);

  for (const [index, { png, size }] of images.entries()) {
    const entry = ICO_HEADER_BYTES + ICO_ENTRY_BYTES * index;
    const offset = offsets[index] ?? tableBytes;

    view.setUint8(entry, size);
    view.setUint8(entry + 1, size);
    view.setUint16(entry + 4, 1, true);
    view.setUint16(entry + 6, 32, true);
    view.setUint32(entry + 8, png.length, true);
    view.setUint32(entry + 12, offset, true);
    bytes.set(png, offset);
  }

  return bytes;
};

const write = (name: string, bytes: Uint8Array | string) =>
  Effect.gen(function* writeAsset() {
    const fs = yield* FileSystem.FileSystem;
    const path = `${PUBLIC}${name}`;

    yield* fs.makeDirectory(path.slice(0, path.lastIndexOf("/")), {
      recursive: true,
    });
    yield* Predicate.isString(bytes)
      ? fs.writeFileString(path, bytes)
      : fs.writeFile(path, bytes);
    yield* Console.log(`wrote public/${name} (${bytes.length} bytes)`);
  });

const icons = (opened: Browser) =>
  Effect.gen(function* drawIcons() {
    const page = yield* attempt("open an icon page", () => opened.newPage());

    const round = (size: number) =>
      picture(page, { round: true, safeZone: false, size });

    const square = (size: number) =>
      picture(page, { round: false, safeZone: false, size });

    yield* write("favicon.svg", roundSvg(sharkSvg(32)));
    yield* write(
      "favicon.ico",
      icoOf([
        { png: yield* round(16), size: 16 },
        { png: yield* round(32), size: 32 },
        { png: yield* round(48), size: 48 },
      ])
    );
    yield* write("apple-touch-icon.png", yield* square(180));
    yield* write("icon-192.png", yield* round(192));
    yield* write("icon-512.png", yield* round(512));
    yield* write(
      "icon-maskable-512.png",
      yield* picture(page, { round: true, safeZone: true, size: 512 })
    );
  });

type Cue = "brand-on" | "brand-off" | "next";

const cue = (page: Page, step: string, sent: Cue) =>
  attempt(step, () =>
    page.evaluate((detail) => {
      globalThis.dispatchEvent(new CustomEvent("nostakes-stage", { detail }));
    }, sent)
  );

const pause = (ms: number) => Effect.sleep(`${ms} millis`);

const centre = (page: Page, selector: string, step: string) =>
  attempt(step, () => page.locator(selector).boundingBox()).pipe(
    Effect.flatMap((box) =>
      box === null
        ? Effect.fail(new BrandFailed({ detail: "not on screen", step }))
        : Effect.succeed({
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
          })
    )
  );

const GLIDE_STEP_MS = 28;

const glide = (
  page: Page,
  from: { readonly x: number; readonly y: number },
  toY: number,
  steps: number
) =>
  Effect.forEach(
    Array.from({ length: steps }, (_, index) => (index + 1) / steps),
    (part) =>
      attempt("drag the chip", () =>
        page.mouse.move(from.x, from.y + (toY - from.y) * (1 - (1 - part) ** 2))
      ).pipe(Effect.andThen(pause(GLIDE_STEP_MS))),
    { discard: true }
  );

const RAIL_OPEN_PX = 28;

const POT_DETENT = "nostakes-table .rail .det";

const HAND = "nostakes-table .hand";

const CHIP = "nostakes-table .chipctl";

const BEAT_GAPS_MS = [300, 320, 400, 460] as const;

const choreography = (page: Page) =>
  Effect.gen(function* playTheHand() {
    yield* pause(450);
    yield* cue(page, "fade the card out", "brand-off");
    yield* pause(200);

    const hand = yield* centre(page, HAND, "find the hero's cards");

    yield* attempt("peek at the cards", () =>
      page.mouse.move(hand.x, hand.y, { steps: 6 })
    );
    yield* pause(900);

    const chip = yield* centre(page, CHIP, "find the chip");

    yield* attempt("reach for the chip", () =>
      page.mouse.move(chip.x, chip.y, { steps: 6 })
    );
    yield* pause(100);
    yield* attempt("press the chip", () => page.mouse.down());
    yield* glide(page, chip, chip.y - RAIL_OPEN_PX, 3);

    const pot = yield* centre(
      page,
      `${POT_DETENT} >> text=/^Pot/`,
      "find the pot-sized raise"
    );

    yield* glide(page, { x: chip.x, y: chip.y - RAIL_OPEN_PX }, pot.y, 11);
    yield* pause(160);
    yield* attempt("let the chip go", () => page.mouse.up());
    yield* attempt("move the pointer away", () =>
      page.mouse.move(VIEW.width - 8, 8)
    );

    const raised = yield* attempt("read the raise", () =>
      page
        .locator("#stage")
        .evaluate((node: HTMLElement) => node.dataset.raised ?? "")
    );

    if (raised === "") {
      return yield* new BrandFailed({
        detail: "the chip drag sent no raise",
        step: "raise",
      });
    }

    yield* Console.log(`the shark raised to ${raised}`);
    yield* pause(80);
    yield* cue(page, "bet", "next");
    yield* Effect.forEach(
      BEAT_GAPS_MS,
      (gap) =>
        pause(gap).pipe(Effect.andThen(cue(page, "play a beat", "next"))),
      { discard: true }
    );
    yield* pause(500);
    yield* cue(page, "the shark wins", "next");
    yield* pause(1600);
    yield* cue(page, "fade the card in", "brand-on");
    yield* pause(560);

    return raised;
  });

interface Frame {
  readonly data: string;
  readonly at: number;
}

const screencast = (session: CDPSession, frames: Frame[]) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      session.on("Page.screencastFrame", (frame) => {
        frames.push({ at: frame.metadata.timestamp ?? 0, data: frame.data });
        void session.send("Page.screencastFrameAck", {
          sessionId: frame.sessionId,
        });
      });
    }).pipe(
      Effect.andThen(
        attempt("start the screencast", () =>
          session.send("Page.startScreencast", {
            everyNthFrame: 1,
            format: "png",
            maxHeight: FRAME.height,
            maxWidth: FRAME.width,
          })
        )
      )
    ),
    () => Effect.promise(() => session.send("Page.stopScreencast"))
  );

const concatList = (names: readonly string[], durations: readonly number[]) =>
  [
    "ffconcat version 1.0",
    ...names.flatMap((name, index) => [
      `file '${name}'`,
      `duration ${(durations[index] ?? 0).toFixed(4)}`,
    ]),
    `file '${names.at(-1) ?? ""}'`,
    "",
  ].join("\n");

const ffmpeg = (args: readonly string[]) =>
  Effect.gen(function* runFfmpeg() {
    const spawner = yield* ChildProcessSpawner;

    const code = yield* spawner
      .exitCode(ChildProcess.make("ffmpeg", ["-hide_banner", "-y", ...args]))
      .pipe(
        Effect.mapError(
          (failure) =>
            new BrandFailed({ detail: String(failure), step: "run ffmpeg" })
        )
      );

    return code === 0
      ? yield* Effect.void
      : yield* new BrandFailed({
          detail: `ffmpeg exited with ${code}`,
          step: "encode the clip",
        });
  });

const encode = (frames: readonly Frame[], endAt: number) =>
  Effect.gen(function* encodeClip() {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "nostakes-clip" });

    const names = frames.map(
      (_, index) => `frame-${String(index).padStart(5, "0")}.png`
    );

    const durations = frames.map(
      ({ at }, index) => (frames[index + 1]?.at ?? endAt) - at
    );

    yield* Effect.forEach(
      frames,
      ({ data }, index) =>
        fs.writeFile(
          `${dir}/${names[index] ?? ""}`,
          Uint8Array.from(Buffer.from(data, "base64"))
        ),
      { discard: true }
    );
    yield* fs.writeFileString(
      `${dir}/frames.txt`,
      concatList(names, durations)
    );
    yield* ffmpeg([
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      `${dir}/frames.txt`,
      "-vf",
      `fps=${CLIP_FPS},scale=${FRAME.width}:${FRAME.height}:flags=lanczos,format=yuv420p`,
      "-c:v",
      "libx264",
      "-preset",
      "veryslow",
      "-tune",
      "animation",
      "-crf",
      "24",
      "-profile:v",
      "high",
      "-level",
      "4.0",
      "-movflags",
      "+faststart",
      "-an",
      `${PUBLIC}preview/clip.mp4`,
    ]);
    yield* Console.log(
      `wrote public/preview/clip.mp4 from ${frames.length} frames over ${(endAt - (frames[0]?.at ?? endAt)).toFixed(2)}s`
    );
  });

const clip = (opened: Browser, stageUrl: string) =>
  Effect.gen(function* recordClip() {
    const context = yield* attempt("open a dark, muted window", () =>
      opened.newContext({
        colorScheme: "dark",
        deviceScaleFactor: VIEW_SCALE,
        reducedMotion: "no-preference",
        viewport: VIEW,
      })
    );

    const page = yield* attempt("open the stage", () => context.newPage());

    yield* attempt("load the stage", () =>
      page.goto(`${stageUrl}scripts/brand/stage.html`)
    );
    yield* attempt("wait for the stage", () =>
      page.locator("#stage[data-ready]").waitFor({ state: "attached" })
    );
    yield* attempt("wait for fonts", () =>
      page.evaluate(() => document.fonts.ready.then(() => true))
    );
    yield* pause(900);
    yield* write(
      "preview/card.png",
      yield* attempt("take the poster", () => page.screenshot({ type: "png" }))
    );

    const session = yield* attempt("open a screencast session", () =>
      context.newCDPSession(page)
    );

    const frames: Frame[] = [];

    yield* screencast(session, frames);
    yield* pause(150);

    const startAt = frames[0]?.at ?? 0;

    yield* choreography(page);

    const endAt = frames.at(-1)?.at ?? startAt;

    yield* encode(
      frames.filter(({ at }) => at >= startAt),
      endAt + 1 / CLIP_FPS
    );
  });

const program = Effect.gen(function* makeBrandAssets() {
  const server = yield* stageServer;

  const stageUrl =
    server.resolvedUrls?.local[0] ?? `http://localhost:${STAGE_PORT}/`;

  const opened = yield* browser;

  yield* icons(opened);
  yield* clip(opened, stageUrl);
});

await Effect.runPromise(
  program.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
