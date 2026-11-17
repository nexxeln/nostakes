import { Option } from "effect";

export const CLIP_BUDGET_MS = 45_000;

export const NO_CLIP_BELOW_GB = 2;

export const LIGHT_CUT_SCALE = 2 / 3;

export const FULL_CUT_FROM_GB = 8;

export const clipScales = (
  deviceMemory: Option.Option<number>
): readonly number[] =>
  Option.match(deviceMemory, {
    onNone: () => [1, LIGHT_CUT_SCALE],
    onSome: (gigabytes) => {
      if (gigabytes < NO_CLIP_BELOW_GB) {
        return [];
      }

      return gigabytes >= FULL_CUT_FROM_GB
        ? [1, LIGHT_CUT_SCALE]
        : [LIGHT_CUT_SCALE];
    },
  });

export const AUTO_CLIP_TIER = 2;

export const AUTO_CLIPS_PER_NIGHT = 3;
