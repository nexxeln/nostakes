import type { IceServer } from "@nostakes/protocol";
import { IceServerSchema } from "@nostakes/protocol";
import {
  Array as Arr,
  Config,
  Context,
  Duration,
  Effect,
  Layer,
  Option,
  Redacted,
  Schema,
} from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import { RealtimeFailed } from "./realtime-failed.js";
import type { RealtimeStep } from "./realtime-failed.js";

export const REALTIME_API = "https://rtc.live.cloudflare.com/v1";

export const REALTIME_APP_ID = "REALTIME_APP_ID";

export const REALTIME_APP_SECRET = "REALTIME_APP_SECRET";

export const TURN_KEY_ID = "TURN_KEY_ID";

export const TURN_KEY_SECRET = "TURN_KEY_SECRET";

export const REALTIME_TIMEOUT_MS = 8000;

export const TURN_CREDENTIAL_SECONDS = 4 * 60 * 60;

export const CLOUDFLARE_STUN: IceServer = {
  urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"],
};

export interface RemoteTrack {
  readonly session: string;
  readonly track: string;
}

export interface PulledTrackAt {
  readonly mid: string;
  readonly track: string;
}

export interface Pulled {
  readonly offer: Option.Option<string>;
  readonly tracks: readonly PulledTrackAt[];
}

export interface RealtimeCalls {
  readonly newSession: Effect.Effect<string, RealtimeFailed>;
  readonly publish: (input: {
    readonly session: string;
    readonly offer: string;
    readonly mid: string;
    readonly track: string;
  }) => Effect.Effect<string, RealtimeFailed>;
  readonly pull: (
    session: string,
    remotes: readonly RemoteTrack[]
  ) => Effect.Effect<Pulled, RealtimeFailed>;
  readonly renegotiate: (
    session: string,
    answer: string
  ) => Effect.Effect<void, RealtimeFailed>;
  readonly closeTracks: (
    session: string,
    mids: readonly string[]
  ) => Effect.Effect<void, RealtimeFailed>;
  readonly openMids: (
    session: string
  ) => Effect.Effect<readonly string[], RealtimeFailed>;
  readonly iceServers: Effect.Effect<readonly IceServer[], RealtimeFailed>;
}

export class Realtime extends Context.Service<
  Realtime,
  Option.Option<RealtimeCalls>
>()("@nostakes/room-server/Realtime") {}

export const noRealtime = Layer.succeed(Realtime, Option.none());

const SessionDescriptionSchema = Schema.Struct({
  sdp: Schema.String,
  type: Schema.Literals(["offer", "answer"]),
});

const Failure = {
  errorCode: Schema.optionalKey(Schema.String),
};

const NewSessionSchema = Schema.Struct({
  ...Failure,
  sessionId: Schema.String,
});

const TrackResultSchema = Schema.Struct({
  ...Failure,
  mid: Schema.optionalKey(Schema.String),
  trackName: Schema.optionalKey(Schema.String),
});

const TracksSchema = Schema.Struct({
  ...Failure,
  requiresImmediateRenegotiation: Schema.optionalKey(Schema.Boolean),
  sessionDescription: Schema.optionalKey(SessionDescriptionSchema),
  tracks: Schema.optionalKey(Schema.Array(TrackResultSchema)),
});

const PlainSchema = Schema.Struct(Failure);

const SessionStateSchema = Schema.Struct({
  ...Failure,
  tracks: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        mid: Schema.optionalKey(Schema.String),
        status: Schema.optionalKey(Schema.String),
      })
    )
  ),
});

const IceServersSchema = Schema.Struct({
  iceServers: Schema.Array(
    Schema.Struct({
      credential: Schema.optionalKey(Schema.String),
      urls: Schema.Union([Schema.String, Schema.Array(Schema.String)]),
      username: Schema.optionalKey(Schema.String),
    })
  ),
});

export interface RealtimeCredentials {
  readonly appId: string;
  readonly appSecret: Redacted.Redacted;
  readonly turn: Option.Option<{
    readonly keyId: string;
    readonly key: Redacted.Redacted;
  }>;
}

export const realtimeConfig = Config.all({
  appId: Config.String(REALTIME_APP_ID),
  appSecret: Config.Redacted(REALTIME_APP_SECRET),
  turn: Config.option(
    Config.all({
      key: Config.Redacted(TURN_KEY_SECRET),
      keyId: Config.String(TURN_KEY_ID),
    })
  ),
}).pipe(
  Config.option,
  Config.map(Option.filter(({ appId }) => appId.length > 0))
);

const failed = (step: RealtimeStep, code: string) =>
  new RealtimeFailed({ code, step });

const turnServers = (
  served: typeof IceServersSchema.Type
): readonly IceServer[] =>
  served.iceServers.flatMap((server) =>
    Schema.decodeOption(IceServerSchema)({
      ...server,
      urls: Arr.ensure(server.urls),
    }).pipe(Option.toArray)
  );

const refusedBy = <A extends { readonly errorCode?: string }>(
  step: RealtimeStep,
  served: A
) =>
  served.errorCode === undefined
    ? Effect.succeed(served)
    : Effect.fail(failed(step, served.errorCode.slice(0, 64)));

const sessionDescription = (sdp: string, type: "offer" | "answer") => ({
  sdp,
  type,
});

