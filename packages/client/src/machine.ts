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
  CONNECT_TIMEOUT_MS,
  GREETING_TIMEOUT_MS,
  PING_INTERVAL_MS,
  SILENCE_LIMIT_MS,
  WAKE_PROBE_MS,
} from "./timing.js";

export const TIMERS = {
  connect: "connect",
  greeting: "greeting",
  ping: "ping",
  retry: "retry",
  silence: "silence",
} as const;

export const PING_TIMER = TIMERS.ping;

export const SILENCE_TIMER = TIMERS.silence;

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
        Drawn: types<{ readonly delayMs: number }>(),
        Garbled: NoPayload,
        Issue: types<{
          readonly id: CommandId;
          readonly command: T["Command"];
        }>(),
        Opened: types<ConnectionPayloads<T>["Opened"]>(),
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
        PingDue: NoPayload,
        RetryDue: NoPayload,
        Silent: NoPayload,
      },
    },
  }).createMachine({
    context: ({ input }) => ({
      applied: Option.none(),
      drop: Option.none(),
      failures: 0,
      link: Option.none(),
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
      Cancel: ({ context, event }) => ({
        context: { pending: withoutCommand(context.pending, event.id) },
      }),
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
            exit: (_, enq) => {
              enq.cancel(TIMERS.ping);
              enq.cancel(TIMERS.silence);
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
              PingDue: ({ context }, enq) => {
                enq(transmitFrame, context.link, Frames.Ping.make({}));
                enq.raise(
                  { type: "PingDue" },
                  { delay: PING_INTERVAL_MS, id: TIMERS.ping }
                );
              },
              Pong: (_, enq) => {
                enq.cancel(TIMERS.silence);
                enq.raise(
                  { type: "Silent" },
                  { delay: SILENCE_LIMIT_MS, id: TIMERS.silence }
                );
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

                enq.emit({
                  id: event.id,
                  result: event.result,
                  type: "Replied",
                });

                return {
                  context: {
                    pending: withoutCommand(context.pending, event.id),
                  },
                };
              },
              Silent: dropped("Silent"),
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
