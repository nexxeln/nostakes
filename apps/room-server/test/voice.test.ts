import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import { expect } from "@effect/vitest";
import {
  CommandIdSchema,
  MidSchema,
  RoomCodeSchema,
  VoiceAskSchema,
  VoiceRequestSchema,
} from "@nostakes/protocol";
import type { PlayerId, RoomPass, VoiceAsk } from "@nostakes/protocol";
import { DEFAULT_SETTINGS } from "@nostakes/room";
import type { VoiceRule } from "@nostakes/room";
import { Effect, Option, Queue, Schema } from "effect";
import * as HttpClient from "effect/http/HttpClient";

import { MemberCommandSchema } from "../src/poker-room.js";
import type { MemberCommand } from "../src/poker-room.js";
import { roomAnalytics } from "./fixtures/analytics-checks.js";
import { harnessHttp } from "./fixtures/harness-http.js";
import { hello } from "./fixtures/intruder.js";
import {
  createPokerRoom,
  joinPokerRoom,
  postJson,
} from "./fixtures/poker-http.js";
import type { PokerSocket } from "./fixtures/poker-socket.js";
import { awaitArrival, pokerCodec } from "./fixtures/poker-socket.js";
import { PokerStack } from "./fixtures/poker-stack.js";
import { inspect, queueCodes } from "./fixtures/stack.js";
import {
  FAKE_ANSWER,
  FAKE_OFFER,
  FAKE_SESSION_MARK,
  FakeSfuSchema,
} from "./fixtures/test-realtime.js";

const { afterAll, beforeAll, deploy, destroy, test } = Test.make({
  dev: true,
  providers: Cloudflare.providers(),
  sidecar: false,
  stage: `room_voice_${process.pid}`,
});

const deployed = beforeAll(deploy(PokerStack));

afterAll(destroy(PokerStack));

const Commands = MemberCommandSchema.cases;

const Ask = VoiceAskSchema.cases;

const Asks = {
  join: Ask.Join.make({}),
  publish: Ask.Publish.make({
    mid: MidSchema.make("0"),
    offer: "v=0 an offer",
  }),
};

const muting = (player: PlayerId, muted: boolean) =>
  Ask.Mute.make({ muted, player });

const encodeRequest = Schema.encodeSync(VoiceRequestSchema);

const voice = (base: string, pass: RoomPass, ask: VoiceAsk) =>
  postJson(
    new URL(`/rooms/${pass.code}/voice`, base),
    encodeRequest({ ask, token: pass.token })
  ).pipe(
    Effect.flatMap((response) =>
      response.text.pipe(
        Effect.map((text) => ({ status: response.status, text }))
      )
    ),
    Effect.orDie
  );

const sfuOf = (base: string, code: string) =>
  HttpClient.get(new URL(`/test/rooms/${code}/sfu`, base)).pipe(
    Effect.flatMap((response) => response.json),
    Effect.flatMap(Schema.decodeUnknownEffect(FakeSfuSchema)),
    Effect.orDie
  );

const openTracks = (base: string, code: string) =>
  sfuOf(base, code).pipe(
    Effect.map((sessions) =>
      sessions.flatMap(({ id, tracks }) =>
        tracks.filter(({ open }) => open).map(({ mid }) => `${id}/${mid}`)
      )
    )
  );

const roomWith = (base: string, code: string, rule: VoiceRule) =>
  Effect.gen(function* openVoiceRoom() {
    const room = RoomCodeSchema.make(code);

    yield* queueCodes(base, [room]);

    const host = yield* createPokerRoom(base, {
      avatar: "fox",
      name: "Ana",
      settings: { ...DEFAULT_SETTINGS, voice: rule },
    }).pipe(Effect.orDie);

    const guest = yield* joinPokerRoom(base, room, {
      avatar: "owl",
      name: "Ben",
    }).pipe(Effect.orDie);

    return { guest, host, room };
  });

const closedSoon = (socket: PokerSocket) =>
  Effect.gen(function* awaitClose() {
    while (Option.isNone(socket.closed())) {
      yield* Queue.take(socket.signal);
    }

    return socket.closed();
  }).pipe(Effect.timeout("10 seconds"), Effect.orDie);

const issue = (socket: PokerSocket, id: string, command: MemberCommand) =>
  socket.send(
    pokerCodec.client.cases.Command.make({
      command,
      id: CommandIdSchema.make(id),
    })
  );

