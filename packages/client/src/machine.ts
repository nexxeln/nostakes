import { SeqSchema } from "@nostakes/protocol";
import type { CloseReason, CommandId, Seq } from "@nostakes/protocol";
import { createEffectEventStreamLogic, setupEffect } from "@xstate/effect";
import { Array as Arr, Effect, Option, Schema, Stream } from "effect";
import { types } from "xstate";

import { drawBackoff } from "./backoff.js";
import { Activities } from "./client-events.js";
import type {
  Activity,
  ClientContext,
  ClientInput,
  ConnectionPayloads,
  DropReason,
  Link,
  Owed,
  PendingCommand,
} from "./client-events.js";
import { CLOSE_VERDICTS, closeReasonIn } from "./close-reasons.js";
import type {
  ClientCodec,
  ClientMessage,
  ReplyResult,
  RoomTypes,
} from "./codec.js";
import { connectionEvents } from "./connection.js";
import { BatchFits, fitBatch, fitWelcome, WelcomeFits } from "./sequence.js";
import type { WelcomeSpan } from "./sequence.js";
import {
  ANSWER_LIMIT_MS,
  CONNECT_TIMEOUT_MS,
  GREETING_TIMEOUT_MS,
  OVERDUE_GRACE_MS,
  PING_INTERVAL_MS,
  REPLY_LAST_RESORT_MS,
  SILENCE_LIMIT_MS,
  WAKE_PROBE_MS,
} from "./timing.js";

export const TIMERS = {
  connect: "connect",
  greeting: "greeting",
  overdue: "overdue",
  ping: "ping",
  retry: "retry",
  silence: "silence",
} as const;

export const PING_TIMER = TIMERS.ping;

export const SILENCE_TIMER = TIMERS.silence;

export const replyDeadline = (id: CommandId) => `reply ${id}`;

export const pongDeadline = (ping: number) => `pong ${ping}`;

export const NOTHING_OWED: Owed = {
  late: [],
  overdue: [],
  pingsSent: 0,
  pongsHeard: 0,
  replies: [],
};

const deadlinesOwed = ({ pingsSent, pongsHeard, replies }: Owed) => [
  ...replies.map(replyDeadline),
  ...Array.from({ length: Math.max(0, pingsSent - pongsHeard) }, (_, index) =>
    pongDeadline(pongsHeard + index + 1)
  ),
];

export const answerTimers = (owed: Owed): readonly string[] => [
  ...deadlinesOwed(owed).filter((deadline) => !owed.overdue.includes(deadline)),
  ...(owed.overdue.length > 0 ? [TIMERS.overdue] : []),
];

const answered = (owed: Owed, deadline: string): Owed => ({
  ...owed,
  overdue: owed.overdue.filter((late) => late !== deadline),
});

const replyAnswered = (owed: Owed, id: CommandId): Owed =>
  answered(
    {
      ...owed,
      late: owed.late.filter((late) => late !== id),
      replies: owed.replies.filter((owedId) => owedId !== id),
    },
    replyDeadline(id)
  );

const ConnectionInput = Schema.Struct({ url: Schema.String });

const BackoffInput = Schema.Struct({ attempt: Schema.Int });

const NoPayload = Schema.Struct({});

const appliedSeqOf = (applied: Option.Option<Seq>) =>
  Option.getOrElse(applied, () => 0);

const seqAt = (value: number) => SeqSchema.make(value);

interface CaughtUp<T extends RoomTypes> {
  readonly events: readonly T["Event"][];
  readonly span: WelcomeSpan;
}

const withoutCommand = <T extends RoomTypes>(
  pending: readonly PendingCommand<T>[],
  id: CommandId
) => pending.filter((entry) => entry.id !== id);

const refusalFor = (reason: string): Option.Option<CloseReason> =>
  closeReasonIn(reason).pipe(
    Option.filter((known) => CLOSE_VERDICTS[known] === "Refuse")
  );

const dropped = (reason: DropReason) => ({
  context: { drop: Option.some(reason) },
  target: "#roomClient.Waiting",
});

