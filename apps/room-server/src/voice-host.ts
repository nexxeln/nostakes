import type * as cf from "@cloudflare/workers-types";
import {
  PlayerIdSchema,
  PulledTrackSchema,
  VoiceAskSchema,
  VoiceReplySchema,
} from "@nostakes/protocol";
import type {
  PlayerId,
  VoiceAsk,
  VoiceReply,
  VoiceRoster,
} from "@nostakes/protocol";
import { Data, Effect, Option, Schema } from "effect";

import type { VoiceAccess } from "./hosted-room.js";
import { measure } from "./measures.js";
import type { Measure } from "./measures.js";
import type { RealtimeFailed } from "./realtime-failed.js";
import type { RealtimeCalls } from "./realtime.js";

const decodePulledTrack = Schema.decodeUnknownOption(PulledTrackSchema);

const PublishedSchema = Schema.Struct({
  mid: Schema.String,
  name: Schema.String,
});

const VoiceSeatRowSchema = Schema.Struct({
  joinedAt: Schema.Finite,
  player: PlayerIdSchema,
  pulledMs: Schema.Finite,
  pulling: Schema.Int,
  session: Schema.String,
  since: Schema.Finite,
  talked: Schema.Boolean,
  track: Schema.OptionFromNullOr(PublishedSchema),
});

export type VoiceSeatRow = typeof VoiceSeatRowSchema.Type;

export const VoiceStateSchema = Schema.Struct({
  mutes: Schema.Array(PlayerIdSchema),
  seats: Schema.Array(VoiceSeatRowSchema),
});

export type VoiceState = typeof VoiceStateSchema.Type;

export const NO_VOICE: VoiceState = { mutes: [], seats: [] };

export interface VoiceStore {
  readonly load: () => VoiceState;
  readonly save: (state: VoiceState) => void;
}

const VoiceStateJson = Schema.fromJsonString(
  Schema.toCodecJson(VoiceStateSchema)
);

const decodeState = Schema.decodeUnknownOption(VoiceStateJson);

const encodeState = Schema.encodeSync(VoiceStateJson);

const VoiceRows = Schema.Array(Schema.Struct({ state: Schema.String }));

const decodeRows = Schema.decodeUnknownSync(VoiceRows);

const voiceTable = `create table if not exists voice (
   id integer primary key check (id = 1),
   state text not null
 )`;

export const sqliteVoiceStore = (
  storage: cf.DurableObjectStorage
): VoiceStore => ({
  load: () => {
    storage.sql.exec(voiceTable);

    return Option.fromUndefinedOr(
      decodeRows(storage.sql.exec("select state from voice").toArray())[0]
    ).pipe(
      Option.flatMap(({ state }) => decodeState(state)),
      Option.getOrElse(() => NO_VOICE)
    );
  },
  save: (state) => {
    storage.sql.exec(voiceTable);
    storage.sql.exec(
      "insert or replace into voice (id, state) values (1, ?)",
      encodeState(state)
    );
  },
});

export const memoryVoiceStore = (): VoiceStore => {
  let kept = NO_VOICE;

  return {
    load: () => kept,
    save: (state) => {
      kept = state;
    },
  };
};

export type VoiceOutcome = Data.TaggedEnum<{
  Replied: { readonly reply: VoiceReply };
  Refused: { readonly refusal: "VoiceRefused" | "VoiceUnavailable" };
}>;

export const VoiceOutcomes = Data.taggedEnum<VoiceOutcome>();

export interface VoiceRoom {
  readonly access: (player: PlayerId) => VoiceAccess;
  readonly moderator: (player: PlayerId) => boolean;
  readonly connected: () => readonly PlayerId[];
  readonly broadcast: (roster: VoiceRoster) => void;
}

export interface VoiceHostOptions {
  readonly store: VoiceStore;
  readonly realtime: Option.Option<RealtimeCalls>;
  readonly trackName: Effect.Effect<string>;
  readonly note: (measured: Measure) => void;
  readonly failed: (failure: RealtimeFailed) => Effect.Effect<void>;
}

const refused = (refusal: "VoiceRefused" | "VoiceUnavailable") =>
  VoiceOutcomes.Refused({ refusal });

const replied = (reply: VoiceReply) => VoiceOutcomes.Replied({ reply });

const accounted = (seat: VoiceSeatRow, at: number): VoiceSeatRow => ({
  ...seat,
  pulledMs: seat.pulledMs + seat.pulling * Math.max(0, at - seat.since),
  since: at,
});

