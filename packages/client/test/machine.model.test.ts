import { describe, expect, it } from "@effect/vitest";
import { CommandIdSchema } from "@nostakes/protocol";
import type { CommandId } from "@nostakes/protocol";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";
import {
  describeExecutableEffect,
  initialTransition,
  transition,
} from "xstate";
import type { EventFromLogic, SnapshotFrom } from "xstate";
import { getShortestPaths } from "xstate/graph";

import { roomClientMachine, TIMERS } from "../src/index.js";
import type { ClientMessage, Link } from "../src/index.js";
import { seq, YOU } from "./fixtures/fake-transport.js";
import {
  ROOM_URL,
  TOKEN,
  toyCodec,
  ToyCommandSchema,
  ToyEventSchema,
} from "./fixtures/toy-room.js";
import type { ToyTypes } from "./fixtures/toy-room.js";

const machine = roomClientMachine<ToyTypes>(toyCodec);

type Machine = typeof machine;

type Snapshot = SnapshotFrom<Machine>;

type MachineEvent = EventFromLogic<Machine>;

type Effects = ReturnType<typeof transition<Machine>>[1];

const input = { token: TOKEN, url: ROOM_URL };

const link: Link<ToyTypes> = {
  transmit: () => {
    expect.unreachable("a pure transition never runs its actions");
  },
};

const StepSchema = Schema.Literals([
  "Start",
  "Stop",
  "Wake",
  "Issue",
  "Cancel",
  "Opened",
  "Welcome",
  "BatchNext",
  "BatchPast",
  "BatchFuture",
  "Reply",
  "StrangerReply",
  "Pong",
  "Presence",
  "ClosingRetry",
  "ClosingRefuse",
  "ClosedRefuseReason",
  "Closed",
  "Garbled",
  "Timer",
  "Drawn",
]);

type Step = typeof StepSchema.Type;

const Pick = Schema.Int.check(Schema.isBetween({ maximum: 7, minimum: 0 }));

const histories = Arbitrary.array(
  Arbitrary.all([Arbitrary.schema(StepSchema), Arbitrary.schema(Pick)]),
  { maxLength: 80, minLength: 20 }
);

const TimerIdSchema = Schema.Literals(Object.values(TIMERS));

type TimerId = typeof TimerIdSchema.Type;

const PersistedSchema = Schema.Struct({
  children: Schema.Record(Schema.String, Schema.Unknown),
  timers: Schema.Array(Schema.Struct({ id: TimerIdSchema })),
});

const persisted = (snapshot: Snapshot) =>
  Schema.decodeUnknownSync(PersistedSchema)(
    machine.getPersistedSnapshot(snapshot)
  );

const timerIds = (snapshot: Snapshot) =>
  persisted(snapshot).timers.map(({ id }) => id);

const firing: Record<TimerId, MachineEvent> = {
  connect: { type: "ConnectTimedOut" },
  greeting: { type: "GreetingTimedOut" },
  ping: { type: "PingDue" },
  retry: { type: "RetryDue" },
  silence: { type: "Silent" },
};

const added = (total: number) =>
  ToyEventSchema.cases.Added.make({ amount: 1, total });

const appliedOf = (snapshot: Snapshot) =>
  Option.getOrElse(snapshot.context.applied, () => 0);

const stranger = CommandIdSchema.make("stranger");

const firstSent = (snapshot: Snapshot) =>
  snapshot.context.pending.find((entry) => entry.sent)?.id ?? stranger;

const batchFrom = (from: number): MachineEvent => ({
  events: [added(from)],
  from: seq(from),
  to: seq(from),
  type: "Batch",
  view: { total: from },
});

const replyTo = (snapshot: Snapshot, id: CommandId): MachineEvent => ({
  id,
  result: toyCodec.reply.cases.Accepted.make({ seq: seq(appliedOf(snapshot)) }),
  type: "Reply",
});

interface StepInput {
  readonly snapshot: Snapshot;
  readonly pick: number;
  readonly issued: number;
}

