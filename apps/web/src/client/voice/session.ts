import {
  MidSchema,
  VoiceAskSchema,
  VoiceRefusalSchema,
  VoiceReplySchema,
  VoiceRequestSchema,
} from "@nostakes/protocol";
import type {
  IceServer,
  PlayerId,
  RoomPass,
  VoiceAsk,
  VoiceReply,
} from "@nostakes/protocol";
import { Duration, Effect, Exit, Option, Schema, Stream } from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

import type { PullPlan } from "../../features/voice.js";
import { playOnSpeaker, releaseSpeaker, speakerBlocked } from "./speakers.js";
import { VoiceFailed } from "./voice-failed.js";
import type { VoiceTrouble } from "./voice-failed.js";

export const OPUS_MAX_BITRATE = 32_000;

export const SPEAKING_LEVEL = 0.02;

export const LEVEL_POLL_MS = 250;

export const MIC_WAIT_MS = 20_000;

export const ASK_WAIT_MS = 20_000;

export interface VoiceSession {
  readonly pass: RoomPass;
  readonly peer: RTCPeerConnection;
  readonly mic: Option.Option<MediaStreamTrack>;
  readonly pulled: Map<PlayerId, string>;
  readonly playing: Map<string, HTMLAudioElement>;
}

const ASK = VoiceAskSchema.cases;

const decodeReply = Schema.decodeUnknownEffect(VoiceReplySchema);

const decodeRefusal = Schema.decodeUnknownOption(VoiceRefusalSchema);

const encodeRequest = Schema.encodeSync(VoiceRequestSchema);

const failed = (trouble: VoiceTrouble, step: string) =>
  new VoiceFailed({ step, trouble });

const troubleOf = (
  status: number,
  json: Schema.Json,
  detail: string
): VoiceTrouble => {
  if (detail.includes("Status410")) {
    return "Expired";
  }

  return Option.match(decodeRefusal(json), {
    onNone: (): VoiceTrouble => (status === 403 ? "Refused" : "Broken"),
    onSome: ({ refusal }): VoiceTrouble =>
      refusal === "VoiceRefused" ? "Refused" : "Unavailable",
  });
};

export const askVoice = (pass: RoomPass, ask: VoiceAsk) =>
  HttpClientRequest.post(
    new URL(`/rooms/${pass.code}/voice`, globalThis.location.href)
  ).pipe(
    HttpClientRequest.bodyJsonUnsafe(encodeRequest({ ask, token: pass.token })),
    HttpClient.execute,
    Effect.mapError(() => failed("Broken", ask._tag)),
    Effect.flatMap((response) =>
      response.json.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.Json)),
        Effect.orElseSucceed((): Schema.Json => null),
        Effect.flatMap((json) =>
          response.status === 200
            ? decodeReply(json).pipe(
                Effect.mapError(() => failed("Broken", ask._tag))
              )
            : Effect.fail(
                failed(
                  troubleOf(
                    response.status,
                    json,
                    response.headers["x-voice-detail"] ?? ""
                  ),
                  ask._tag
                )
              )
        )
      )
    ),
    Effect.timeoutOrElse({
      duration: Duration.millis(ASK_WAIT_MS),
      orElse: () => Effect.fail(failed("Broken", ask._tag)),
    }),
    Effect.provide(FetchHttpClient.layer)
  );

const answerOf = (reply: VoiceReply, step: string) =>
  VoiceReplySchema.guards.Published(reply)
    ? Effect.succeed(reply.answer)
    : Effect.fail(failed("Broken", step));

const promised = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: () => failed("Broken", step),
    try: run,
  });

const stopAll = (stream: MediaStream) => {
  for (const track of stream.getTracks()) {
    track.stop();
  }
};

const stoppedWhenAnswered = (asked: Promise<MediaStream>) => {
  Effect.runFork(
    Effect.tryPromise(() => asked).pipe(Effect.map(stopAll), Effect.ignore)
  );
};

export const microphone = Effect.tryPromise({
  catch: () => failed("MicBlocked", "Microphone"),
  try: (signal) => {
    const asked = globalThis.navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: true,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    signal.addEventListener("abort", () => {
      stoppedWhenAnswered(asked);
    });

    return asked;
  },
}).pipe(
  Effect.timeoutOrElse({
    duration: Duration.millis(MIC_WAIT_MS),
    orElse: () => Effect.fail(failed("MicBlocked", "Microphone")),
  }),
  Effect.map((stream) => Option.fromUndefinedOr(stream.getAudioTracks()[0]))
);

