import { describe, expect, it } from "@effect/vitest";
import { Actions } from "@nostakes/engine";
import type { PlayerId } from "@nostakes/engine";
import { Option, Schema } from "effect";

import {
  REACTIONS,
  RoomCommands,
  RoomSignalSchema,
  RoomViews,
  audienceOf,
  signalAllowed,
  viewFor,
} from "../src/index.js";
import type { Millis, RoomSignal, RoomState, RoomView } from "../src/index.js";
import {
  ann,
  as,
  bob,
  cat,
  dan,
  dealAt,
  join,
  ms,
  openedBy,
  player as playerNamed,
  runAll,
  settings as baseSettings,
  sit,
} from "./fixtures.js";
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
    }
  );

  it("a seat with cards may peek until it folds or the host turns peeks off, a watcher may only react, and a stranger may do neither", () => {
    const peek = lookingAt(true);
    const clap = Signals.Reaction.make({ reaction: "Clap" });
    const stranger = playerNamed("eve");

    const dealt = runAll(
      openedBy(ann, { ...baseSettings, betweenHandsSeconds: 5 }),
      [
        join(bob),
        join(cat),
        join(dan),
        sit(ann, 0),
        sit(bob, 1),
        sit(cat, 2),
        RoomCommands.StartGame({ at: ms(3), by: as(ann) }),
        dealAt(3),
      ]
    );

    expect(
      [ann, bob, cat, dan, stranger].map((who) => [
        signalAllowed(dealt, who, peek),
        signalAllowed(dealt, who, clap),
      ])
    ).toStrictEqual([
      [true, true],
      [true, true],
      [true, true],
      [false, true],
      [false, false],
    ]);

    const folded = runAll(dealt, [
      RoomCommands.Act({ action: Actions.Fold(), at: ms(4), by: as(ann) }),
    ]);

    expect(signalAllowed(folded, ann, peek)).toBe(false);
    expect(signalAllowed(folded, bob, peek)).toBe(true);

    const hidden = runAll(dealt, [
      RoomCommands.ChangeSettings({
        at: ms(4),
        by: as(ann),
        settings: { ...baseSettings, betweenHandsSeconds: 5, peeking: false },
      }),
    ]);

    expect(
      [ann, bob, cat].map((who) => signalAllowed(hidden, who, peek))
    ).toStrictEqual([false, false, false]);
    expect(signalAllowed(hidden, dan, clap)).toBe(true);
  });

  it("names a small fixed set of reactions, and a signal round-trips as JSON in a few dozen bytes", () => {
    const codec = Schema.fromJsonString(Schema.toCodecJson(RoomSignalSchema));
    const encode = Schema.encodeSync(codec);
    const decode = Schema.decodeUnknownSync(codec);

    expect(REACTIONS).toEqual(["Clap", "Laugh", "Wow", "Cry", "Fire"]);

    const longest = Math.max(
      ...[
        lookingAt(true),
        lookingAt(false),
        ...REACTIONS.map((reaction) => Signals.Reaction.make({ reaction })),
      ].map((signal) => {
        const text = encode(signal);

        expect(decode(text)).toStrictEqual(signal);

        return text.length;
      })
    );

    expect(longest).toBeLessThan(48);
    expect(() =>
      decode('{"_tag":"Reaction","reaction":"Anything at all"}')
    ).toThrow();
  });
});
