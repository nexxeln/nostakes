import type { PlayerId, RoomPass, VoiceRoster } from "@nostakes/protocol";
import { createEffectEventStreamLogic, setupEffect } from "@xstate/effect";
import { Effect, Option, Stream } from "effect";
import { types } from "xstate";

import { inVoice, pullPlan } from "../../features/voice.js";
import type { PullPlan } from "../../features/voice.js";
import {
  closeLocally,
  leave,
  microphone,
  openSession,
  peerNews,
  setMic,
  syncPulls,
} from "./session.js";
import type { VoiceSession } from "./session.js";
import type { VoiceFailed, VoiceTrouble } from "./voice-failed.js";

export const VOICE_TIMERS = { retry: "retry" } as const;

export const RETRY_FIRST_MS = 1000;

export const RETRY_CAP_MS = 30_000;

export const UNAVAILABLE_RETRY_MS = 30_000;

export const retryDelayMs = (failures: number) =>
  Math.min(RETRY_CAP_MS, RETRY_FIRST_MS * 2 ** Math.max(0, failures - 1));

export interface VoiceInput {
  readonly pass: RoomPass;
  readonly talk: boolean;
  readonly micOpen: boolean;
  readonly roster: VoiceRoster;
}

export interface VoiceContext extends VoiceInput {
  readonly session: Option.Option<VoiceSession>;
  readonly micBlocked: boolean;
  readonly speaking: readonly PlayerId[];
  readonly failures: number;
  readonly retryInMs: number;
}

interface OpenInput {
  readonly pass: RoomPass;
  readonly talk: boolean;
  readonly micOpen: boolean;
}

type OpenNews =
  | { readonly type: "MicBlocked" }
  | { readonly type: "Opened"; readonly session: VoiceSession }
  | { readonly type: "OpenFailed"; readonly trouble: VoiceTrouble };

const openFailed = (failure: VoiceFailed): OpenNews => ({
  trouble: failure.trouble,
  type: "OpenFailed",
});

const opened = (input: OpenInput): Stream.Stream<OpenNews> =>
  Stream.unwrap(
    Effect.gen(function* openVoice() {
      const mic = input.talk
        ? yield* microphone.pipe(Effect.option, Effect.map(Option.flatten))
        : Option.none<MediaStreamTrack>();

      const blocked: readonly OpenNews[] =
        input.talk && Option.isNone(mic) ? [{ type: "MicBlocked" }] : [];

      const outcome = yield* openSession(input.pass, mic, input.micOpen).pipe(
        Effect.map((session): OpenNews => ({ session, type: "Opened" })),
        Effect.catchTag("VoiceFailed", (failure) =>
          Effect.sync(() => {
            for (const track of Option.toArray(mic)) {
              track.stop();
            }

            return openFailed(failure);
          })
        )
      );

      return Stream.fromIterable([...blocked, outcome]);
    })
  );

interface SyncInput {
  readonly session: VoiceSession;
  readonly plan: PullPlan;
}

type SyncNews =
  | { readonly type: "Synced" }
  | { readonly type: "SyncFailed"; readonly trouble: VoiceTrouble };

const synced = (input: SyncInput): Stream.Stream<SyncNews> =>
  Stream.fromEffect(
    syncPulls(input.session, input.plan).pipe(
      Effect.as<SyncNews>({ type: "Synced" }),
      Effect.catchTag("VoiceFailed", (failure) =>
        Effect.succeed<SyncNews>({
          trouble: failure.trouble,
          type: "SyncFailed",
        })
      )
    )
  );

interface NewsInput {
  readonly session: VoiceSession;
  readonly you: PlayerId;
}

interface LeaveInput {
  readonly session: VoiceSession;
}

const left = (input: LeaveInput) =>
  Stream.fromEffect(
    leave(input.session).pipe(Effect.as({ type: "Left" as const }))
  );

const planOf = (context: VoiceContext, session: VoiceSession) =>
  pullPlan(context.roster, context.pass.player, [...session.pulled.keys()]);

const hasWork = (plan: PullPlan) =>
  plan.pull.length > 0 || plan.drop.length > 0;

const afterTrouble = (trouble: VoiceTrouble, failures: number) => {
  if (trouble === "Refused") {
    return { target: "#voice.Refused" } as const;
  }

  if (trouble === "Unavailable") {
    return {
      context: { retryInMs: UNAVAILABLE_RETRY_MS },
      target: "#voice.Waiting",
    } as const;
  }

  return {
    context: { failures: failures + 1, retryInMs: retryDelayMs(failures + 1) },
    target: "#voice.Waiting",
  } as const;
};

const closeHeld = (session: Option.Option<VoiceSession>) => {
  for (const held of Option.toArray(session)) {
    closeLocally(held);
  }
};