export const voiceSessionMeasure = (seat: VoiceSeatRow, at: number) => {
  const final = accounted(seat, at);

  return measure("VoiceSession", {
    pulledSeconds: Math.round(final.pulledMs / 1000),
    seconds: Math.round(Math.max(0, at - seat.joinedAt) / 1000),
    talked: seat.talked ? 1 : 0,
  });
};

export const voiceHost = (options: VoiceHostOptions) => {
  let state = options.store.load();

  const seatOf = (player: PlayerId) =>
    Option.fromUndefinedOr(state.seats.find((seat) => seat.player === player));

  const muted = (player: PlayerId) => state.mutes.includes(player);

  const roster = (): VoiceRoster =>
    state.seats.map((seat) => ({
      muted: muted(seat.player),
      player: seat.player,
      talking: Option.isSome(seat.track),
    }));

  const keep = (next: VoiceState) => {
    state = next;
    options.store.save(next);
  };

  const withSeat = (seat: VoiceSeatRow) => {
    keep({
      ...state,
      seats: [
        ...state.seats.filter((kept) => kept.player !== seat.player),
        seat,
      ],
    });
  };

  const quietly = (effect: Effect.Effect<void, RealtimeFailed>) =>
    effect.pipe(
      Effect.catchTag("RealtimeFailed", options.failed),
      Effect.forkDetach({ startImmediately: true }),
      Effect.asVoid
    );

  const closeSession = (session: string) =>
    Option.match(options.realtime, {
      onNone: () => Effect.void,
      onSome: (realtime) =>
        quietly(
          realtime
            .openMids(session)
            .pipe(Effect.flatMap((mids) => realtime.closeTracks(session, mids)))
        ),
    });

  const closeTrack = (session: string, mid: string) =>
    Option.match(options.realtime, {
      onNone: () => Effect.void,
      onSome: (realtime) => quietly(realtime.closeTracks(session, [mid])),
    });

  const endSeats = (ended: readonly VoiceSeatRow[], at: number) =>
    Effect.gen(function* endVoiceSeats() {
      if (ended.length === 0) {
        return;
      }

      const gone = new Set(ended.map(({ player }) => player));

      keep({
        ...state,
        seats: state.seats.filter(({ player }) => !gone.has(player)),
      });

      for (const seat of ended) {
        options.note(voiceSessionMeasure(seat, at));
        yield* closeSession(seat.session);
      }
    });

  const reconcile = (room: VoiceRoom, at: number) =>
    Effect.gen(function* reconcileVoice() {
      if (state.seats.length === 0) {
        return;
      }

      const connected = room.connected();

      const ended = state.seats.filter(
        ({ player }) =>
          !connected.includes(player) || room.access(player) === "None"
      );

      const silenced = state.seats.filter(
        (seat) =>
          !ended.includes(seat) &&
          Option.isSome(seat.track) &&
          (room.access(seat.player) !== "Talk" || muted(seat.player))
      );

      if (ended.length === 0 && silenced.length === 0) {
        return;
      }

      yield* endSeats(ended, at);

      for (const seat of silenced) {
        withSeat({ ...seat, track: Option.none() });

        for (const { mid } of Option.toArray(seat.track)) {
          yield* closeTrack(seat.session, mid);
        }
      }

      room.broadcast(roster());
    });

  const join = (
    realtime: RealtimeCalls,
    room: VoiceRoom,
    player: PlayerId,
    at: number
  ) =>
    Effect.gen(function* joinVoice() {
      const session = yield* realtime.newSession;
      const iceServers = yield* realtime.iceServers;

      yield* endSeats(Option.toArray(seatOf(player)), at);

      if (room.access(player) === "None") {
        yield* closeSession(session);

        return refused("VoiceRefused");
      }

      withSeat({
        joinedAt: at,
        player,
        pulledMs: 0,
        pulling: 0,
        session,
        since: at,
        talked: false,
        track: Option.none(),
      });
      room.broadcast(roster());

      return replied(VoiceReplySchema.cases.Joined.make({ iceServers }));
    });

  const publish = (
    realtime: RealtimeCalls,
    room: VoiceRoom,
    seat: VoiceSeatRow,
    offer: string,
    mid: string
  ) =>
    Effect.gen(function* publishVoice() {
      if (room.access(seat.player) !== "Talk" || muted(seat.player)) {
        return refused("VoiceRefused");
      }

      const name = yield* options.trackName;

      const answer = yield* realtime.publish({
        mid,
        offer,
        session: seat.session,
        track: name,
      });

      for (const current of Option.toArray(seatOf(seat.player))) {
        for (const { mid: before } of Option.toArray(current.track)) {
          yield* closeTrack(current.session, before);
        }

        withSeat({
          ...current,
          talked: true,
          track: Option.some({ mid, name }),
        });
      }

      room.broadcast(roster());

      return replied(VoiceReplySchema.cases.Published.make({ answer }));
    });

  const pull = (
    realtime: RealtimeCalls,
    seat: VoiceSeatRow,
    players: readonly PlayerId[],
    at: number
  ) =>
    Effect.gen(function* pullVoice() {
      const sources = state.seats.flatMap((source) =>
        source.player !== seat.player && players.includes(source.player)
          ? Option.toArray(source.track).map((track) => ({
              player: source.player,
              session: source.session,
              track: track.name,
            }))
          : []
      );

      if (sources.length === 0) {
        return replied(
          VoiceReplySchema.cases.Pulled.make({
            offer: Option.none(),
            tracks: [],
          })
        );
      }

      const pulled = yield* realtime.pull(seat.session, sources);

      const tracks = pulled.tracks.flatMap(({ mid, track }) =>
        sources
          .filter((source) => source.track === track)
          .flatMap(({ player }) =>
            Option.toArray(decodePulledTrack({ mid, player }))
          )
      );

      for (const current of Option.toArray(seatOf(seat.player))) {
        const counted = accounted(current, at);

        withSeat({ ...counted, pulling: counted.pulling + tracks.length });
      }

      return replied(
        VoiceReplySchema.cases.Pulled.make({ offer: pulled.offer, tracks })
      );
    });

  const drop = (
    realtime: RealtimeCalls,
    seat: VoiceSeatRow,
    mids: readonly string[],
    at: number
  ) =>
    Effect.gen(function* dropVoice() {
      yield* realtime.closeTracks(seat.session, mids);

      for (const current of Option.toArray(seatOf(seat.player))) {
        const counted = accounted(current, at);

        withSeat({
          ...counted,
          pulling: Math.max(0, counted.pulling - mids.length),
        });
      }

      return replied(VoiceReplySchema.cases.Dropped.make({}));
    });

  const mute = (
    room: VoiceRoom,
    asker: PlayerId,
    target: PlayerId,
    silence: boolean,
    at: number
  ) =>
    Effect.gen(function* muteVoice() {
      if (!room.moderator(asker)) {
        return refused("VoiceRefused");
      }

      keep({
        ...state,
        mutes: [
          ...state.mutes.filter((player) => player !== target),
          ...(silence ? [target] : []),
        ],
      });

      yield* reconcile(room, at);
      room.broadcast(roster());

      return replied(VoiceReplySchema.cases.Muted.make({}));
    });

  const ask = (
    room: VoiceRoom,
    player: PlayerId,
    asked: VoiceAsk,
    at: number
  ): Effect.Effect<VoiceOutcome> =>
    Effect.gen(function* answerVoice() {
      if (Option.isNone(options.realtime)) {
        return refused("VoiceUnavailable");
      }

      const realtime = options.realtime.value;

      if (
        room.access(player) === "None" ||
        !room.connected().includes(player)
      ) {
        return refused("VoiceRefused");
      }

      const seated = (
        answer: (
          seat: VoiceSeatRow
        ) => Effect.Effect<VoiceOutcome, RealtimeFailed>
      ) =>
        Option.match(seatOf(player), {
          onNone: () => Effect.succeed(refused("VoiceRefused")),
          onSome: answer,
        });

      return yield* VoiceAskSchema.match(asked, {
        Answer: ({ answer }) =>
          seated((seat) =>
            realtime
              .renegotiate(seat.session, answer)
              .pipe(
                Effect.as(replied(VoiceReplySchema.cases.Answered.make({})))
              )
          ),
        Drop: ({ mids }) => seated((seat) => drop(realtime, seat, mids, at)),
        Join: () => join(realtime, room, player, at),
        Leave: () =>
          seated((seat) =>
            endSeats([seat], at).pipe(
              Effect.andThen(
                Effect.sync(() => {
                  room.broadcast(roster());

                  return replied(VoiceReplySchema.cases.Left.make({}));
                })
              )
            )
          ),
        Mute: (muting) => mute(room, player, muting.player, muting.muted, at),
        Publish: ({ mid, offer }) =>
          seated((seat) => publish(realtime, room, seat, offer, mid)),
        Pull: ({ players }) =>
          seated((seat) => pull(realtime, seat, players, at)),
      });
    }).pipe(
      Effect.catchTag("RealtimeFailed", (failure) =>
        options.failed(failure).pipe(Effect.as(refused("VoiceUnavailable")))
      )
    );

  return { ask, reconcile, roster, state: () => state };
};

export type VoiceHost = ReturnType<typeof voiceHost>;
