import { Option } from "effect";

export const REPLAY_BUDGET_MS = 45_000;

export const SHORT_ONLY_BELOW_GB = 4;

export const NO_CLIP_BELOW_GB = 2;

export type ClipReach = "None" | "Replay" | "Short";

export const reachFor = (deviceMemory: Option.Option<number>): ClipReach =>
  Option.match(deviceMemory, {
    onNone: () => "Replay",
    onSome: (gigabytes) => {
      if (gigabytes < NO_CLIP_BELOW_GB) {
        return "None";
      }

      return gigabytes < SHORT_ONLY_BELOW_GB ? "Short" : "Replay";
    },
  });

export const LIGHT_CUT_SCALE = 2 / 3;

export const FULL_CUT_FROM_GB = 8;

export const replayScales = (
  deviceMemory: Option.Option<number>
): readonly number[] =>
  Option.match(deviceMemory, {
    onNone: () => [1, LIGHT_CUT_SCALE],
    onSome: (gigabytes) =>
      gigabytes >= FULL_CUT_FROM_GB ? [1, LIGHT_CUT_SCALE] : [LIGHT_CUT_SCALE],
  });
