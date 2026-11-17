import { Effect, Layer, Option, Schema } from "effect";

import { RealtimeFailed } from "../../src/realtime-failed.js";
import { CLOUDFLARE_STUN, Realtime } from "../../src/realtime.js";
import type { RealtimeCalls } from "../../src/realtime.js";

export const FakeTrackSchema = Schema.Struct({
  mid: Schema.String,
  name: Schema.String,
  open: Schema.Boolean,
  pulledFrom: Schema.OptionFromNullOr(Schema.String),
});

export const FakeSessionSchema = Schema.Struct({
  id: Schema.String,
  tracks: Schema.Array(FakeTrackSchema),
});

export const FakeSfuSchema = Schema.Array(FakeSessionSchema);

export type FakeSession = typeof FakeSessionSchema.Type;

export const FAKE_ANSWER = "v=0 fake answer";

export const FAKE_OFFER = "v=0 fake offer";

export const FAKE_SESSION_MARK = "sfu-session-mark";

const unknownSession = (
  step: "Publish" | "Pull" | "Renegotiate" | "Close" | "ReadSession"
) => new RealtimeFailed({ code: "SessionNotFound", step });

export const fakeSfu = () => {
  const sessions = new Map<string, FakeSession>();
  let made = 0;

  const update = (id: string, change: (session: FakeSession) => FakeSession) =>
    Option.fromUndefinedOr(sessions.get(id)).pipe(
      Option.map((session) => {
        const next = change(session);

        sessions.set(id, next);

        return next;
      })
    );

  const calls: RealtimeCalls = {
    closeTracks: (session, mids) =>
      Option.match(
        update(session, (found) => ({
          ...found,
          tracks: found.tracks.map((track) =>
            mids.includes(track.mid) ? { ...track, open: false } : track
          ),
        })),
        {
          onNone: () => Effect.fail(unknownSession("Close")),
          onSome: () => Effect.void,
        }
      ),
    iceServers: Effect.succeed([CLOUDFLARE_STUN]),
    newSession: Effect.sync(() => {
      made += 1;

      const id = `${FAKE_SESSION_MARK}-${made}`;

      sessions.set(id, { id, tracks: [] });

      return id;
    }),
    openMids: (session) =>
      Option.match(Option.fromUndefinedOr(sessions.get(session)), {
        onNone: () => Effect.fail(unknownSession("ReadSession")),
        onSome: (found) =>
          Effect.succeed(
            found.tracks.filter(({ open }) => open).map(({ mid }) => mid)
          ),
      }),
    publish: ({ mid, session, track }) =>
      Option.match(
        update(session, (found) => ({
          ...found,
          tracks: [
            ...found.tracks,
            { mid, name: track, open: true, pulledFrom: Option.none() },
          ],
        })),
        {
          onNone: () => Effect.fail(unknownSession("Publish")),
          onSome: () => Effect.succeed(FAKE_ANSWER),
        }
      ),
    pull: (session, remotes) =>
      Effect.gen(function* pullFake() {
        const found = sessions.get(session);

        if (found === undefined) {
          return yield* unknownSession("Pull");
        }

        const live = remotes.filter(
          (remote) =>
            sessions
              .get(remote.session)
              ?.tracks.some(
                ({ name, open }) => open && name === remote.track
              ) === true
        );

        const added = live.map((remote, index) => ({
          mid: `${found.tracks.length + index}`,
          name: remote.track,
          open: true,
          pulledFrom: Option.some(remote.session),
        }));

        sessions.set(session, {
          ...found,
          tracks: [...found.tracks, ...added],
        });

        return {
          offer: added.length > 0 ? Option.some(FAKE_OFFER) : Option.none(),
          tracks: added.map(({ mid, name }) => ({ mid, track: name })),
        };
      }),
    renegotiate: (session) =>
      sessions.has(session)
        ? Effect.void
        : Effect.fail(unknownSession("Renegotiate")),
  };

  return {
    layer: Layer.succeed(Realtime, Option.some(calls)),
    sessions: () => [...sessions.values()],
  };
};
