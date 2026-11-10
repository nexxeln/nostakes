import { describe, expect, it } from "@effect/vitest";
import { ActionSchema, LegalActionsSchema } from "@nostakes/engine";
import type { Action, LegalActions } from "@nostakes/engine";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import { MemberCommandSchema, RoomViewSchema } from "@nostakes/room";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";
import { Scene } from "foldkit";
import { getAllByRole, textContent } from "foldkit/scene";

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
import { init, update } from "../src/features/update.js";
import { view } from "../src/features/view.js";

const CODE = RoomCodeSchema.make("ABC234");

const PLAYER = PlayerIdSchema.make("player-0000000ab");

const start = init({
  invite: Option.some(CODE),
  profile: { avatar: "🦊", name: "Ana" },
  saved: Option.some({ code: CODE, player: PLAYER }),
  sound: false,
  theme: Option.none(),
}).model;

const StepSchema = Schema.TaggedUnion({
  Click: { action: ActionSchema },
  Link: {
    legal: Schema.Option(LegalActionsSchema),
    live: Schema.Boolean,
  },
  Reply: {
    accepted: Schema.Boolean,
    pick: Schema.Int.check(Schema.isBetween({ maximum: 8, minimum: 0 })),
  },
  Type: { value: Schema.String.check(Schema.isMaxLength(6)) },
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

const messageFor = (
  step: Step,
  table: OpenView,
  issued: readonly number[]
): Message =>
  StepSchema.match(step, {
    Click: ({ action }) => Messages.ClickedAction({ action }),
    Link: ({ legal, live }) =>
      Messages.GotLink({
        link: {
          phase: live ? "Live" : "Waiting",
          presence: [],
          receivedAt: 0,
          refusal: Option.none(),
          retryDelayMs: Option.none(),
          view: Option.some({ ...table, legal }),
        },
      }),
    Reply: ({ accepted, pick }) =>
      Messages.GotReply({
        key: issued[pick % Math.max(1, issued.length)] ?? 404,
        outcome: accepted
          ? ReplyOutcomes.Accepted({ seq: 1 })
          : ReplyOutcomes.Rejected({ reason: "no" }),
      }),
    Type: ({ value }) => Messages.ChangedDraft({ field: "raiseTo", value }),
  });

const isClick = Schema.is(Messages.ClickedAction);

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

const AMOUNT = /(?<amount>\d+)$/u;

const amountOf = (label: string) => Number(AMOUNT.exec(label)?.groups?.amount);

const buttonLegal = (label: string, legal: LegalActions) => {
  if (label === "Fold") {
    return true;
  }

  if (label === "Check") {
    return legal.canCheck;
  }

  if (label.startsWith("Call ")) {
    return Option.contains(legal.call, amountOf(label));
  }

  if (
    label.startsWith("Bet ") ||
    label.startsWith("Raise to ") ||
    label.startsWith("All in ")
  ) {
    return Option.exists(
      legal.raise,
      ({ maxTo, minTo }) => amountOf(label) >= minTo && amountOf(label) <= maxTo
    );
  }

  return false;
};

const BETTING = /^(?:Fold|Check|Call \d+|Bet \d+|Raise to \d+|All in \d+)$/u;

const enabledBettingButtons = (model: Model) => {
  const labels: string[] = [];

  Scene.scene(
    { update, view },
    Scene.given(model),
    Scene.tap((simulation) => {
      for (const button of getAllByRole("button", { disabled: false })(
        simulation.html
      )) {
        const label = textContent(button).trim();

        if (BETTING.test(label)) {
          labels.push(label);
        }
      }
    })
  );

  return labels;
};

const legalAction = (model: Model, action: Action) => {
  const room = roomIn(model);

  return (
    isLive(room) &&
    !isActing(room) &&
    Option.exists(legalOf(room), (legal) => isLegal(legal, action))
  );
};

describe("the table", () => {
  it.prop(
    "never enables a betting button for an action the view does not list as legal",
    { plan: steps, table: views },
    ({ plan, table }) => {
      let model = start;
      const issued: number[] = [];

      for (const step of plan) {
        const result = update(model, messageFor(step, table, issued));

        issued.push(
          ...sentActions(result.commands ?? []).map(({ key }) => key)
        );
        ({ model } = result);

        const room = roomIn(model);
        const labels = enabledBettingButtons(model);

        if (labels.length > 0) {
          expect(isLive(room)).toBe(true);
          expect(isActing(room)).toBe(false);
        }

        for (const label of labels) {
          expect(
            Option.exists(legalOf(room), (legal) => buttonLegal(label, legal)),
            label
          ).toBe(true);
        }
      }
    },
    { arbitrary: { runs: 60 } }
  );

  it.prop(
    "sends an action only when it is legal, live, and nothing else is in flight",
    { plan: steps, table: views },
    ({ plan, table }) => {
      let model = start;
      const issued: number[] = [];

      for (const step of plan) {
        const message = messageFor(step, table, issued);
        const result = update(model, message);
        const sent = sentActions(result.commands ?? []);

        if (isClick(message)) {
          expect(sent.map(({ action }) => action)).toEqual(
            legalAction(model, message.action) ? [message.action] : []
          );
        } else {
          expect(sent).toEqual([]);
        }

        issued.push(...sent.map(({ key }) => key));
        ({ model } = result);
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
        const message = messageFor(step, table, issued);
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
    },
    { arbitrary: { runs: 100 } }
  );
});