const STEP_EVENTS: Record<Step, (step: StepInput) => readonly MachineEvent[]> =
  {
    BatchFuture: ({ snapshot }) => [batchFrom(appliedOf(snapshot) + 3)],
    BatchNext: ({ snapshot }) => [batchFrom(appliedOf(snapshot) + 1)],
    BatchPast: () => [batchFrom(1)],
    Cancel: ({ pick, snapshot }) => [
      { id: snapshot.context.pending[pick]?.id ?? stranger, type: "Cancel" },
    ],
    Closed: () => [{ code: 1006, reason: "", type: "Closed" }],
    ClosedRefuseReason: () => [
      { code: 4010, reason: "RoomHalted", type: "Closed" },
    ],
    ClosingRefuse: () => [{ reason: "NotAuthorized", type: "Closing" }],
    ClosingRetry: () => [{ reason: "HelloTimeout", type: "Closing" }],
    Drawn: ({ pick }) => [{ delayMs: 125 * (pick + 1), type: "Drawn" }],
    Garbled: () => [{ type: "Garbled" }],
    Issue: ({ issued, pick }) => [
      {
        command: ToyCommandSchema.cases.Add.make({ amount: pick }),
        id: CommandIdSchema.make(`c-${issued}`),
        type: "Issue",
      },
    ],
    Opened: () => [{ link, type: "Opened" }],
    Pong: () => [{ type: "Pong" }],
    Presence: () => [{ connected: [YOU], type: "Presence" }],
    Reply: ({ snapshot }) => [replyTo(snapshot, firstSent(snapshot))],
    Start: () => [{ type: "Start" }],
    Stop: () => [{ type: "Stop" }],
    StrangerReply: ({ snapshot }) => [replyTo(snapshot, stranger)],
    Timer: ({ pick, snapshot }) => {
      const ids = timerIds(snapshot);
      const id = ids[pick % Math.max(1, ids.length)];

      return id === undefined ? [] : [firing[id]];
    },
    Wake: () => [{ type: "Wake" }],
    Welcome: ({ snapshot }) => {
      const applied = appliedOf(snapshot);

      return [
        {
          missed: [added(applied + 1), added(applied + 2)],
          seq: seq(applied + 2),
          type: "Welcome",
          view: { total: applied + 2 },
          you: YOU,
        },
      ];
    },
  };

const TransmissionSchema = Schema.Struct({
  kind: Schema.Literal("action"),
  params: Schema.Struct({
    args: Schema.Tuple([Schema.Unknown, Schema.Unknown]),
  }),
  type: Schema.Literal("transmitFrame"),
});

const isTransmission = Schema.is(TransmissionSchema);

const isClientMessage = Schema.is(toyCodec.client);

const transmitted = (effects: Effects): readonly ClientMessage<ToyTypes>[] =>
  effects.flatMap((effect) => {
    const described = describeExecutableEffect(effect);

    if (!isTransmission(described)) {
      return [];
    }

    const [, message] = described.params.args;

    return isClientMessage(message) ? [message] : [];
  });

const isLive = (snapshot: Snapshot) => snapshot.matches({ Online: "Live" });

const isGreeting = (snapshot: Snapshot) =>
  snapshot.matches({ Online: "Greeting" });

const ARMED: readonly (readonly [object | string, readonly TimerId[]])[] = [
  [{ Online: "Connecting" }, ["connect"]],
  [{ Online: "Greeting" }, ["greeting"]],
  [{ Online: "Live" }, ["ping", "silence"]],
  [{ Waiting: "Sleeping" }, ["retry"]],
];

const armedFor = (snapshot: Snapshot) =>
  ARMED.flatMap(([value, ids]) =>
    JSON.stringify(snapshot.value) === JSON.stringify(value) ? ids : []
  );

const checkCommands = (
  before: Snapshot,
  after: Snapshot,
  sent: readonly ClientMessage<ToyTypes>[],
  sentOnThisSocket: Map<CommandId, number>
) => {
  const commands = sent.filter(toyCodec.client.guards.Command);

  if (commands.length > 0) {
    expect(isLive(after)).toBe(true);
  }

  if (commands.length > 0 && !isLive(before)) {
    expect(isGreeting(before)).toBe(true);
    expect(commands.map(({ id }) => id)).toEqual(
      before.context.pending.map(({ id }) => id)
    );
  }

  for (const { id } of commands) {
    sentOnThisSocket.set(id, (sentOnThisSocket.get(id) ?? 0) + 1);
    expect(sentOnThisSocket.get(id)).toBe(1);
  }
};

const checkStep = (
  before: Snapshot,
  after: Snapshot,
  effects: Effects,
  sentOnThisSocket: Map<CommandId, number>
) => {
  const sent = transmitted(effects);

  checkCommands(before, after, sent, sentOnThisSocket);

  for (const message of sent) {
    if (toyCodec.client.guards.Hello(message)) {
      expect(isGreeting(after) && !isGreeting(before)).toBe(true);
      expect(message.after).toEqual(before.context.applied);
    }

    if (toyCodec.client.guards.Ping(message)) {
      expect(isLive(after)).toBe(true);
    }
  }

  const stored = persisted(after);

  expect(timerIds(after).toSorted()).toEqual(armedFor(after).toSorted());
  expect(
    Object.keys(stored.children).some((id) =>
      id.startsWith("roomClient.Online")
    )
  ).toBe(after.matches("Online"));

  if (after.status === "done") {
    expect(stored.timers).toEqual([]);
    expect(stored.children).toEqual({});
    expect(["Refused", "Stopped"]).toContain(after.value);
  }

  if (before.status === "done") {
    expect(after.value).toEqual(before.value);
    expect(sent).toEqual([]);
  }
};