export const realtimeCalls = (
  client: HttpClient.HttpClient,
  credentials: RealtimeCredentials
): RealtimeCalls => {
  const app = `${REALTIME_API}/apps/${credentials.appId}`;

  const call = <S extends Schema.Top & { readonly DecodingServices: never }>(
    step: RealtimeStep,
    request: HttpClientRequest.HttpClientRequest,
    answer: S,
    bearer: Redacted.Redacted = credentials.appSecret
  ) =>
    client
      .execute(
        request.pipe(
          HttpClientRequest.bearerToken(Redacted.value(bearer)),
          HttpClientRequest.acceptJson
        )
      )
      .pipe(
        Effect.timeout(Duration.millis(REALTIME_TIMEOUT_MS)),
        Effect.mapError(() => failed(step, "Unreachable")),
        Effect.flatMap((response) =>
          response.status >= 200 && response.status < 300
            ? HttpClientResponse.schemaBodyJson(answer)(response).pipe(
                Effect.mapError(() => failed(step, "Garbled"))
              )
            : Effect.fail(failed(step, `Status${response.status}`))
        )
      );

  return {
    closeTracks: (session, mids) =>
      mids.length === 0
        ? Effect.void
        : call(
            "Close",
            HttpClientRequest.put(
              `${app}/sessions/${session}/tracks/close`
            ).pipe(
              HttpClientRequest.bodyJsonUnsafe({
                force: true,
                tracks: mids.map((mid) => ({ mid })),
              })
            ),
            PlainSchema
          ).pipe(Effect.asVoid),
    iceServers: Option.match(credentials.turn, {
      onNone: () => Effect.succeed([CLOUDFLARE_STUN]),
      onSome: ({ key, keyId }) =>
        call(
          "IceServers",
          HttpClientRequest.post(
            `${REALTIME_API}/turn/keys/${keyId}/credentials/generate-ice-servers`
          ).pipe(
            HttpClientRequest.bodyJsonUnsafe({ ttl: TURN_CREDENTIAL_SECONDS })
          ),
          IceServersSchema,
          key
        ).pipe(Effect.map(turnServers)),
    }),
    newSession: call(
      "NewSession",
      HttpClientRequest.post(`${app}/sessions/new`),
      NewSessionSchema
    ).pipe(
      Effect.flatMap((served) => refusedBy("NewSession", served)),
      Effect.map(({ sessionId }) => sessionId)
    ),
    openMids: (session) =>
      call(
        "ReadSession",
        HttpClientRequest.get(`${app}/sessions/${session}`),
        SessionStateSchema
      ).pipe(
        Effect.flatMap((served) => refusedBy("ReadSession", served)),
        Effect.map(({ tracks = [] }) =>
          tracks.flatMap(({ mid, status }) =>
            mid === undefined || status === "inactive" ? [] : [mid]
          )
        )
      ),
    publish: ({ mid, offer, session, track }) =>
      call(
        "Publish",
        HttpClientRequest.post(`${app}/sessions/${session}/tracks/new`).pipe(
          HttpClientRequest.bodyJsonUnsafe({
            sessionDescription: sessionDescription(offer, "offer"),
            tracks: [{ location: "local", mid, trackName: track }],
          })
        ),
        TracksSchema
      ).pipe(
        Effect.flatMap((served) => refusedBy("Publish", served)),
        Effect.flatMap(({ sessionDescription: answer, tracks = [] }) => {
          const refused = tracks.find(
            (result) => result.errorCode !== undefined
          );

          if (refused?.errorCode !== undefined) {
            return Effect.fail(failed("Publish", refused.errorCode));
          }

          return answer?.type === "answer"
            ? Effect.succeed(answer.sdp)
            : Effect.fail(failed("Publish", "NoAnswer"));
        })
      ),
    pull: (session, remotes) =>
      call(
        "Pull",
        HttpClientRequest.post(`${app}/sessions/${session}/tracks/new`).pipe(
          HttpClientRequest.bodyJsonUnsafe({
            tracks: remotes.map((remote) => ({
              location: "remote",
              sessionId: remote.session,
              trackName: remote.track,
            })),
          })
        ),
        TracksSchema
      ).pipe(
        Effect.flatMap((served) => refusedBy("Pull", served)),
        Effect.map((served) => ({
          offer: Option.fromUndefinedOr(served.sessionDescription).pipe(
            Option.filter(
              (described) =>
                described.type === "offer" &&
                served.requiresImmediateRenegotiation !== false
            ),
            Option.map(({ sdp }) => sdp)
          ),
          tracks: (served.tracks ?? []).flatMap((result) =>
            result.errorCode === undefined &&
            result.mid !== undefined &&
            result.trackName !== undefined
              ? [{ mid: result.mid, track: result.trackName }]
              : []
          ),
        }))
      ),
    renegotiate: (session, answer) =>
      call(
        "Renegotiate",
        HttpClientRequest.put(`${app}/sessions/${session}/renegotiate`).pipe(
          HttpClientRequest.bodyJsonUnsafe({
            sessionDescription: sessionDescription(answer, "answer"),
          })
        ),
        PlainSchema
      ).pipe(
        Effect.flatMap((served) => refusedBy("Renegotiate", served)),
        Effect.asVoid
      ),
  };
};

export const liveRealtime = Layer.effect(
  Realtime,
  Effect.gen(function* makeLiveRealtime() {
    const client = yield* HttpClient.HttpClient;

    const credentials = yield* realtimeConfig.pipe(
      Effect.orElseSucceed(() => Option.none<RealtimeCredentials>())
    );

    return credentials.pipe(
      Option.map((found) => realtimeCalls(client, found))
    );
  })
).pipe(Layer.provide(FetchHttpClient.layer));
