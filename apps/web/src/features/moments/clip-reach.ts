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
