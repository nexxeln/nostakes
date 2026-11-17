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
import { Duration, Effect, Option, Schema, Stream } from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

import type { PullPlan } from "../../features/voice.js";
import { VoiceFailed } from "./voice-failed.js";
import type { VoiceTrouble } from "./voice-failed.js";

export const OPUS_MAX_BITRATE = 32_000;

export const SPEAKING_LEVEL = 0.02;

export const LEVEL_POLL_MS = 250;

export const MIC_WAIT_MS = 20_000;

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

export const microphone = Effect.tryPromise({
  catch: () => failed("MicBlocked", "Microphone"),
  try: () =>
    globalThis.navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: true,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    }),
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

export const openSession = (
  pass: RoomPass,
  mic: Option.Option<MediaStreamTrack>,
  open: boolean
) =>
  Effect.gen(function* openVoiceSession() {
    const joined = yield* askVoice(pass, ASK.Join.make({}));

    const iceServers = VoiceReplySchema.guards.Joined(joined)
      ? joined.iceServers.map(iceServerOf)
      : [];

    const peer = new RTCPeerConnection({
      bundlePolicy: "max-bundle",
      iceServers,
    });

    const session: VoiceSession = {
      mic,
      pass,
      peer,
      playing: new Map(),
      pulled: new Map(),
    };

    peer.addEventListener("track", (event) => {
      const mid = event.transceiver.mid ?? "";
      const audio = new Audio();

      audio.autoplay = true;
      audio.srcObject = new MediaStream([event.track]);
      session.playing.set(mid, audio);
    });

    for (const track of Option.toArray(mic)) {
      track.enabled = open;
      yield* publish(pass, peer, track);
    }

    return session;
  });

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

    for (const player of plan.drop) {
      const mid = session.pulled.get(player);

      session.pulled.delete(player);

      for (const audio of Option.toArray(
        Option.fromUndefinedOr(
          mid === undefined ? undefined : session.playing.get(mid)
        )
      )) {
        audio.pause();
        audio.srcObject = null;
      }
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

export const closeLocally = (session: VoiceSession) => {
  for (const track of Option.toArray(session.mic)) {
    track.stop();
  }

  for (const audio of session.playing.values()) {
    audio.pause();
    audio.srcObject = null;
  }

  session.peer.close();
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
  | { readonly type: "Speaking"; readonly players: readonly PlayerId[] }
  | { readonly type: "Dropped" };

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
      Stream.changesWith(
        (before, after) => before.join(" ") === after.join(" ")
      ),
      Stream.map((players): PeerNews => ({ players, type: "Speaking" }))
    )
  );