const leanOpus = (sdp: string) =>
  sdp.replaceAll(
    /a=fmtp:(?<payload>\d+) (?<params>[^\r\n]*useinbandfec=1[^\r\n]*)/gu,
    "a=fmtp:$<payload> $<params>;usedtx=1;stereo=0;sprop-stereo=0;maxaveragebitrate=32000"
  );

const publish = (
  pass: RoomPass,
  peer: RTCPeerConnection,
  track: MediaStreamTrack
) =>
  Effect.gen(function* publishMicrophone() {
    const sending = peer.addTransceiver(track, { direction: "sendonly" });
    const offer = yield* promised("Publish", () => peer.createOffer());
    const sdp = leanOpus(offer.sdp ?? "");

    yield* promised("Publish", () =>
      peer.setLocalDescription({ sdp, type: "offer" })
    );

    const mid = yield* Schema.decodeUnknownEffect(MidSchema)(
      sending.mid ?? ""
    ).pipe(Effect.mapError(() => failed("Broken", "Publish")));

    const answer = yield* askVoice(
      pass,
      ASK.Publish.make({ mid, offer: sdp })
    ).pipe(Effect.flatMap((reply) => answerOf(reply, "Publish")));

    yield* promised("Publish", () =>
      peer.setRemoteDescription({ sdp: answer, type: "answer" })
    );
    yield* promised("Publish", () =>
      sending.sender.setParameters({
        ...sending.sender.getParameters(),
        encodings: [{ maxBitrate: OPUS_MAX_BITRATE }],
      })
    ).pipe(Effect.ignore);
  });

const iceServerOf = (server: IceServer): RTCIceServer => {
  const urls = [...server.urls];

  return server.username === undefined || server.credential === undefined
    ? { urls }
    : { credential: server.credential, urls, username: server.username };
};

const stopPlaying = (session: VoiceSession, mid: string) => {
  for (const audio of Option.toArray(
    Option.fromUndefinedOr(session.playing.get(mid))
  )) {
    releaseSpeaker(audio);
  }

  session.playing.delete(mid);
};

const stopPulled = (session: VoiceSession, mid: string) => {
  stopPlaying(session, mid);

  for (const transceiver of session.peer.getTransceivers()) {
    if (transceiver.mid === mid) {
      transceiver.receiver.track.stop();

      if (
        session.peer.signalingState !== "closed" &&
        transceiver.currentDirection !== "stopped"
      ) {
        transceiver.stop();
      }
    }
  }
};

const sessionOn = (
  pass: RoomPass,
  mic: Option.Option<MediaStreamTrack>,
  joined: VoiceReply
): VoiceSession => {
  const iceServers = VoiceReplySchema.guards.Joined(joined)
    ? joined.iceServers.map(iceServerOf)
    : [];

  const session: VoiceSession = {
    mic,
    pass,
    peer: new RTCPeerConnection({ bundlePolicy: "max-bundle", iceServers }),
    playing: new Map(),
    pulled: new Map(),
  };

  session.peer.addEventListener("track", (event) => {
    const mid = event.transceiver.mid ?? "";

    stopPlaying(session, mid);
    session.playing.set(mid, playOnSpeaker(event.track));
  });

  return session;
};

export const openSession = (
  pass: RoomPass,
  mic: Option.Option<MediaStreamTrack>,
  open: boolean
) =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* openVoiceSession() {
      const joined = yield* askVoice(pass, ASK.Join.make({}));
      const session = sessionOn(pass, mic, joined);

      yield* restore(
        Effect.gen(function* publishMicrophone() {
          for (const track of Option.toArray(mic)) {
            track.enabled = open;
            yield* publish(pass, session.peer, track);
          }
        })
      ).pipe(
        Effect.onExit((exit) =>
          Exit.isSuccess(exit) ? Effect.void : leave(session)
        )
      );

      return session;
    })
  );

const playerOfMid = (session: VoiceSession, mid: string) =>
  Option.fromUndefinedOr(
    [...session.pulled].find(([, pulledMid]) => pulledMid === mid)?.[0]
  );

const pulledTracksOf = (reply: VoiceReply) =>
  VoiceReplySchema.guards.Pulled(reply)
    ? Effect.succeed(reply)
    : Effect.fail(failed("Broken", "Pull"));

