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

import {
  ANSWER_LIMIT_MS,
  answerTimers,
  NOTHING_OWED,
  OVERDUE_GRACE_MS,
  pongDeadline,
  REPLY_LAST_RESORT_MS,
  replyDeadline,
  roomClientMachine,
  TIMERS,
  WAKE_PROBE_MS,
} from "../src/index.js";
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
  "CommandSent",
  "PingSent",
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

const NamedTimerSchema = Schema.Literals(Object.values(TIMERS));

type NamedTimer = typeof NamedTimerSchema.Type;

const PersistedSchema = Schema.Struct({
  children: Schema.Record(Schema.String, Schema.Unknown),
  timers: Schema.Array(Schema.Struct({ delay: Schema.Int, id: Schema.String })),
});

const persisted = (snapshot: Snapshot) =>
  Schema.decodeUnknownSync(PersistedSchema)(
    machine.getPersistedSnapshot(snapshot)
  );

const timerIds = (snapshot: Snapshot) =>
  persisted(snapshot).timers.map(({ id }) => id);

const timerDelays = (snapshot: Snapshot) =>
  Object.fromEntries(
    persisted(snapshot).timers.map(({ delay, id }) => [id, delay])
  );

const NAMED_FIRING: Record<NamedTimer, MachineEvent> = {
  connect: { type: "ConnectTimedOut" },
  greeting: { type: "GreetingTimedOut" },
  overdue: { type: "Unanswered" },
  ping: { type: "PingDue" },
  retry: { type: "RetryDue" },
  silence: { type: "Silent" },
};

const isNamedTimer = Schema.is(NamedTimerSchema);

const SAMPLE_ID = CommandIdSchema.make("x");

const REPLY_PREFIX = replyDeadline(SAMPLE_ID).slice(0, -SAMPLE_ID.length);