const rosterSeen = (socket: PokerSocket, players: readonly PlayerId[]) =>
  awaitArrival(
    socket,
    `a voice roster of ${players.length}`,
    (message): message is typeof message =>
      pokerCodec.server.guards.Voice(message) &&
      message.roster.length === players.length &&
      message.roster.every(({ player }) => players.includes(player))
  );

test(
  "only a member in the room gets a voice session, a guest without a seat only listens, and removal or the end of the night closes every track",
  Effect.gen(function* whoGetsVoice() {
    const { url } = yield* deployed;
    const base = yield* Effect.fromNullishOr(url).pipe(Effect.orDie);

    const off = yield* roomWith(base, "VC2ZFF", "Off");
    const { socket: offHost } = yield* hello(base, off.host, "off host");

    expect((yield* voice(base, off.host, Asks.join)).status).toBe(403);

    yield* offHost.disconnect;

    const { guest, host, room } = yield* roomWith(base, "VC3AN4", "Seated");

    expect((yield* voice(base, host, Asks.join)).status).toBe(403);

    const { socket: ana } = yield* hello(base, host, "Ana");
    const { socket: ben } = yield* hello(base, guest, "Ben");

    const stranger = {
      ...host,
      token: yield* Schema.decodeEffect(VoiceRequestSchema.fields.token)(
        "A".repeat(43)
      ).pipe(Effect.orDie),
    };

    expect((yield* voice(base, stranger, Asks.join)).status).toBe(403);

    expect(yield* voice(base, host, Asks.join)).toMatchObject({ status: 200 });
    const published = yield* voice(base, host, Asks.publish);

    expect(published.status).toBe(200);
    expect(published.text).toContain(FAKE_ANSWER);
    expect((yield* voice(base, guest, Asks.join)).status).toBe(200);
    expect((yield* voice(base, guest, Asks.publish)).status).toBe(403);

    const pulled = yield* voice(
      base,
      guest,
      Ask.Pull.make({ players: [host.player] })
    );

    expect(pulled.status).toBe(200);
    expect(pulled.text).toContain(FAKE_OFFER);
    expect(pulled.text).toContain(host.player);

    expect((yield* voice(base, guest, muting(host.player, true))).status).toBe(
      403
    );

    expect((yield* voice(base, host, muting(host.player, true))).status).toBe(
      200
    );
    expect((yield* voice(base, host, Asks.publish)).status).toBe(403);
    expect((yield* voice(base, host, muting(host.player, false))).status).toBe(
      200
    );
    expect((yield* voice(base, host, Asks.publish)).status).toBe(200);

    yield* rosterSeen(ana, [host.player, guest.player]);

    const guestTracks = (yield* sfuOf(base, room)).filter(({ tracks }) =>
      tracks.some(({ pulledFrom }) => Option.isSome(pulledFrom))
    );

    expect(guestTracks.length).toBe(1);

    yield* issue(
      ana,
      "remove-ben",
      Commands.RemoveMember.make({ player: guest.player })
    );
    yield* rosterSeen(ana, [host.player]);

    const stillOpen = yield* openTracks(base, room);

    expect(
      stillOpen.filter((track) =>
        guestTracks.some(({ id }) => track.startsWith(`${id}/`))
      )
    ).toEqual([]);
    expect((yield* voice(base, guest, Asks.join)).status).toBe(403);
    expect(yield* closedSoon(ben)).not.toEqual(Option.none());

    yield* issue(ana, "close", Commands.CloseRoom.make({}));
    yield* rosterSeen(ana, []);

    expect(yield* openTracks(base, room)).toEqual([]);
    expect((yield* voice(base, host, Asks.join)).status).toBe(403);

    const sessions = (yield* sfuOf(base, room)).map(({ id }) => id);

    const tracks = (yield* sfuOf(base, room)).flatMap(({ tracks: kept }) =>
      kept.map(({ name }) => name)
    );

    const inspection = yield* inspect(base, room);
    const points = yield* roomAnalytics(base, room);

    const written = [
      ...inspection.logged,
      ...inspection.faults,
      ...points.flatMap(({ point }) => [...point.blobs, ...point.indexes]),
    ];

    expect(
      [
        FAKE_SESSION_MARK,
        FAKE_ANSWER,
        FAKE_OFFER,
        ...sessions,
        ...tracks,
      ].filter((secret) => written.some((line) => line.includes(secret)))
    ).toEqual([]);
    expect(
      points
        .filter(({ point }) => point.blobs[0] === "VoiceSession")
        .map(({ point }) => point.blobs)
    ).toEqual([["VoiceSession"], ["VoiceSession"]]);

    yield* ana.disconnect;
  }).pipe(Effect.provide(harnessHttp))
);
