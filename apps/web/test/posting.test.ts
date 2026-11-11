import { describe, expect, it } from "@effect/vitest";
import { ChipsSchema, SeatIndexSchema } from "@nostakes/engine";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import {
  HandViewSchema,
  MemberCommandSchema,
  RoomViewSchema,
  SealViewSchema,
} from "@nostakes/room";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { Messages } from "../src/features/message.js";
import type { Message } from "../src/features/message.js";
import { TableIntents } from "../src/features/table/snapshot.js";
import { init, update } from "../src/features/update.js";

type OpenView = typeof RoomViewSchema.cases.Open.Type;

const CODE = RoomCodeSchema.make("ABC234");

const PLAYER = PlayerIdSchema.make("player-0000000ab");

const SEATS = 9;

const views = Arbitrary.schema(RoomViewSchema.cases.Open);

const hands = Arbitrary.schema(HandViewSchema);

const seals = Arbitrary.schema(SealViewSchema);

const SealedSchema = Schema.Literals([
  "Open",
  "SealedWithYou",
  "SealedWithout",
]);

const PlanSchema = Schema.Struct({
  big: Schema.Boolean,
  casino: Schema.Boolean,
  dealt: Schema.Boolean,
  entry: Schema.Boolean,
  posts: Schema.Boolean,
  sealed: SealedSchema,
  seat: Schema.Int.check(Schema.isBetween({ maximum: SEATS - 1, minimum: 0 })),
  sittingOut: Schema.Boolean,
  small: Schema.Boolean,
});

type Plan = typeof PlanSchema.Type;

const OWING: Plan = {
  big: true,
  casino: true,
  dealt: false,
  entry: false,
  posts: false,
  sealed: "Open",
  seat: 3,
  sittingOut: false,
  small: false,
};

const seatAt = (seat: number) => SeatIndexSchema.make(seat);

const planned = (
  table: OpenView,
  hand: typeof HandViewSchema.Type,
  seal: typeof SealViewSchema.Type,
  plan: Plan
): OpenView => ({
  ...table,
  fairness: {
    ...table.fairness,
    sealed:
      plan.sealed === "Open"
        ? Option.none()
        : Option.some({
            ...seal,
            seats: plan.sealed === "SealedWithYou" ? [seatAt(plan.seat)] : [],
          }),
  },
  hand: plan.dealt
    ? Option.some({
        ...hand,
        players: [
          {
            committedThisStreet: ChipsSchema.make(0),
            committedTotal: ChipsSchema.make(0),
            mucked: false,
            player: PLAYER,
            seat: seatAt(plan.seat),
            shown: [],
            status: "Active",
          },
        ],
      })
    : Option.none(),
  seats: Array.from({ length: SEATS }, (_, seat) => ({
    occupant:
      seat === plan.seat
        ? Option.some({
            away: false,
            leaving: false,
            leavingRoom: false,
            owes: { big: plan.big, entry: plan.entry, small: plan.small },
            player: PLAYER,
            posts: plan.posts,
            sittingOut: plan.sittingOut,
            stack: ChipsSchema.make(500),
            straddling: false,
          })
        : Option.none(),
    seat: seatAt(seat),
  })),
  settings: {
    ...table.settings,
    seats: SEATS,
    table: {
      ...table.settings.table,
      blindPosting: plan.casino ? "Casino" : "HomeGame",
    },
  },
  you: Option.some(PLAYER),
});

const start = init({
  deck: "TwoColour",
  invite: Option.none(),
  learned: [],
  profile: { avatar: "", name: "Ana" },
  reloadedFor: Option.none(),
  rooms: [],
  saved: Option.some({ code: CODE, player: PLAYER }),
  sound: false,
  systemTheme: "Light",
  theme: Option.none(),
}).model;

const shownWith = (view: OpenView, live: boolean) => {
  let current = start;

  for (const message of [
    Messages.GotUpdate({ events: [], receivedAt: 0, seq: 1, view }),
    Messages.GotLink({
      link: {
        newBuild: Option.none(),
        phase: live ? "Live" : "Waiting",
        presence: [PLAYER],
        receivedAt: 0,
        refusal: Option.none(),
        retryDelayMs: Option.none(),
      },
    }),
  ] satisfies readonly Message[]) {
    current = update(current, message).model;
  }

  return current;
};

type Issued = NonNullable<ReturnType<typeof update>["commands"]>;

const choicesSent = (commands: Issued | undefined) =>
  (commands ?? []).flatMap((command) => {
    const sent = Schema.decodeUnknownOption(
      Schema.Struct({ command: MemberCommandSchema, key: Schema.Int })
    )(command.args);

    return command.name === "SendToRoom" &&
      Option.isSome(sent) &&
      MemberCommandSchema.guards.ChoosePosting(sent.value.command)
      ? [sent.value.command.post]
      : [];
  });

describe("waiting for the big blind or posting to come in", () => {
  it.prop(
    "sends the choice the offer shows, once, while the line is live, and nothing while it is not",
    {
      hand: hands,
      live: Arbitrary.schema(Schema.Boolean),
      post: Arbitrary.schema(Schema.Boolean),
      seal: seals,
      table: views,
    },
    ({ hand, live, post, seal, table }) => {
      const view = planned(table, hand, seal, { ...OWING, posts: !post });

      const sent = update(
        shownWith(view, live),
        Messages.GotTableIntent({ intent: TableIntents.Posting.make({ post }) })
      );

      expect(choicesSent(sent.commands)).toStrictEqual(live ? [post] : []);
    }
  );
});
