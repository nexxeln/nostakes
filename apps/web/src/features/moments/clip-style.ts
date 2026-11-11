export const CLIP_STYLES = ["Broadcast", "Drift"] as const;

export type ClipStyle = (typeof CLIP_STYLES)[number];

export const DEFAULT_STYLE: ClipStyle = "Broadcast";
