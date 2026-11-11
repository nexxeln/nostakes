import { describe, expect, it } from "@effect/vitest";
import type { PlayerId } from "@nostakes/engine";
import { Option } from "effect";

import {
  REACTIONS,
  RoomSignalSchema,
  RoomViews,
  audienceOf,
  signalAllowed,
  viewFor,
} from "../src/index.js";
import type { Millis, RoomSignal, RoomState, RoomView } from "../src/index.js";
import { generated } from "./scale.js";
import { POOL, playSession, session } from "./sessions.js";

const Signals = RoomSignalSchema.cases;

const lookingAt = (looking: boolean): RoomSignal =>
  Signals.Peeking.make({ looking });

const ownView = (state: RoomState, player: PlayerId, at: Millis): RoomView =>
  viewFor(state, audienceOf(state, player), at);

const stillHoldsCards = (view: RoomView, player: PlayerId) =>
  RoomViews.$is("Open")(view) &&
  view.settings.peeking &&
  view.holeCards.length > 0 &&
  Option.exists(view.hand, (hand) =>
    hand.players.some(
      (dealt) =>
        dealt.player === player && dealt.status !== "Folded" && !dealt.mucked
    )
  );

const listedAsMember = (view: RoomView, player: PlayerId) =>
  view.members.some((member) => member.player === player);

describe("signals a poker room relays", () => {
  it.prop(
    "a peek is allowed exactly when the room lists the sender as a member, shows peeks, and their own device shows them hole cards they still hold, and a reaction exactly when the room lists them as a member",
    { source: session },
    ({ source }) => {
      const wrong: string[] = [];

      const played = playSession(source, undefined, (settings) => ({
        ...settings,
        peeking: source.setup % 3 !== 0,
      }));

      for (const step of played.steps) {
        for (const player of POOL) {
          const view = ownView(step.after, player, step.command.at);

          const peeks =
            listedAsMember(view, player) && stillHoldsCards(view, player);

          for (const looking of [true, false]) {
            if (
              signalAllowed(step.after, player, lookingAt(looking)) !== peeks
            ) {
              wrong.push(
                `${step.command._tag}: ${player} peeking ${looking} should be ${peeks ? "allowed" : "dropped"}`
              );
            }
          }

          for (const reaction of REACTIONS) {
            const allowed = signalAllowed(
              step.after,
              player,
              Signals.Reaction.make({ reaction })
            );

            if (allowed !== listedAsMember(view, player)) {
              wrong.push(
                `${step.command._tag}: ${player} reacting ${reaction} should be ${allowed ? "dropped" : "allowed"}`
              );
            }
          }
        }
      }

      expect(wrong.slice(0, 5).join("\n")).toBe("");
    },
    generated(15, 100)
  );
});
