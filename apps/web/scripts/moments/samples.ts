import { momentsOf } from "@nostakes/room";
import type { Moment } from "@nostakes/room";
import { Option } from "effect";

import type { MomentHand } from "../../src/features/moments/element.js";
import type { MomentPicture } from "../../src/features/moments/picture.js";
import { sceneFor } from "../../src/features/moments/scene.js";
import type { MomentScene } from "../../src/features/moments/scene.js";
import { REPLAY_HAND_NAMES, replayHand } from "./replay-hands.js";

type Look = Pick<MomentHand, "deck" | "theme">;

const LOOK: Look = { deck: "TwoColour", theme: "Light" };

const momentsIn = (name: string): readonly Moment[] =>
  momentsOf(replayHand(name, LOOK).record);

export const SAMPLE_NAMES: readonly string[] = REPLAY_HAND_NAMES.flatMap(
  (name) => momentsIn(name).map((moment) => `${name}-${moment._tag}`)
);

export const sampleScene = (sample: string, look: Look = LOOK): MomentScene => {
  const [name = "AcesCracked", kind = ""] = sample.split("-");
  const hand = replayHand(name, look);
  const moments = momentsOf(hand.record);
  const [first] = moments;
  const lead = moments.find((moment) => moment._tag === kind) ?? first;

  if (lead === undefined) {
    throw new Error(`the sample hand ${name} has no moment`);
  }

  const found = { also: Option.none<Moment>(), lead };

  return sceneFor(hand.people, hand.lastHand, found, hand.record);
};

export const samplePicture = (
  sample: string,
  look: Look = LOOK
): MomentPicture => sampleScene(sample, look).picture;