export const voiceMachine = () => {
  const open = createEffectEventStreamLogic({
    schemas: { input: types<OpenInput>() },
    stream: ({ input }) => opened(input),
  });

  const sync = createEffectEventStreamLogic({
    schemas: { input: types<SyncInput>() },
    stream: ({ input }) => synced(input),
  });

  const news = createEffectEventStreamLogic({
    schemas: { input: types<NewsInput>() },
    stream: ({ input }) => peerNews(input.session, input.you),
  });

  const leaving = createEffectEventStreamLogic({
    schemas: { input: types<LeaveInput>() },
    stream: ({ input }) => left(input),
  });

  return setupEffect({
    actors: { leaving, news, open, sync },
    schemas: {
      context: types<VoiceContext>(),
      events: {
        Dropped: types<{ readonly type: "Dropped" }>(),
        Left: types<{ readonly type: "Left" }>(),
        Mic: types<{ readonly open: boolean }>(),
        MicBlocked: types<{ readonly type: "MicBlocked" }>(),
        OpenFailed: types<{ readonly trouble: VoiceTrouble }>(),
        Opened: types<{ readonly session: VoiceSession }>(),
        Roster: types<{ readonly roster: VoiceRoster }>(),
        Speaking: types<{ readonly players: readonly PlayerId[] }>(),
        Stop: types<{ readonly type: "Stop" }>(),
        SyncDue: types<{ readonly type: "SyncDue" }>(),
        SyncFailed: types<{ readonly trouble: VoiceTrouble }>(),
        Synced: types<{ readonly type: "Synced" }>(),
        Wake: types<{ readonly type: "Wake" }>(),
      },
      input: types<VoiceInput>(),
      internalEvents: {
        RetryDue: types<{ readonly type: "RetryDue" }>(),
      },
    },
  }).createMachine({
    context: ({ input }) => ({
      ...input,
      failures: 0,
      micBlocked: false,
      retryInMs: 0,
      session: Option.none(),
      speaking: [],
    }),
    id: "voice",
    initial: "Opening",
    on: {
      Mic: ({ event }) => ({ context: { micOpen: event.open } }),
      Roster: ({ event }) => ({ context: { roster: event.roster } }),
      Stop: ({ context }) =>
        Option.isSome(context.session)
          ? { target: ".Leaving" }
          : { target: ".Stopped" },
    },
    states: {
      Leaving: {
        invoke: {
          input: ({ context }) => ({
            session: Option.getOrThrow(context.session),
          }),
          onDone: { target: "Stopped" },
          onError: { target: "Stopped" },
          src: "leaving",
        },
        on: { Left: { target: "Stopped" }, Stop: {} },
      },
      Live: {
        exit: () => ({ context: { speaking: [] } }),
        initial: "Idle",
        invoke: {
          input: ({ context }) => ({
            session: Option.getOrThrow(context.session),
            you: context.pass.player,
          }),
          src: "news",
        },
        on: {
          Dropped: ({ context }) => afterTrouble("Broken", context.failures),
          Mic: ({ context, event }, enq) => {
            for (const session of Option.toArray(context.session)) {
              enq(setMic, session, event.open);
            }

            return { context: { micOpen: event.open } };
          },
          Roster: ({ context, event }, enq) => {
            if (
              inVoice(context.roster, context.pass.player) &&
              !inVoice(event.roster, context.pass.player)
            ) {
              return {
                ...afterTrouble("Broken", context.failures),
                context: {
                  ...afterTrouble("Broken", context.failures).context,
                  roster: event.roster,
                },
              };
            }

            enq.raise({ type: "SyncDue" });

            return { context: { roster: event.roster } };
          },
          Speaking: ({ event }) => ({ context: { speaking: event.players } }),
        },
        states: {
          Idle: {
            entry: ({ context }, enq) => {
              for (const session of Option.toArray(context.session)) {
                if (hasWork(planOf(context, session))) {
                  enq.raise({ type: "SyncDue" });
                }
              }
            },
            on: {
              SyncDue: ({ context }) =>
                Option.exists(context.session, (session) =>
                  hasWork(planOf(context, session))
                )
                  ? { target: "Syncing" }
                  : {},
            },
          },
          Syncing: {
            invoke: {
              input: ({ context }) => {
                const session = Option.getOrThrow(context.session);

                return { plan: planOf(context, session), session };
              },
              src: "sync",
            },
            on: {
              SyncFailed: ({ context, event }) =>
                afterTrouble(event.trouble, context.failures),
              Synced: { target: "Idle" },
            },
          },
        },
      },
      Opening: {
        invoke: {
          input: ({ context }) => ({
            micOpen: context.micOpen,
            pass: context.pass,
            talk: context.talk,
          }),
          src: "open",
        },
        on: {
          MicBlocked: () => ({ context: { micBlocked: true } }),
          OpenFailed: ({ context, event }) =>
            afterTrouble(event.trouble, context.failures),
          Opened: ({ event }) => ({
            context: { failures: 0, session: Option.some(event.session) },
            target: "Live",
          }),
        },
      },
      Refused: {
        entry: ({ context }, enq) => {
          enq(closeHeld, context.session);

          return { context: { session: Option.none() } };
        },
        on: { Wake: { target: "Opening" } },
      },
      Stopped: {
        entry: () => ({ context: { session: Option.none() } }),
        type: "final",
      },
      Waiting: {
        entry: ({ context }, enq) => {
          enq(closeHeld, context.session);
          enq.raise(
            { type: "RetryDue" },
            { delay: context.retryInMs, id: VOICE_TIMERS.retry }
          );

          return { context: { session: Option.none() } };
        },
        exit: (_, enq) => {
          enq.cancel(VOICE_TIMERS.retry);
        },
        on: {
          RetryDue: { target: "Opening" },
          Wake: { target: "Opening" },
        },
      },
    },
  });
};

export type VoiceMachine = ReturnType<typeof voiceMachine>;
