import { PROTOCOL_VERSION } from "@nostakes/protocol";
import { Option, Schema } from "effect";

import { ReloadTargets } from "./model.js";
import type { InRoom, Link, PageUpdate, ReloadTarget } from "./model.js";
import { openViewOf } from "./room.js";

const sameTarget = Schema.toEquivalence(ReloadTargets);

const wantedBy = (link: Link): Option.Option<ReloadTarget> =>
  link.phase === "Outdated"
    ? Option.some(ReloadTargets.NewProtocol({ outdated: PROTOCOL_VERSION }))
    : link.newBuild.pipe(
        Option.map((build) => ReloadTargets.NewBuild({ build }))
      );

export const inAHand = (room: InRoom) =>
  openViewOf(room).pipe(
    Option.flatMap(({ hand }) => hand),
    Option.exists(({ players }) =>
      players.some(
        ({ player, status }) => player === room.player && status !== "Folded"
      )
    )
  );

export interface UpdateStep {
  readonly update: Option.Option<PageUpdate>;
  readonly reload: Option.Option<ReloadTarget>;
}

const staged = (
  target: ReloadTarget,
  stage: PageUpdate["stage"]
): UpdateStep => ({
  reload: stage === "Reloading" ? Option.some(target) : Option.none(),
  update: Option.some({ stage, target }),
});

const stageFor = (
  room: InRoom,
  target: ReloadTarget,
  reloadedFor: Option.Option<ReloadTarget>
): PageUpdate["stage"] => {
  if (Option.exists(reloadedFor, (done) => sameTarget(done, target))) {
    return "Stuck";
  }

  return ReloadTargets.guards.NewProtocol(target) || !inAHand(room)
    ? "Reloading"
    : "AfterThisHand";
};

export const considerUpdate = (
  room: InRoom,
  reloadedFor: Option.Option<ReloadTarget>
): UpdateStep =>
  Option.match(room.link.pipe(Option.flatMap(wantedBy)), {
    onNone: () => ({ reload: Option.none(), update: Option.none() }),
    onSome: (target) => {
      const already = room.update.pipe(
        Option.filter(
          ({ stage, target: current }) =>
            stage !== "AfterThisHand" && sameTarget(current, target)
        )
      );

      return Option.isSome(already)
        ? { reload: Option.none(), update: already }
        : staged(target, stageFor(room, target, reloadedFor));
    },
  });

export const updateLine = ({ stage, target }: PageUpdate) => {
  if (stage === "AfterThisHand") {
    return "A new version of nostakes is ready. It loads after this hand.";
  }

  if (stage === "Reloading") {
    return "Loading the new version of nostakes…";
  }

  return ReloadTargets.guards.NewProtocol(target)
    ? "nostakes was updated and this page could not load the new version. Close this tab and open the room link again."
    : "A new version of nostakes is out and this page could not load it. Close this tab and open the room link again when you can.";
};
