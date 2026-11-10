export type KeptFrame = "Chat" | "Story";

export type PictureFrame = KeptFrame | "Table";

export const KEPT_FRAMES: readonly KeptFrame[] = ["Chat", "Story"];

export const FRAME_SIZES: Readonly<
  Record<PictureFrame, { readonly height: number; readonly width: number }>
> = {
  Chat: { height: 1350, width: 1080 },
  Story: { height: 1920, width: 1080 },
  Table: { height: 1350, width: 1080 },
};

export const fileNameOf = (title: string, frame: KeptFrame) =>
  `nostakes-${title.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-")}${frame === "Story" ? "-story" : ""}.png`;