const drawn = (attempt: number) =>
  Stream.fromEffect(
    drawBackoff(attempt).pipe(
      Effect.map((delayMs) => ({ delayMs, type: "Drawn" as const }))
    )
  );

export const roomClientMachine = <T extends RoomTypes>(
  codec: ClientCodec<T>
) => {
  const Frames = codec.client.cases;
  const CatchUps = codec.catchUp;

  const transmitFrame = (
    link: Option.Option<Link<T>>,
    message: ClientMessage<T>
  ) => {
    for (const open of Option.toArray(link)) {
      open.transmit(message);
    }
  };

  const connection = createEffectEventStreamLogic({
    schemas: { input: ConnectionInput },
    stream: ({ input }) => connectionEvents(codec, input.url),
  });

  const backoff = createEffectEventStreamLogic({
    schemas: { input: BackoffInput },
    stream: ({ input }) => drawn(input.attempt),
  });

  return setupEffect({
    actors: { backoff, connection },
    schemas: {
      context: types<ClientContext<T>>(),
      emitted: {
        Applied: types<{
          readonly activity: readonly Activity<T["Event"]>[];
        }>(),
        Replied: types<{
          readonly id: CommandId;
          readonly result: ReplyResult<T>;
        }>(),
      },
      events: {
        Batch: types<ConnectionPayloads<T>["Batch"]>(),
        Cancel: types<{ readonly id: CommandId }>(),
        Closed: types<ConnectionPayloads<T>["Closed"]>(),
        Closing: types<ConnectionPayloads<T>["Closing"]>(),
        CommandSent: types<{ readonly id: CommandId }>(),
        Drawn: types<{ readonly delayMs: number }>(),
        Garbled: NoPayload,
        Issue: types<{
          readonly id: CommandId;
          readonly command: T["Command"];
        }>(),
        Opened: types<ConnectionPayloads<T>["Opened"]>(),
        PingSent: NoPayload,
        Pong: NoPayload,
        Presence: types<ConnectionPayloads<T>["Presence"]>(),
        Reply: types<ConnectionPayloads<T>["Reply"]>(),
        Start: NoPayload,
        Stop: NoPayload,
        Wake: NoPayload,
        Welcome: types<ConnectionPayloads<T>["Welcome"]>(),
      },
      input: types<ClientInput>(),
      internalEvents: {
        ConnectTimedOut: NoPayload,
        GreetingTimedOut: NoPayload,
        Overdue: types<{ readonly deadline: string }>(),
        PingDue: NoPayload,
        ReplyLate: types<{ readonly id: CommandId }>(),
        RetryDue: NoPayload,
        Silent: NoPayload,
        Unanswered: NoPayload,
      },
    },
  }).createMachine({
    context: ({ input }) => ({
      applied: Option.none(),
      drop: Option.none(),
      failures: 0,
      link: Option.none(),
      owed: NOTHING_OWED,
      pending: [],
      presence: [],
      refusal: Option.none(),
      retryDelayMs: 0,
      token: input.token,
      url: input.url,
      view: Option.none(),
      you: Option.none(),
    }),
    id: "roomClient",
    initial: "Idle",
    on: {
      Cancel: ({ context, event }, enq) => {
        const owed = replyAnswered(context.owed, event.id);

        enq.cancel(replyDeadline(event.id));

        if (owed.overdue.length === 0) {
          enq.cancel(TIMERS.overdue);
        }

        return {
          context: { owed, pending: withoutCommand(context.pending, event.id) },
        };
      },
      Issue: ({ context, event }) => ({
        context: {
          pending: [
            ...context.pending,
            { command: event.command, id: event.id, sent: false },
          ],
        },
      }),
      Stop: { target: ".Stopped" },
    },
    states: {
      Idle: {
        on: { Start: { target: "Online" } },
      },
      Online: {
        exit: () => ({ context: { link: Option.none() } }),
        initial: "Connecting",
        invoke: {
          input: ({ context }) => ({ url: context.url }),
          onDone: dropped("SocketClosed"),
          onError: dropped("SocketClosed"),
          src: "connection",
        },
        on: {
          Closed: ({ event }) =>
            Option.match(refusalFor(event.reason), {
              onNone: () => dropped("SocketClosed"),
              onSome: (reason) => ({
                context: { refusal: Option.some(reason) },
                target: "#roomClient.Refused",
              }),
            }),
          Closing: ({ event }) =>
            CLOSE_VERDICTS[event.reason] === "Refuse"
              ? {
                  context: { refusal: Option.some(event.reason) },
                  target: "#roomClient.Refused",
                }
              : dropped(event.reason),
          Garbled: dropped("Garbled"),
        },
        states: {
          Connecting: {
            entry: (_, enq) => {
              enq.raise(
                { type: "ConnectTimedOut" },
                { delay: CONNECT_TIMEOUT_MS, id: TIMERS.connect }
              );
            },
            exit: (_, enq) => {
              enq.cancel(TIMERS.connect);
            },
            on: {
              ConnectTimedOut: dropped("ConnectTimeout"),
              Opened: ({ event }) => ({
                context: { link: Option.some(event.link) },
                target: "Greeting",
              }),
            },
          },
          Greeting: {
            entry: ({ context }, enq) => {
              enq(
                transmitFrame,
                context.link,
                Frames.Hello.make({
                  after: context.applied,
                  token: context.token,
                })
              );
              enq.raise(
                { type: "GreetingTimedOut" },
                { delay: GREETING_TIMEOUT_MS, id: TIMERS.greeting }
              );
            },
            exit: (_, enq) => {
              enq.cancel(TIMERS.greeting);
            },
            on: {
              GreetingTimedOut: dropped("GreetingTimeout"),
              Welcome: ({ context, event }, enq) => {
                const caughtUp = CatchUps.match(event.catchUp, {
                  Missed: ({ events, from }): CaughtUp<T> => ({
                    events,
                    span: {
                      missedCount: events.length,
                      missedFrom: from,
                      seq: event.seq,
                      skipped: Option.none(),
                    },
                  }),
                  Skipped: ({ from, to }): CaughtUp<T> => ({
                    events: [],
                    span: {
                      missedCount: 0,
                      missedFrom: to + 1,
                      seq: event.seq,
                      skipped: Option.some({ from, to }),
                    },
                  }),
                  UpToDate: (): CaughtUp<T> => ({
                    events: [],
                    span: {
                      missedCount: 0,
                      missedFrom: event.seq + 1,
                      seq: event.seq,
                      skipped: Option.none(),
                    },
                  }),
                });

                return WelcomeFits.$match(
                  fitWelcome(context.applied, caughtUp.span),
                  {
                    Gap: () => dropped("Gap"),
                    Malformed: () => dropped("Malformed"),
                    Resume: ({ keepFrom, skipped }) => {
                      const activity: Activity<T["Event"]>[] = [
                        ...Option.toArray(skipped).map(({ from, to }) =>
                          Activities.Skipped({
                            from: seqAt(from),
                            to: seqAt(to),
                          })
                        ),
                        ...caughtUp.events
                          .slice(keepFrom)
                          .map((missed, index) =>
                            Activities.Applied({
                              event: missed,
                              seq: seqAt(
                                caughtUp.span.missedFrom + keepFrom + index
                              ),
                            })
                          ),
                      ];

                      if (Arr.isArrayNonEmpty(activity)) {
                        enq.emit({ activity, type: "Applied" });
                      }

                      for (const { command, id } of context.pending) {
                        enq(
                          transmitFrame,
                          context.link,
                          Frames.Command.make({ command, id })
                        );
                      }

                      return {
                        context: {
                          applied: Option.some(event.seq),
                          drop: Option.none(),
                          failures: 0,
                          pending: context.pending.map((entry) => ({
                            ...entry,
                            sent: true,
                          })),
                          view: Option.some(event.view),
                          you: Option.some(event.you),
                        },
                        target: "Live",
                      };
                    },
                  }
                );
              },
            },
          },
          Live: {
            entry: (_, enq) => {
              enq.raise(
                { type: "PingDue" },
                { delay: PING_INTERVAL_MS, id: TIMERS.ping }
              );
              enq.raise(
                { type: "Silent" },
                { delay: SILENCE_LIMIT_MS, id: TIMERS.silence }
              );
            },
            exit: ({ context }, enq) => {
              enq.cancel(TIMERS.ping);
              enq.cancel(TIMERS.silence);

              for (const timer of answerTimers(context.owed)) {
                enq.cancel(timer);
              }

              return { context: { owed: NOTHING_OWED } };
            },
            on: {
              Batch: ({ context, event }, enq) => {
                const fit = fitBatch(
                  appliedSeqOf(context.applied),
                  event.from,
                  event.to,
                  event.events.length
                );

                const heard = () => {
                  enq.cancel(TIMERS.silence);
                  enq.raise(
                    { type: "Silent" },
                    { delay: SILENCE_LIMIT_MS, id: TIMERS.silence }
                  );
                };

                return BatchFits.$match(fit, {
                  Fresh: ({ skip }) => {
                    heard();
                    enq.emit({
                      activity: event.events.slice(skip).map((applied, index) =>
                        Activities.Applied({
                          event: applied,
                          seq: seqAt(event.from + skip + index),
                        })
                      ),
                      type: "Applied",
                    });

                    return {
                      context: {
                        applied: Option.some(event.to),
                        view: Option.some(event.view),
                      },
                    };
                  },
                  Gap: () => dropped("Gap"),
                  Malformed: () => dropped("Malformed"),
                  Stale: () => {
                    heard();

                    return {};
                  },
                });
              },
              CommandSent: ({ context, event }, enq) => {
                const owedNow =
                  context.pending.some((entry) => entry.id === event.id) &&
                  !context.owed.replies.includes(event.id);

                if (!owedNow) {
                  return {};
                }

                enq.raise(
                  { id: event.id, type: "ReplyLate" },
                  { delay: ANSWER_LIMIT_MS, id: replyDeadline(event.id) }
                );

                return {
                  context: {
                    owed: {
                      ...context.owed,
                      replies: [...context.owed.replies, event.id],
                    },
                  },
                };
              },
              Issue: ({ context, event }, enq) => {
                enq(
                  transmitFrame,
                  context.link,
                  Frames.Command.make({ command: event.command, id: event.id })
                );

                return {
                  context: {
                    pending: [
                      ...context.pending,
                      { command: event.command, id: event.id, sent: true },
                    ],
                  },
                };
              },
              Overdue: ({ context, event }, enq) => {
                enq.cancel(event.deadline);

                const late =
                  deadlinesOwed(context.owed).includes(event.deadline) &&
                  !context.owed.overdue.includes(event.deadline);

                if (!late) {
                  return {};
                }

                if (context.owed.overdue.length === 0) {
                  enq.raise(
                    { type: "Unanswered" },
                    { delay: OVERDUE_GRACE_MS, id: TIMERS.overdue }
                  );
                }

                return {
                  context: {
                    owed: {
                      ...context.owed,
                      overdue: [...context.owed.overdue, event.deadline],
                    },
                  },
                };
              },
              PingDue: ({ context }, enq) => {
                enq(transmitFrame, context.link, Frames.Ping.make({}));
                enq.raise(
                  { type: "PingDue" },
                  { delay: PING_INTERVAL_MS, id: TIMERS.ping }
                );
              },
              PingSent: ({ context }, enq) => {
                const pingsSent = context.owed.pingsSent + 1;
                const deadline = pongDeadline(pingsSent);

                enq.raise(
                  { deadline, type: "Overdue" },
                  { delay: ANSWER_LIMIT_MS, id: deadline }
                );

                return { context: { owed: { ...context.owed, pingsSent } } };
              },
              Pong: ({ context }, enq) => {
                enq.cancel(TIMERS.silence);
                enq.raise(
                  { type: "Silent" },
                  { delay: SILENCE_LIMIT_MS, id: TIMERS.silence }
                );

                if (context.owed.pongsHeard >= context.owed.pingsSent) {
                  return {};
                }

                const pongsHeard = context.owed.pongsHeard + 1;
                const deadline = pongDeadline(pongsHeard);

                const owed = answered(
                  { ...context.owed, pongsHeard },
                  deadline
                );

                enq.cancel(deadline);

                if (owed.overdue.length === 0) {
                  enq.cancel(TIMERS.overdue);
                }

                return { context: { owed } };
              },
              Presence: ({ event }, enq) => {
                enq.cancel(TIMERS.silence);
                enq.raise(
                  { type: "Silent" },
                  { delay: SILENCE_LIMIT_MS, id: TIMERS.silence }
                );

                return { context: { presence: event.connected } };
              },
              Reply: ({ context, event }, enq) => {
                enq.cancel(TIMERS.silence);
                enq.raise(
                  { type: "Silent" },
                  { delay: SILENCE_LIMIT_MS, id: TIMERS.silence }
                );

                if (!context.pending.some((entry) => entry.id === event.id)) {
                  return {};
                }

                const deadline = replyDeadline(event.id);
                const owed = replyAnswered(context.owed, event.id);

                enq.cancel(deadline);

                if (owed.overdue.length === 0) {
                  enq.cancel(TIMERS.overdue);
                }

                enq.emit({
                  id: event.id,
                  result: event.result,
                  type: "Replied",
                });

                return {
                  context: {
                    owed,
                    pending: withoutCommand(context.pending, event.id),
                  },
                };
              },
              ReplyLate: ({ context, event }, enq) => {
                const deadline = replyDeadline(event.id);

                enq.cancel(deadline);

                const stillOwed =
                  context.owed.replies.includes(event.id) &&
                  !context.owed.late.includes(event.id);

                if (!stillOwed) {
                  return {};
                }

                if (context.owed.late.length === 0) {
                  enq(transmitFrame, context.link, Frames.Ping.make({}));
                }

                enq.raise(
                  { deadline, type: "Overdue" },
                  {
                    delay: REPLY_LAST_RESORT_MS - ANSWER_LIMIT_MS,
                    id: deadline,
                  }
                );

                return {
                  context: {
                    owed: {
                      ...context.owed,
                      late: [...context.owed.late, event.id],
                    },
                  },
                };
              },
              Silent: dropped("Silent"),
              Unanswered: dropped("Unanswered"),
              Wake: ({ context }, enq) => {
                enq(transmitFrame, context.link, Frames.Ping.make({}));
                enq.cancel(TIMERS.silence);
                enq.raise(
                  { type: "Silent" },
                  { delay: WAKE_PROBE_MS, id: TIMERS.silence }
                );
              },
            },
          },
        },
      },
      Refused: { type: "final" },
      Stopped: { type: "final" },
      Waiting: {
        entry: ({ context }) => ({
          context: { failures: context.failures + 1 },
        }),
        initial: "Drawing",
        on: { Wake: { target: "Online" } },
        states: {
          Drawing: {
            invoke: {
              input: ({ context }) => ({ attempt: context.failures - 1 }),
              src: "backoff",
            },
            on: {
              Drawn: ({ event }) => ({
                context: { retryDelayMs: event.delayMs },
                target: "Sleeping",
              }),
            },
          },
          Sleeping: {
            entry: ({ context }, enq) => {
              enq.raise(
                { type: "RetryDue" },
                { delay: context.retryDelayMs, id: TIMERS.retry }
              );
            },
            exit: (_, enq) => {
              enq.cancel(TIMERS.retry);
            },
            on: { RetryDue: { target: "#roomClient.Online" } },
          },
        },
      },
    },
  });
};

export type RoomClientMachine<T extends RoomTypes> = ReturnType<
  typeof roomClientMachine<T>
>;