const pullTracks = (session: VoiceSession, players: readonly PlayerId[]) =>
  Effect.gen(function* pullVoiceTracks() {
    const pulled = yield* askVoice(
      session.pass,
      ASK.Pull.make({ players })
    ).pipe(Effect.flatMap(pulledTracksOf));

    for (const { mid, player } of pulled.tracks) {
      session.pulled.set(player, mid);
    }

    for (const offer of Option.toArray(pulled.offer)) {
      yield* promised("Pull", () =>
        session.peer.setRemoteDescription({ sdp: offer, type: "offer" })
      );

      const answer = yield* promised("Pull", () => session.peer.createAnswer());

      yield* promised("Pull", () => session.peer.setLocalDescription(answer));
      yield* askVoice(
        session.pass,
        ASK.Answer.make({ answer: answer.sdp ?? "" })
      );
    }
  });

export const syncPulls = (session: VoiceSession, plan: PullPlan) =>
  Effect.gen(function* syncVoicePulls() {
    const dropped = plan.drop.flatMap((player) =>
      Option.toArray(Option.fromUndefinedOr(session.pulled.get(player)))
    );

    for (const mid of dropped) {
      stopPulled(session, mid);
    }

    for (const player of plan.drop) {
      session.pulled.delete(player);
    }

    if (dropped.length > 0) {
      const mids = yield* Effect.all(
        dropped.map((mid) =>
          Schema.decodeUnknownEffect(MidSchema)(mid).pipe(Effect.option)
        )
      );

      yield* askVoice(
        session.pass,
        ASK.Drop.make({ mids: mids.flatMap(Option.toArray) })
      ).pipe(Effect.ignore);
    }

    if (plan.pull.length > 0) {
      yield* pullTracks(session, plan.pull);
    }
  });

export const setMic = (session: VoiceSession, open: boolean) => {
  for (const track of Option.toArray(session.mic)) {
    track.enabled = open;
  }
};

export const closePeer = (session: VoiceSession) => {
  for (const mid of session.playing.keys()) {
    stopPlaying(session, mid);
  }

  session.pulled.clear();
  session.peer.close();
};

export const closeLocally = (session: VoiceSession) => {
  for (const track of Option.toArray(session.mic)) {
    track.stop();
  }

  closePeer(session);
};

export const leave = (session: VoiceSession) =>
  askVoice(session.pass, ASK.Leave.make({})).pipe(
    Effect.ignore,
    Effect.ensuring(
      Effect.sync(() => {
        closeLocally(session);
      })
    )
  );

const LevelReportSchema = Schema.Struct({
  audioLevel: Schema.optionalKey(Schema.Finite),
  kind: Schema.optionalKey(Schema.String),
  mid: Schema.optionalKey(Schema.String),
  type: Schema.String,
});

const decodeLevel = Schema.decodeUnknownOption(LevelReportSchema);

const levelsOf = (session: VoiceSession, you: PlayerId) =>
  promised("Levels", () => session.peer.getStats()).pipe(
    Effect.map((stats) => {
      const speaking: PlayerId[] = [];

      const reports = Array.from(stats.values(), (stat) =>
        decodeLevel(stat)
      ).flatMap((decoded) => Option.toArray(decoded));

      for (const report of reports) {
        const loud = (report.audioLevel ?? 0) >= SPEAKING_LEVEL;

        if (
          loud &&
          report.type === "media-source" &&
          report.kind === "audio" &&
          Option.exists(session.mic, (track) => track.enabled)
        ) {
          speaking.push(you);
        }

        if (loud && report.type === "inbound-rtp" && report.mid !== undefined) {
          speaking.push(...Option.toArray(playerOfMid(session, report.mid)));
        }
      }

      return [...new Set(speaking)].toSorted();
    })
  );

export type PeerNews =
  | {
      readonly type: "Heard";
      readonly players: readonly PlayerId[];
      readonly deaf: boolean;
    }
  | { readonly type: "Dropped" };

const deafIn = (session: VoiceSession) =>
  [...session.playing.values()].some(speakerBlocked);

const dropped: PeerNews = { type: "Dropped" };

export const peerNews = (session: VoiceSession, you: PlayerId) =>
  Stream.merge(
    Stream.fromEventListener(session.peer, "connectionstatechange").pipe(
      Stream.filter(
        () =>
          session.peer.connectionState === "failed" ||
          session.peer.connectionState === "closed"
      ),
      Stream.map(() => dropped),
      Stream.take(1)
    ),
    Stream.tick(Duration.millis(LEVEL_POLL_MS)).pipe(
      Stream.mapEffect(() =>
        levelsOf(session, you).pipe(Effect.orElseSucceed(() => []))
      ),
      Stream.map((players): PeerNews => ({
        deaf: deafIn(session),
        players,
        type: "Heard",
      })),
      Stream.changesWith(
        (before, after) =>
          before.type === "Heard" &&
          after.type === "Heard" &&
          before.deaf === after.deaf &&
          before.players.join(" ") === after.players.join(" ")
      )
    )
  );
