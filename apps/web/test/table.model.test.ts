import { describe, expect, it } from "@effect/vitest";
import { Actions, ChipsSchema, LegalActionsSchema } from "@nostakes/engine";
import type { Action } from "@nostakes/engine";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import {
  MemberCommandSchema,
  NotSeated,
  RoomViewSchema,
  SeenEventSchema,
} from "@nostakes/room";
import { Match, Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { Messages, ReplyOutcomes } from "../src/features/message.js";
import type { Message } from "../src/features/message.js";
import type { InRoom, Model } from "../src/features/model.js";
import {
  isActing,
  isLegal,
  isLive,
  legalOf,
  roomOf,
} from "../src/features/room.js";
import { happeningsOf, KEPT_EVENTS } from "../src/features/table/from-room.js";
import { TableIntentSchema } from "../src/features/table/snapshot.js";
import type { TableIntent } from "../src/features/table/snapshot.js";
import { init, update } from "../src/features/update.js";

const CODE = RoomCodeSchema.make("ABC234");

const PLAYER = PlayerIdSchema.make("player-0000000ab");

const start = init({
  invite: Option.some(CODE),
  learned: [],
  profile: { avatar: "🦊", name: "Ana" },
  reloadedFor: Option.none(),
  rooms: [],
  saved: Option.some({ code: CODE, player: PLAYER }),
  sound: false,
  theme: Option.none(),
}).model;

const StepSchema = Schema.TaggedUnion({
  Intent: { intent: TableIntentSchema },
  Link: {
    legal: Schema.Option(LegalActionsSchema),
    live: Schema.Boolean,
  },
  Reply: {
    accepted: Schema.Boolean,
    pick: Schema.Int.check(Schema.isBetween({ maximum: 8, minimum: 0 })),
  },
});

type Step = typeof StepSchema.Type;

const steps = Arbitrary.array(Arbitrary.schema(StepSchema), {
  maxLength: 40,
  minLength: 1,
});

const views = Arbitrary.schema(RoomViewSchema.cases.Open);

type OpenView = typeof RoomViewSchema.cases.Open.Type;

const roomIn = (model: Model): InRoom =>
  Option.getOrThrowWith(roomOf(model), () => new Error("left the room"));

const messagesFor = (
  step: Step,
  table: OpenView,
  issued: readonly number[]
): readonly Message[] =>
  StepSchema.match(step, {
    Intent: ({ intent }) => [Messages.GotTableIntent({ intent })],
    Link: ({ legal, live }) => [
      Messages.GotLink({
        link: {
          newBuild: Option.none(),
          phase: live ? "Live" : "Waiting",
          presence: [],
          receivedAt: 0,
          refusal: Option.none(),
          retryDelayMs: Option.none(),
        },
      }),
      Messages.GotUpdate({
        events: [],
        receivedAt: 0,
        seq: 1,
        view: { ...table, legal },
      }),
    ],
    Reply: ({ accepted, pick }) => [
      Messages.GotReply({
        key: issued[pick % Math.max(1, issued.length)] ?? 404,
        outcome: accepted
          ? ReplyOutcomes.Accepted({ seq: 1 })
          : ReplyOutcomes.Rejected({
              rejection: new NotSeated({ player: PLAYER }),
            }),
      }),
    ],
  });

const isIntent = Schema.is(Messages.GotTableIntent);

const actionOf = (intent: TableIntent): Option.Option<Action> =>
  Match.value(intent).pipe(
    Match.tagsExhaustive({
      Call: () => Option.some(Actions.Call()),
      Check: () => Option.some(Actions.Check()),
      Fold: () => Option.some(Actions.Fold()),
      HuntRabbit: () => Option.none(),
      Learned: () => Option.none(),
      Muck: () => Option.none(),
      Pick: () => Option.none(),
      Raise: ({ to }) =>
        Schema.decodeOption(ChipsSchema)(to).pipe(
          Option.map((amount) => Actions.RaiseTo({ to: amount }))
        ),
      Runs: () => Option.none(),
      Show: () => Option.none(),
      ShowCards: () => Option.none(),
      Sit: () => Option.none(),
    })
  );

const isReply = Schema.is(Messages.GotReply);

type Issued = NonNullable<ReturnType<typeof update>["commands"]>;

const sentActions = (commands: Issued) =>
  commands.flatMap((command) => {
    const sent = Schema.decodeUnknownOption(
      Schema.Struct({ command: MemberCommandSchema, key: Schema.Int })
    )(command.args);

    return command.name === "SendToRoom" &&
      Option.isSome(sent) &&
      MemberCommandSchema.guards.Act(sent.value.command)
      ? [{ action: sent.value.command.action, key: sent.value.key }]
      : [];
  });

const legalAction = (model: Model, action: Action) => {
  const room = roomIn(model);

  return (
    isLive(room) &&
    !isActing(room) &&
    Option.exists(legalOf(room), (legal) => isLegal(legal, action))
  );
};

const LinkOrUpdateSchema = Schema.TaggedUnion({
  Link: { live: Schema.Boolean, receivedAt: Schema.Int },
  Update: {
    events: Schema.Array(SeenEventSchema.cases.Table).check(
      Schema.isMaxLength(4)
    ),
    receivedAt: Schema.Int,
    view: RoomViewSchema.cases.Open,
  },
});

const arrivals = Arbitrary.array(Arbitrary.schema(LinkOrUpdateSchema), {
  maxLength: 12,
  minLength: 1,
});

describe("the table's view and events", () => {
  it.prop(
    "change only together, in one update, so the table never shows a view ahead of the events that produced it",
    { plan: arrivals },
    ({ plan }) => {
      let model = start;
      let head = 0;

      for (const arrival of plan) {
        const before = roomIn(model);

        if (LinkOrUpdateSchema.guards.Link(arrival)) {
          ({ model } = update(
            model,
            Messages.GotLink({
              link: {
                newBuild: Option.none(),
                phase: arrival.live ? "Live" : "Waiting",
                presence: [],
                receivedAt: arrival.receivedAt,
                refusal: Option.none(),
                retryDelayMs: Option.none(),
              },
            })
          ));

          expect(roomIn(model).shown).toStrictEqual(before.shown);
          expect(roomIn(model).events).toStrictEqual(before.events);
        } else {
          const from = head + 1;

          const applied = arrival.events.map((event, index) => ({
            event,
            seq: from + index,
          }));

          head += applied.length;
          ({ model } = update(
            model,
            Messages.GotUpdate({
              events: applied,
              receivedAt: arrival.receivedAt,
              seq: head,
              view: arrival.view,
            })
          ));

          expect(roomIn(model).shown).toEqual(
            Option.some({
              receivedAt: arrival.receivedAt,
              seq: head,
              view: arrival.view,
            })
          );
          expect(roomIn(model).events).toStrictEqual(
            [
              ...before.events,
              ...applied.flatMap(({ event, seq }) => happeningsOf(seq, event)),
            ].slice(-KEPT_EVENTS)
          );
        }
      }
    },
    { arbitrary: { runs: 50 } }
  );
});

describe("the table", () => {
  it.prop(
    "sends an action only when it is legal, live, and nothing else is in flight",
    { plan: steps, table: views },
    ({ plan, table }) => {
      let model = start;
      const issued: number[] = [];

      for (const step of plan) {
        for (const message of messagesFor(step, table, issued)) {
          const result = update(model, message);
          const sent = sentActions(result.commands ?? []);

          if (isIntent(message)) {
            const before = model;

            const wanted = actionOf(message.intent).pipe(
              Option.filter((action) => legalAction(before, action))
            );

            expect(sent.map(({ action }) => action)).toEqual(
              Option.match(wanted, {
                onNone: () => [],
                onSome: (action) => [action],
              })
            );
          } else {
            expect(sent).toEqual([]);
          }

          issued.push(...sent.map(({ key }) => key));
          ({ model } = result);
        }
      }
    },
    { arbitrary: { runs: 100 } }
  );

  it.prop(
    "clears a pending command exactly once, on its first reply",
    { plan: steps, table: views },
    ({ plan, table }) => {
      let model = start;
      const issued: number[] = [];
      const cleared = new Set<number>();

      for (const step of plan) {
        for (const message of messagesFor(step, table, issued)) {
          const before = roomIn(model).pending;
          const result = update(model, message);
          const after = roomIn(result.model).pending;

          if (isReply(message)) {
            const wasPending = before.some(({ key }) => key === message.key);

            expect(wasPending).toBe(
              issued.includes(message.key) && !cleared.has(message.key)
            );
            expect(after.map(({ key }) => key)).toEqual(
              before.map(({ key }) => key).filter((key) => key !== message.key)
            );

            if (!wasPending) {
              expect(result.model).toStrictEqual(model);
            }

            cleared.add(message.key);
          }

          for (const { key } of sentActions(result.commands ?? [])) {
            expect(after.filter((pending) => pending.key === key)).toHaveLength(
              1
            );
            issued.push(key);
          }

          ({ model } = result);
        }
      }
    },
    { arbitrary: { runs: 100 } }
  );
});