const firing = (id: string, snapshot: Snapshot): MachineEvent => {
  if (isNamedTimer(id)) {
    return NAMED_FIRING[id];
  }

  const late = snapshot.context.owed.late.some(
    (owed) => replyDeadline(owed) === id
  );

  return id.startsWith(REPLY_PREFIX) && !late
    ? {
        id: CommandIdSchema.make(id.slice(REPLY_PREFIX.length)),
        type: "ReplyLate",
      }
    : { deadline: id, type: "Overdue" };
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
    CommandSent: ({ pick, snapshot }) => [
      {
        id:
          snapshot.context.pending[
            pick % Math.max(1, snapshot.context.pending.length)
          ]?.id ?? stranger,
        type: "CommandSent",
      },
    ],
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
    PingSent: () => [{ type: "PingSent" }],
    Pong: () => [{ type: "Pong" }],
    Presence: () => [{ connected: [YOU], type: "Presence" }],
    Reply: ({ snapshot }) => [replyTo(snapshot, firstSent(snapshot))],
    Start: () => [{ type: "Start" }],
    Stop: () => [{ type: "Stop" }],
    StrangerReply: ({ snapshot }) => [replyTo(snapshot, stranger)],
    Timer: ({ pick, snapshot }) => {
      const ids = timerIds(snapshot);
      const id = ids[pick % Math.max(1, ids.length)];

      return id === undefined ? [] : [firing(id, snapshot)];
    },
    Wake: () => [{ type: "Wake" }],
    Welcome: ({ snapshot }) => {
      const applied = appliedOf(snapshot);

      return [
        {
          catchUp: toyCodec.catchUp.cases.Missed.make({
            events: [added(applied + 1), added(applied + 2)],
            from: seq(applied + 1),
          }),
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

const ARMED: readonly (readonly [object | string, readonly NamedTimer[]])[] = [
  [{ Online: "Connecting" }, ["connect"]],
  [{ Online: "Greeting" }, ["greeting"]],
  [{ Online: "Live" }, ["ping", "silence"]],
  [{ Waiting: "Sleeping" }, ["retry"]],
];

const armedFor = (snapshot: Snapshot): readonly string[] => [
  ...ARMED.flatMap(([value, ids]) =>
    JSON.stringify(snapshot.value) === JSON.stringify(value) ? ids : []
  ),
  ...answerTimers(snapshot.context.owed),
];

const checkOwed = (snapshot: Snapshot) => {
  const { owed, pending } = snapshot.context;
  const pendingIds = new Set(pending.map(({ id }) => id));

  if (!isLive(snapshot)) {
    expect(owed).toEqual(NOTHING_OWED);
  }

  expect(new Set(owed.replies).size).toBe(owed.replies.length);
  expect(owed.replies.every((id) => pendingIds.has(id))).toBe(true);
  expect(owed.pongsHeard).toBeLessThanOrEqual(owed.pingsSent);
  expect(new Set(owed.overdue).size).toBe(owed.overdue.length);

  const owedFrames = new Set([
    ...owed.replies.map(replyDeadline),
    ...Array.from({ length: owed.pingsSent - owed.pongsHeard }, (_, index) =>
      pongDeadline(owed.pongsHeard + index + 1)
    ),
  ]);

  expect(owed.overdue.every((late) => owedFrames.has(late))).toBe(true);
  expect(new Set(owed.late).size).toBe(owed.late.length);
  expect(owed.late.every((id) => owed.replies.includes(id))).toBe(true);

  const lateDeadlines = new Set(owed.late.map(replyDeadline));

  for (const id of answerTimers(owed)) {
    const expectedDelay = lateDeadlines.has(id)
      ? REPLY_LAST_RESORT_MS - ANSWER_LIMIT_MS
      : ANSWER_LIMIT_MS;

    expect(timerDelays(snapshot)[id]).toBe(
      id === TIMERS.overdue ? OVERDUE_GRACE_MS : expectedDelay
    );
  }
};

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

  checkOwed(after);
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

interface Answers {
  readonly replies: Set<CommandId>;
  readonly late: Set<CommandId>;
  readonly overdue: Set<string>;
  pings: number;
  pongs: number;
}

const noAnswersOwed = (): Answers => ({
  late: new Set(),
  overdue: new Set(),
  pings: 0,
  pongs: 0,
  replies: new Set(),
});

const owedFramesOf = (answers: Answers) => [
  ...[...answers.replies].map(replyDeadline),
  ...Array.from({ length: answers.pings - answers.pongs }, (_, index) =>
    pongDeadline(answers.pongs + index + 1)
  ),
];

const owe = (answers: Answers, before: Snapshot, event: MachineEvent) => {
  if (!isLive(before)) {
    return;
  }

  const pending = before.context.pending.map(({ id }) => id);

  if (event.type === "CommandSent" && pending.includes(event.id)) {
    answers.replies.add(event.id);
  }

  if (event.type === "Reply" || event.type === "Cancel") {
    answers.replies.delete(event.id);
    answers.late.delete(event.id);
    answers.overdue.delete(replyDeadline(event.id));
  }

  if (event.type === "ReplyLate" && answers.replies.has(event.id)) {
    answers.late.add(event.id);
  }

  if (event.type === "Pong" && answers.pongs < answers.pings) {
    answers.pongs += 1;
    answers.overdue.delete(pongDeadline(answers.pongs));
  }

  answers.pings += event.type === "PingSent" ? 1 : 0;

  if (
    event.type === "Overdue" &&
    owedFramesOf(answers).includes(event.deadline)
  ) {
    answers.overdue.add(event.deadline);
  }
};

const expectDeadlinesFor = (answers: Answers, after: Snapshot) => {
  const expected = [
    ...owedFramesOf(answers).filter((frame) => !answers.overdue.has(frame)),
    ...(answers.overdue.size > 0 ? [TIMERS.overdue] : []),
  ];

  const answerTimersArmed = timerIds(after).filter(
    (id) => id === TIMERS.overdue || !Object.values<string>(TIMERS).includes(id)
  );

  expect(answerTimersArmed.toSorted()).toEqual(expected.toSorted());
};

const replay = (history: readonly (readonly [Step, number])[]) => {
  let [snapshot] = initialTransition(machine, input);
  let issued = 0;
  let sentOnThisSocket = new Map<CommandId, number>();
  let answers = noAnswersOwed();

  for (const [step, pick] of history) {
    for (const event of STEP_EVENTS[step]({ issued, pick, snapshot })) {
      const [next, effects] = transition(machine, snapshot, event);

      if (event.type === "Opened") {
        sentOnThisSocket = new Map();
      }

      const lateBefore = answers.late.size;

      owe(answers, snapshot, event);

      const probes = transmitted(effects).filter(toyCodec.client.guards.Ping);

      if (event.type === "ReplyLate") {
        expect(probes.length).toBe(
          lateBefore === 0 && answers.late.size === 1 ? 1 : 0
        );
      }

      if (!isLive(next)) {
        answers = noAnswersOwed();
      }

      checkStep(snapshot, next, effects, sentOnThisSocket);
      expectDeadlinesFor(answers, next);
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
    snapshot.context.owed.replies.length > 0,
    snapshot.context.owed.pingsSent > snapshot.context.owed.pongsHeard,
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

const run = (events: readonly MachineEvent[]) => {
  let [snapshot] = initialTransition(machine, input);

  for (const event of events) {
    [snapshot] = transition(machine, snapshot, event);
  }

  return snapshot;
};

const commandC0 = CommandIdSchema.make("c-0");

const LIVE_WITH_C0_OWED: readonly MachineEvent[] = [
  { type: "Start" },
  { link, type: "Opened" },
  ...STEP_EVENTS.Welcome({ issued: 0, pick: 0, snapshot: run([]) }),
  {
    command: ToyCommandSchema.cases.Add.make({ amount: 1 }),
    id: commandC0,
    type: "Issue",
  },
  { id: commandC0, type: "CommandSent" },
];

describe("answer deadlines", () => {
  it("wake during live with an unanswered command arms one probe, one deadline per frame owed an answer, and nothing else", () => {
    const woken = run([
      ...LIVE_WITH_C0_OWED,
      { type: "Wake" },
      { type: "PingSent" },
    ]);

    expect(timerDelays(woken)).toEqual({
      [pongDeadline(1)]: ANSWER_LIMIT_MS,
      [replyDeadline(commandC0)]: ANSWER_LIMIT_MS,
      ping: 15_000,
      silence: WAKE_PROBE_MS,
    });

    const twice = run([
      ...LIVE_WITH_C0_OWED,
      { type: "Wake" },
      { type: "PingSent" },
      { type: "Wake" },
      { type: "PingSent" },
    ]);

    expect(timerIds(twice).toSorted()).toEqual(
      [
        "ping",
        pongDeadline(1),
        pongDeadline(2),
        replyDeadline(commandC0),
        "silence",
      ].toSorted()
    );

    const answered = run([
      ...LIVE_WITH_C0_OWED,
      { type: "Wake" },
      { type: "PingSent" },
      { type: "Wake" },
      { type: "PingSent" },
      { type: "Pong" },
      replyTo(run(LIVE_WITH_C0_OWED), commandC0),
    ]);

    expect(timerDelays(answered)).toEqual({
      [pongDeadline(2)]: ANSWER_LIMIT_MS,
      ping: 15_000,
      silence: 30_000,
    });
  });

  it("a late reply sends one probe and keeps the connection, its last resort arms one grace, an answer inside the grace keeps the connection, and the grace running out drops it as unanswered with nothing owed after", () => {
    const lateReply = { id: commandC0, type: "ReplyLate" } as const;

    const lastResort = {
      deadline: replyDeadline(commandC0),
      type: "Overdue",
    } as const;

    const waiting = run([...LIVE_WITH_C0_OWED, lateReply]);

    expect(waiting.matches({ Online: "Live" })).toBe(true);
    expect(waiting.context.owed.late).toEqual([commandC0]);
    expect(timerDelays(waiting)).toEqual({
      [replyDeadline(commandC0)]: REPLY_LAST_RESORT_MS - ANSWER_LIMIT_MS,
      ping: 15_000,
      silence: 30_000,
    });

    const overdue = run([...LIVE_WITH_C0_OWED, lateReply, lastResort]);

    expect(overdue.matches({ Online: "Live" })).toBe(true);
    expect(timerDelays(overdue)).toEqual({
      overdue: OVERDUE_GRACE_MS,
      ping: 15_000,
      silence: 30_000,
    });

    const saved = run([
      ...LIVE_WITH_C0_OWED,
      lateReply,
      lastResort,
      replyTo(run(LIVE_WITH_C0_OWED), commandC0),
    ]);

    expect(saved.matches({ Online: "Live" })).toBe(true);
    expect(saved.context.owed).toEqual(NOTHING_OWED);
    expect(timerIds(saved).toSorted()).toEqual(["ping", "silence"]);

    const dropped = run([
      ...LIVE_WITH_C0_OWED,
      lateReply,
      lastResort,
      { type: "Unanswered" },
    ]);

    expect(dropped.matches("Waiting")).toBe(true);
    expect(dropped.context.drop).toEqual(Option.some("Unanswered"));
    expect(dropped.context.owed).toEqual(NOTHING_OWED);
    expect(dropped.context.pending.map(({ id }) => id)).toEqual([commandC0]);
    expect(timerIds(dropped)).toEqual([]);
  });
});

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
