import type { Replay } from "@nostakes/room";

import type { Deck, Theme } from "../model.js";
import { FRAME_SIZES } from "../pictures/paper.js";
import { FRAME } from "./drift/art.js";
import { driftPlan } from "./drift/plan.js";
import type { DriftPlan, DriftShot } from "./drift/plan.js";
import { driftTold, replaySeatsOf } from "./drift/told.js";
import type { MomentHand } from "./element.js";
import type { FilmKey } from "./film.js";
import { pictureSvg } from "./picture.js";
import type { MomentScene } from "./scene.js";
import type { ScoreSheet } from "./sound/sheet.js";
import { REST } from "./timeline.js";

export const REEL_MOMENTS = 2;

export const END_CARD_MS = 3200;

export interface ReelMoment {
  readonly hand: MomentHand;
  readonly scene: MomentScene;
}

export const reelPicks = <A extends ReelMoment>(
  moments: readonly A[]
): readonly A[] =>
  moments
    .toSorted(
      (left, right) =>
        right.scene.picture.tier - left.scene.picture.tier ||
        right.scene.picture.pot - left.scene.picture.pot ||
        left.scene.picture.hand - right.scene.picture.hand
    )
    .slice(0, REEL_MOMENTS)
    .toSorted(
      (left, right) => left.scene.picture.hand - right.scene.picture.hand
    );

export interface ReelLook {
  readonly calm: boolean;
  readonly deck: Deck;
  readonly theme: Theme;
}

export const reelPartOf = (
  moment: ReelMoment,
  replay: Replay,
  look: ReelLook
): DriftPlan => {
  const { picture, seats } = moment.scene;

  return driftPlan(
    driftTold(replay, {
      kind: picture.kind,
      principals: seats,
      seats: replaySeatsOf(moment.hand),
      title: picture.title,
    }),
    {
      calm: look.calm,
      deck: look.deck,
      kept: {
        shows: [
          ...picture.boards.flat(),
          ...picture.seats.flatMap((seat) => seat.cards),
        ],
        svg: pictureSvg(picture, {
          deck: look.deck,
          fonts: "",
          frame: "Story",
          theme: look.theme,
        }),
      },
      seed: picture.hand,
      theme: look.theme,
    }
  );
};

export interface ReelPlan {
  readonly camera: readonly FilmKey[];
  readonly dealt: readonly { readonly at: number; readonly card: string }[];
  readonly endAt: number;
  readonly length: number;
  readonly parts: readonly {
    readonly at: number;
    readonly sheet: ScoreSheet;
  }[];
  readonly shots: readonly DriftShot[];
}

const HIDDEN = { ...REST, opacity: 0 };

const shifted = (keys: readonly FilmKey[], by: number): readonly FilmKey[] =>
  keys.map((each) => ({ ...each, at: each.at + by }));

const within = (shot: DriftShot, from: number, to: number): DriftShot => ({
  ...shot,
  keys: [
    ...shifted(shot.keys, from).filter((each) => each.at < to),
    { at: to, ease: "Hold", pose: HIDDEN },
  ],
});

const END_PAINT = { cover: 1, luminance: 0.8 };

export const reelPlan = (
  parts: readonly DriftPlan[],
  endCard: { readonly svg: string }
): ReelPlan => {
  const starts = [0];

  for (const part of parts) {
    starts.push((starts.at(-1) ?? 0) + part.length);
  }

  const endAt = starts.at(-1) ?? 0;
  const { height, width } = FRAME_SIZES.Story;

  const shots = parts.flatMap((part, index) => {
    const from = starts[index] ?? 0;

    return part.shots.map((shot) => within(shot, from, from + part.length));
  });

  const end: DriftShot = {
    art: endCard.svg,
    box: { height, width, x: 0, y: 0 },
    keys: [
      { at: endAt, pose: HIDDEN },
      { at: endAt + 240, ease: "Out", pose: REST },
    ],
    paint: END_PAINT,
    pinned: true,
    pivot: { x: FRAME.width / 2, y: FRAME.height / 2 },
    shows: [],
  };

  return {
    camera: parts.flatMap((part, index) => {
      const from = starts[index] ?? 0;

      return [
        { at: from, ease: "Hold" as const, pose: REST },
        ...shifted(part.camera, from),
        { at: from + part.length, ease: "Hold" as const, pose: REST },
      ];
    }),
    dealt: parts.flatMap((part, index) =>
      part.dealt.map((each) => ({
        ...each,
        at: each.at + (starts[index] ?? 0),
      }))
    ),
    endAt,
    length: endAt + END_CARD_MS,
    parts: parts.map((part, index) => ({
      at: starts[index] ?? 0,
      sheet: part.sheet,
    })),
    shots: [...shots, end],
  };
};
