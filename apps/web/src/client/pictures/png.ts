import { Effect } from "effect";

import { FRAME_SIZES } from "../../features/pictures/paper.js";
import type { KeptFrame } from "../../features/pictures/paper.js";
import dmSans from "../fonts/dm-sans.woff2?inline";
import figtree from "../fonts/figtree.woff2?inline";
import { KeepFailed } from "./keep-failed.js";

export const EMBEDDED_FONTS = [
  `@font-face{font-family:"Figtree";font-weight:400 800;src:url(${figtree}) format("woff2");}`,
  `@font-face{font-family:"DM Sans";font-weight:700 800;src:url(${dmSans}) format("woff2");}`,
].join("");

export const pngFile = (svg: string, frame: KeptFrame, name: string) =>
  Effect.gen(function* drawPng() {
    const { height, width } = FRAME_SIZES[frame];
    const image = new Image(width, height);
    const notDrawn = () => new KeepFailed({ file: name, reason: "NotDrawn" });

    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    yield* Effect.tryPromise({ catch: notDrawn, try: () => image.decode() });

    const canvas = new OffscreenCanvas(width, height);

    canvas.getContext("2d")?.drawImage(image, 0, 0, width, height);

    const png = yield* Effect.tryPromise({
      catch: notDrawn,
      try: () => canvas.convertToBlob({ type: "image/png" }),
    });

    return new File([png], name, { type: "image/png" });
  });
