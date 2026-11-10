import { Effect } from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";

import type { Deck, Theme } from "../../features/model.js";
import { FRAME_SIZES, pictureSvg } from "../../features/moments/picture.js";
import type {
  MomentPicture,
  PictureFrame,
} from "../../features/moments/picture.js";

const FONTS = [
  {
    family: "Figtree",
    url: new URL("../fonts/figtree.woff2", import.meta.url).href,
    weight: "400 800",
  },
  {
    family: "DM Sans",
    url: new URL("../fonts/dm-sans.woff2", import.meta.url).href,
    weight: "700 800",
  },
];

interface Look {
  readonly deck: Deck;
  readonly theme: Theme;
}

const base64Of = (bytes: ArrayBuffer) => {
  let binary = "";

  for (const byte of new Uint8Array(bytes)) {
    binary += String.fromCodePoint(byte);
  }

  return btoa(binary);
};

const fontRule = (font: (typeof FONTS)[number]) =>
  HttpClient.get(font.url).pipe(
    Effect.flatMap((response) => response.arrayBuffer),
    Effect.provide(FetchHttpClient.layer),
    Effect.map(
      (bytes) =>
        `@font-face{font-family:"${font.family}";font-weight:${font.weight};src:url(data:font/woff2;base64,${base64Of(bytes)}) format("woff2");}`
    )
  );

const embeddedFonts = Effect.all(FONTS.map(fontRule)).pipe(
  Effect.map((rules) => rules.join(""))
);

const pngOf = (svg: string, frame: PictureFrame) => {
  const { height, width } = FRAME_SIZES[frame];
  const image = new Image(width, height);

  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  return Effect.tryPromise(() => image.decode()).pipe(
    Effect.flatMap(() => {
      const canvas = new OffscreenCanvas(width, height);

      canvas.getContext("2d")?.drawImage(image, 0, 0, width, height);

      return Effect.tryPromise(() =>
        canvas.convertToBlob({ type: "image/png" })
      );
    })
  );
};

const fileName = (picture: MomentPicture, frame: PictureFrame) =>
  `nostakes-${picture.title.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-")}${frame === "Story" ? "-story" : ""}.png`;

export const pictureFile = (
  picture: MomentPicture,
  look: Look,
  frame: PictureFrame
) =>
  embeddedFonts.pipe(
    Effect.map((fonts) =>
      pictureSvg(picture, { deck: look.deck, fonts, frame, theme: look.theme })
    ),
    Effect.flatMap((svg) => pngOf(svg, frame)),
    Effect.map(
      (png) => new File([png], fileName(picture, frame), { type: "image/png" })
    )
  );

const download = (file: File) =>
  Effect.sync(() => {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");

    link.href = url;
    link.download = file.name;
    link.click();
  });

const shared = (file: File) =>
  Effect.tryPromise(() => globalThis.navigator.share({ files: [file] }));

const canShare = (file: File) =>
  "canShare" in globalThis.navigator &&
  globalThis.navigator.canShare({ files: [file] });

export const keepMoment = (picture: MomentPicture, look: Look) =>
  pictureFile(picture, look, "Chat").pipe(
    Effect.flatMap((file) =>
      canShare(file)
        ? shared(file).pipe(
            Effect.catchTag("UnknownError", () => download(file))
          )
        : download(file)
    )
  );