const replay = (history: readonly (readonly [Step, number])[]) => {
  let [snapshot] = initialTransition(machine, input);
  let issued = 0;
  let sentOnThisSocket = new Map<CommandId, number>();

  for (const [step, pick] of history) {
    for (const event of STEP_EVENTS[step]({ issued, pick, snapshot })) {
      const [next, effects] = transition(machine, snapshot, event);

      if (event.type === "Opened") {
        sentOnThisSocket = new Map();
      }

      checkStep(snapshot, next, effects, sentOnThisSocket);
      snapshot = next;
    }

    issued += step === "Issue" ? 1 : 0;
  }

  return snapshot;
};

const abstractState = (snapshot: Snapshot) =>
  JSON.stringify([
    snapshot.value,
    snapshot.status,
    snapshot.context.pending.length > 0,
    snapshot.context.pending.some(({ sent }) => sent),
    Option.isSome(snapshot.context.applied),
  ]);

const everyEvent = (snapshot: Snapshot) =>
  StepSchema.literals.flatMap((step) =>
    STEP_EVENTS[step]({ issued: 0, pick: 0, snapshot })
  );

const reachable = () =>
  getShortestPaths(machine, {
    events: everyEvent,
    input,
    serializeState: abstractState,
  });

const LEAVES = [
  "Idle",
  { Online: "Connecting" },
  { Online: "Greeting" },
  { Online: "Live" },
  { Waiting: "Drawing" },
  { Waiting: "Sleeping" },
  "Refused",
  "Stopped",
].map((leaf) => JSON.stringify(leaf));

const reaches = (from: Snapshot, target: (candidate: Snapshot) => boolean) =>
  getShortestPaths(machine, {
    events: everyEvent,
    fromState: from,
    serializeState: abstractState,
    toState: target,
  }).some((path) => target(path.state) && path.steps.length > 0);

describe("connection lifecycle model", () => {
  it("reaches every state, and only Refused and Stopped are final", () => {
    const paths = reachable();

    const values = new Set(
      paths.map(({ state }) => JSON.stringify(state.value))
    );

    expect([...values].toSorted()).toEqual(LEAVES.toSorted());

    for (const { state } of paths) {
      const final = state.value === "Refused" || state.value === "Stopped";

      expect(state.status).toBe(final ? "done" : "active");
    }
  });

  it("every reachable state has a way forward, to Live and to Stopped, and the final states never move", () => {
    for (const { state, steps } of reachable()) {
      const route = steps.map(({ event }) => event.type).join(" > ");

      if (state.status === "done") {
        for (const event of everyEvent(state)) {
          expect(transition(machine, state, event)[0].value).toEqual(
            state.value
          );
        }

        continue;
      }

      expect(
        isLive(state) || reaches(state, isLive),
        `no way to Live after ${route}`
      ).toBe(true);
      expect(
        reaches(state, (candidate) => candidate.value === "Stopped"),
        `no way to Stopped after ${route}`
      ).toBe(true);
    }
  });

  it("every edge of the reachable graph keeps the invariants", () => {
    let edges = 0;

    for (const { state } of reachable()) {
      for (const event of everyEvent(state)) {
        const [next, effects] = transition(machine, state, event);
        const fresh = new Map<CommandId, number>();

        checkStep(state, next, effects, fresh);
        edges += 1;
      }
    }

    expect(edges).toBeGreaterThan(100);
  });

  it.prop(
    "no history sends a command outside Live, resends out of order, or leaves a timer or socket behind its state",
    { history: histories },
    ({ history }) => {
      replay(history);
    },
    { arbitrary: { runs: 400 } }
  );

  it.prop(
    "a stop after any history leaves no timer and no child actor",
    { history: histories },
    ({ history }) => {
      const stopped = replay([...history, ["Stop", 0]]);
      const stored = persisted(stopped);

      expect(stopped.status).toBe("done");
      expect(stored.timers).toEqual([]);
      expect(stored.children).toEqual({});
    },
    { arbitrary: { runs: 200 } }
  );
});
