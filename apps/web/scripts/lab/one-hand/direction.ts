import type { Expression } from "@nostakes/avatar";

import { ROLES, actorId, holeId } from "./cast.js";
import type { Cut, Player, Point } from "./cuts.js";
import { ROOT, cut, move, rest } from "./engine.js";
import type { Ease, Film, Pose } from "./engine.js";

export const at = (point: Point): Pick<Pose, "x" | "y"> => ({
  x: point[0],
  y: point[1],
});

export const plus = (point: Point, dx: number, dy: number): Point => [
  point[0] + dx,
  point[1] + dy,
];

export const between = (from: Point, to: Point, amount: number): Point => [
  from[0] + (to[0] - from[0]) * amount,
  from[1] + (to[1] - from[1]) * amount,
];

export const SHADOW = { x: 1, y: 1.8 };

export const lifted = (height: number) => ({
  x: SHADOW.x + height * 0.55,
  y: SHADOW.y + height,
});

export interface Director {
  readonly acts: (
    player: Player,
    index: number,
    from: number,
    to: number
  ) => void;
  readonly clock: (id: string, from: number, to: number, stop: number) => void;
  readonly express: (
    player: Player,
    when: number,
    expression: Expression
  ) => void;
  readonly flick: (sprite: string, from: number, towards: Point) => void;
  readonly flip: (sprite: string, from: number, to: number) => void;
  readonly folds: (player: Player, when: number, act: number) => void;
  readonly frame: Cut;
  readonly go: (
    sprite: string,
    part: string,
    span: readonly [from: number, to: number, ease?: Ease],
    pose: Partial<Pose>
  ) => void;
  readonly set: (
    sprite: string,
    part: string,
    when: number,
    pose: Partial<Pose>
  ) => void;
  readonly starts: (sprite: string, part: string, pose: Partial<Pose>) => void;
}

const QUARTERS = [0, 1, 2, 3];

export const directorOf = (film: Film, frame: Cut, pace: number): Director => {
  const go: Director["go"] = (sprite, part, span, pose) => {
    const [from, to, ease] = span;

    move(film, [sprite, part], { ease: ease ?? "Out", from, to }, pose);
  };

  const set: Director["set"] = (sprite, part, when, pose) => {
    cut(film, [sprite, part], when, pose);
  };

  const starts: Director["starts"] = (sprite, part, pose) => {
    rest(film, sprite, part, pose);
  };

  const express: Director["express"] = (player, when, expression) => {
    for (const known of ROLES[player].expressions) {
      set(actorId(player), `ex-${known}`, when, {
        opacity: known === expression ? 1 : 0,
      });
    }
  };

  const acts: Director["acts"] = (player, index, from, to) => {
    const id = actorId(player);

    set(id, "city", from, { opacity: 0 });
    set(id, `act-${index}`, from, { opacity: 1 });
    set(id, `act-${index}`, to, { opacity: 0 });
    set(id, "city", to, { opacity: 1 });
  };

  const clock: Director["clock"] = (id, from, to, stop) => {
    const quarter = (to - from) / 4;

    set(id, "ring", from, { opacity: 1 });

    for (const side of QUARTERS.filter(
      (each) => from + each * quarter < stop
    )) {
      const begins = from + side * quarter;
      const ends = Math.min(stop, begins + quarter);

      go(id, `ring-${side}`, [begins, ends, "Linear"], {
        squeeze: 1 - (ends - begins) / quarter,
      });
    }

    set(id, "ring", stop, { opacity: 0 });
  };

  const flip: Director["flip"] = (sprite, from, to) => {
    const middle = (from + to) / 2;

    go(sprite, "bd", [from, middle, "In"], { squeeze: 0.04 });
    set(sprite, "bk", middle, { opacity: 0 });
    set(sprite, "fc", middle, { opacity: 1 });
    go(sprite, "bd", [middle, to, "Out"], { squeeze: 1 });
    go(sprite, "sh", [from, middle, "Out"], lifted(5));
    go(sprite, "sh", [middle, to, "In"], SHADOW);
  };

  const flick: Director["flick"] = (sprite, from, towards) => {
    go(sprite, ROOT, [from, from + 8 * pace, "In"], {
      ...at(towards),
      scale: 0.7,
      turn: 160,
    });
    go(sprite, ROOT, [from + 4 * pace, from + 8 * pace, "Linear"], {
      opacity: 0,
    });
  };

  const muck: Point = plus(frame.pot, 0, -frame.spread * 2);

  const folds: Director["folds"] = (player, when, act) => {
    flick(holeId(player, 0), when, muck);
    flick(holeId(player, 1), when + pace, muck);
    express(player, when + 3 * pace, "Folded");
    acts(player, act, when + 2 * pace, when + 30 * pace);
  };

  return { acts, clock, express, flick, flip, folds, frame, go, set, starts };
};
