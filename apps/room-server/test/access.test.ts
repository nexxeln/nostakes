import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import { expect } from "@effect/vitest";
import {
  HELLO_TIMEOUT_MS,
  HttpRefusalSchema,
  MAX_FRAME_BYTES,
  PING_FRAME,
  PONG_FRAME,
  ROOM_CODE_ALPHABET,
  RoomCodeSchema,
  TOKEN_BYTES,
  TokenSchema,
} from "@nostakes/protocol";
import type { RoomCode, RoomPass } from "@nostakes/protocol";
import {
  Effect,
  Option,
  Redacted,
  Result,
  Schedule,
  Schema,
  pipe,
} from "effect";
import * as Base64Url from "effect/encoding/Base64Url";
import * as Hex from "effect/encoding/Hex";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";

import { retryDelay } from "../src/refused-deadline.js";
import { MAX_MEMBERS, MAX_SOCKETS } from "../src/room-rpc.js";
import {
  codec,
  command,
  connect,
  createRoom,
  hello,
  isClosing,
  isEvents,
  isPresence,
  joinAs,
  joinRoom,
  openRoomWith,
  post,
  replyTo,
} from "./fixtures/room-client.js";
import type { RoomClient, ToyServerMessage } from "./fixtures/room-client.js";
import {
  inspect,
  queueCodes,
  restart,
  ToyStack,
  wakeAt,
} from "./fixtures/stack.js";
import { DEAL_SEED, seededBytes } from "./fixtures/test-entropy.js";
import {
  DEAL_ENTROPY_BYTES,
  SECRET_BYTES,
  TOY_RETRIES,
  ToyMemberCommandSchema,
  ToyRedactedSchema,
} from "./fixtures/toy-room.js";
import type { ToyRedacted } from "./fixtures/toy-room.js";

const { afterAll, beforeAll, deploy, destroy, test } = Test.make({
  dev: true,
  providers: Cloudflare.providers(),
  sidecar: false,
  stage: `room_access_${process.pid}`,
});

const deployed = beforeAll(deploy(ToyStack));

afterAll(destroy(ToyStack));

const baseUrl = deployed.pipe(
  Effect.flatMap(({ url }) => Effect.fromNullishOr(url)),
  Effect.orDie
);

const Commands = ToyMemberCommandSchema.cases;

const isEvent = ToyRedactedSchema.guards;

const eventsOf = (client: RoomClient) =>
  client.messages.flatMap((message) =>
    isEvents(message) ? message.events : []
  );

const pollInspection = (
  base: string,
  code: RoomCode,
  until: (runs: number) => boolean
) =>
  inspect(base, code).pipe(
    Effect.repeat({
      schedule: Schedule.spaced("100 millis"),
      times: 40,
      until: (inspection) => until(inspection.alarmRuns.length),
    })
  );

const randomCode = () =>
  RoomCodeSchema.make(
    Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
      ROOM_CODE_ALPHABET.charAt(byte % ROOM_CODE_ALPHABET.length)
    ).join("")
  );

const randomToken = () =>
  Schema.decodeSync(TokenSchema)(
    Base64Url.encode(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)))
  );

const greetWith = (
  base: string,
  code: RoomCode,
  pass: RoomPass,
  label: string
) =>
  Effect.gen(function* connectAndHello() {
    const client = yield* connect(base, code, label);

    yield* client.send(hello(pass));

    return client;
  });

test(
  "7. clock race: the alarm acts, and when a member wins the race the late alarm writes nothing",
  Effect.gen(function* clockRace() {
    const base = yield* baseUrl;
    const [anaPass, benPass] = yield* openRoomWith(base, ["Ana", "Ben"]);

    if (anaPass === undefined || benPass === undefined) {
      return;
    }

    const ana = yield* joinAs(base, anaPass, "ana");
    const ben = yield* joinAs(base, benPass, "ben");

    yield* ana.client.send(command("t1", Commands.StartTurn.make({ ms: 300 })));
    yield* ana.client.next("reply t1", replyTo("t1"));

    for (const client of [ana.client, ben.client]) {
      yield* client.next(
        "turn expired",
        (message): message is typeof codec.server.cases.Events.Type =>
          isEvents(message) && message.events.some(isEvent.TurnExpired)
      );
    }

    expect((yield* inspect(base, anaPass.code)).alarmRuns.at(-1)?.outcome).toBe(
      "Committed"
    );

    yield* ana.client.send(command("t2", Commands.StartTurn.make({ ms: 600 })));
    yield* ana.client.next("reply t2", replyTo("t2"));

    const started = eventsOf(ana.client).findLast(isEvent.TurnStarted);

    yield* ana.client.send(command("act", Commands.Act.make({})));

    const acted = yield* ana.client.next("reply act", replyTo("act"));

    yield* ben.client.send(
      command("t3", Commands.StartTurn.make({ ms: 30_000 }))
    );
    yield* ben.client.next("reply t3", replyTo("t3"));

    const before = yield* inspect(base, anaPass.code);

    yield* wakeAt(base, anaPass.code, started?.deadline ?? 0);

    const after = yield* pollInspection(
      base,
      anaPass.code,
      (runs) => runs > before.alarmRuns.length
    );

    yield* Effect.sleep("200 millis");

    expect(codec.reply.guards.Accepted(acted.result)).toBe(true);
    expect(after.alarmRuns.at(-1)?.outcome).toBe("NothingDue");
    expect(after.seqs).toEqual(before.seqs);
    expect(after.events).toEqual(before.events);
    expect(after.replies).toBe(before.replies);
    expect(eventsOf(ben.client).filter(isEvent.TurnExpired).length).toBe(1);
  }).pipe(Effect.provide(FetchHttpClient.layer))
);

const ownSecrets = (client: RoomClient) =>
  eventsOf(client).flatMap((event) =>
    isEvent.SecretDealt(event) && Option.isSome(event.secret)
      ? [event.secret.value]
      : []
  );

test(
  "8. entropy: every deal gets fresh bytes from the entropy service and no two deals share them",
  Effect.gen(function* entropy() {
    const base = yield* baseUrl;
    const [anaPass, benPass] = yield* openRoomWith(base, ["Ana", "Ben"]);

    if (anaPass === undefined || benPass === undefined) {
      return;
    }

    const ana = yield* joinAs(base, anaPass, "ana");
    const ben = yield* joinAs(base, benPass, "ben");
    const rounds = [1, 2, 3];

    for (const round of rounds) {
      yield* ana.client.send(
        command(`deal-${round}`, Commands.RequestDeal.make({}))
      );
      yield* ana.client.next(`reply deal-${round}`, replyTo(`deal-${round}`));

      for (const client of [ana.client, ben.client]) {
        yield* client.next(
          `round ${round}`,
          (message): message is typeof codec.server.cases.Events.Type =>
            isEvents(message) &&
            message.events.some(
              (event) => isEvent.SecretDealt(event) && event.round === round
            )
        );
      }
    }

    const expected = (memberIndex: number) =>
      rounds.map((call) =>
        Hex.encode(
          seededBytes(DEAL_SEED, call, DEAL_ENTROPY_BYTES).subarray(
            memberIndex * SECRET_BYTES,
            (memberIndex + 1) * SECRET_BYTES
          )
        )
      );

    expect(ownSecrets(ana.client)).toEqual(expected(0));
    expect(ownSecrets(ben.client)).toEqual(expected(1));
    expect(
      new Set([...ownSecrets(ana.client), ...ownSecrets(ben.client)]).size
    ).toBe(6);
  }).pipe(Effect.provide(FetchHttpClient.layer))
);

test(
  "9. identity: hello timeout, wrong token, foreign token, a second device, and no token in any frame or event",
  Effect.gen(function* identity() {
    const base = yield* baseUrl;
    const [anaPass, deePass] = yield* openRoomWith(base, ["Ana", "Dee"]);
    const [otherPass] = yield* openRoomWith(base, ["Zed"]);

    if (
      anaPass === undefined ||
      deePass === undefined ||
      otherPass === undefined
    ) {
      return;
    }

    const openedAt = performance.now();
    const silent = yield* connect(base, anaPass.code, "silent");

    const wrong = yield* greetWith(
      base,
      anaPass.code,
      { ...anaPass, token: randomToken() },
      "wrong token"
    );

    const foreign = yield* greetWith(base, anaPass.code, otherPass, "foreign");

    expect((yield* wrong.waitClosed).reason).toBe("NotAuthorized");
    expect((yield* foreign.waitClosed).reason).toBe("NotAuthorized");
    expect(wrong.messages).toEqual([
      codec.server.cases.Closing.make({ reason: "NotAuthorized" }),
    ]);

    const ana = yield* joinAs(base, anaPass, "ana");
    const dee = yield* joinAs(base, deePass, "dee phone");
    const deeLaptop = yield* joinAs(base, deePass, "dee laptop");

    expect(dee.welcome.you).toBe(deePass.player);
    expect(deeLaptop.welcome.you).toBe(deePass.player);
    expect(deeLaptop.welcome.view).toEqual(dee.welcome.view);

    yield* dee.client.send(
      command("d1", Commands.Increment.make({ times: 1 }))
    );
    yield* dee.client.next("reply d1", replyTo("d1"));

    const onLaptop = yield* deeLaptop.client.next("events on laptop", isEvents);

    expect(onLaptop.events.map((event) => event._tag)).toEqual(["Incremented"]);
    expect(
      ana.client.messages
        .filter(isPresence)
        .map(({ connected }) => connected.length)
    ).toEqual([1, 2]);

    const timedOut = yield* silent.next("hello timeout", isClosing);
    const waited = performance.now() - openedAt;
    const afterTimeout = yield* inspect(base, anaPass.code);

    expect(timedOut).toEqual(
      codec.server.cases.Closing.make({ reason: "HelloTimeout" })
    );
    expect(waited).toBeGreaterThanOrEqual(HELLO_TIMEOUT_MS - 50);
    expect(afterTimeout.sockets).toEqual({ live: 3, pending: 0 });

    const secrets = yield* pipe(
      [anaPass, deePass, otherPass],
      Effect.forEach((pass) =>
        Effect.promise(() =>
          crypto.subtle.digest(
            "SHA-256",
            Result.getOrThrow(Base64Url.decode(Redacted.value(pass.token)))
          )
        ).pipe(
          Effect.map((digest) => [
            Redacted.value(pass.token),
            Hex.encode(new Uint8Array(digest)),
          ])
        )
      )
    );

    const stored = (yield* inspect(base, anaPass.code)).events.join("\n");

    const frames = [
      ...[ana, dee, deeLaptop].flatMap(({ client }) => client.frames),
      ...silent.frames,
      ...wrong.frames,
      ...foreign.frames,
    ].join("\n");

    for (const secret of secrets.flat()) {
      expect(frames.includes(secret)).toBe(false);
      expect(stored.includes(secret)).toBe(false);
    }
  }).pipe(Effect.provide(FetchHttpClient.layer))
);

const refusalOf = (response: HttpClientResponse.HttpClientResponse) =>
  response.json.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(HttpRefusalSchema)),
    Effect.orDie
  );

test(
  "10. create and join: a code and a host, a collision retries, a wrong code is a plain 404 or a NotFound closing frame, a full room refuses",
  Effect.gen(function* createAndJoin() {
    const base = yield* baseUrl;
    const hostPass = yield* createRoom(base, { avatar: "fox", name: "Ana" });
    const host = yield* joinAs(base, hostPass, "host");

    expect(Schema.is(RoomCodeSchema)(hostPass.code)).toBe(true);
    expect(host.welcome.you).toBe(hostPass.player);
    expect(host.welcome.view.host).toEqual(Option.some(hostPass.player));

    const fresh = randomCode();

    yield* queueCodes(base, [hostPass.code, fresh]);

    const second = yield* createRoom(base, { avatar: "owl", name: "Ben" });

    expect(second.code).toBe(fresh);

    const unknown = yield* post(
      new URL(`/rooms/${randomCode()}/members`, base),
      {
        avatar: "owl",
        name: "Lost",
      }
    );

    const malformed = yield* post(new URL("/rooms/not-a-code/members", base), {
      avatar: "owl",
      name: "Lost",
    });

    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(yield* refusalOf(unknown)).toEqual(yield* refusalOf(malformed));

    const missingCode = randomCode();
    const missing = yield* connect(base, missingCode, "missing");
    const garbled = yield* connect(base, "not-a-code", "garbled code");
    const missingClosed = yield* missing.waitClosed;

    expect(missingClosed).toEqual({ code: 4004, reason: "NotFound" });
    expect(yield* garbled.waitClosed).toEqual(missingClosed);
    expect(missing.frames).toEqual(['{"_tag":"Closing","reason":"NotFound"}']);
    expect(garbled.frames).toEqual(missing.frames);
    expect(yield* inspect(base, missingCode)).toMatchObject({
      code: Option.none(),
      events: [],
      headSeq: 0,
      sockets: { live: 0, pending: 0 },
    });

    for (let member = 1; member < MAX_MEMBERS; member += 1) {
      yield* joinRoom(base, second.code, {
        avatar: "owl",
        name: `Guest ${member}`,
      });
    }

    const full = yield* post(new URL(`/rooms/${second.code}/members`, base), {
      avatar: "owl",
      name: "One too many",
    });

    expect(full.status).toBe(409);
    expect(yield* refusalOf(full)).toEqual({ refusal: "RoomFull" });
    expect((yield* inspect(base, second.code)).members).toBe(MAX_MEMBERS);
  }).pipe(Effect.provide(FetchHttpClient.layer))
);

const paddedPing = (bytes: number) =>
  `${PING_FRAME}${" ".repeat(bytes - PING_FRAME.length)}`;

const isPong = codec.server.guards.Pong;

test(
  "11. limits: frame size, frames per second, and sockets per room are each enforced, and exact pings are answered without counting",
  Effect.gen(function* limits() {
    const base = yield* baseUrl;
    const [anaPass] = yield* openRoomWith(base, ["Ana"]);

    if (anaPass === undefined) {
      return;
    }

    const large = yield* joinAs(base, anaPass, "large frames");

    yield* large.client.sendText(paddedPing(MAX_FRAME_BYTES));
    yield* large.client.next("pong", codec.server.guards.Pong);
    yield* large.client.sendText(paddedPing(MAX_FRAME_BYTES + 1));

    const tooLarge = yield* large.client.waitClosed;

    expect(tooLarge).toEqual({ code: 1009, reason: "FrameTooLarge" });

    const chatty = yield* joinAs(base, anaPass, "chatty");

    for (let frame = 0; frame < 30; frame += 1) {
      yield* chatty.client.sendText(paddedPing(PING_FRAME.length + 1));
    }

    const tooMany = yield* chatty.client.waitClosed;

    const heartbeat = yield* joinAs(base, anaPass, "exact pings");

    for (let frame = 0; frame < 30; frame += 1) {
      yield* heartbeat.client.sendText(PING_FRAME);
    }

    for (let frame = 0; frame < 30; frame += 1) {
      yield* heartbeat.client.next(`pong ${frame}`, isPong);
    }

    expect(yield* heartbeat.client.closed).toEqual(Option.none());
    expect(
      heartbeat.client.frames.filter((text) => text === PONG_FRAME)
    ).toHaveLength(30);

    const pongs = chatty.client.messages.filter(
      codec.server.guards.Pong
    ).length;

    expect(tooMany.reason).toBe("TooManyFrames");
    expect(pongs).toBeGreaterThanOrEqual(8);
    expect(pongs).toBeLessThan(30);

    const sockets = yield* pipe(
      Array.from({ length: MAX_SOCKETS - 1 }, (_, index) => index),
      Effect.forEach((index) => connect(base, anaPass.code, `socket ${index}`))
    );

    const extra = yield* connect(base, anaPass.code, "one too many");

    expect(yield* extra.waitClosed).toEqual({
      code: 4029,
      reason: "TooManySockets",
    });
    expect(extra.messages).toEqual([
      codec.server.cases.Closing.make({ reason: "TooManySockets" }),
    ]);
    expect((yield* inspect(base, anaPass.code)).sockets).toEqual({
      live: 1,
      pending: MAX_SOCKETS - 1,
    });

    yield* pipe(
      sockets,
      Effect.forEach((socket) => socket.disconnect)
    );
  }).pipe(Effect.provide(FetchHttpClient.layer))
);

type ToyEvents = typeof codec.server.cases.Events.Type;

const eventsWith =
  (holds: (event: ToyRedacted) => boolean) =>
  (message: ToyServerMessage): message is ToyEvents =>
    isEvents(message) && message.events.some(holds);

test(
  "12. a deadline the room refuses: the server waits longer before each answer, logs every refusal, marks the room stalled for every player, and clears the mark when the room accepts the deadline again",
  Effect.gen(function* refusedDeadline() {
    const base = yield* baseUrl;
    const [anaPass, benPass] = yield* openRoomWith(base, ["Ana", "Ben"]);

    if (anaPass === undefined || benPass === undefined) {
      return;
    }

    const ana = yield* joinAs(base, anaPass, "ana");
    const ben = yield* joinAs(base, benPass, "ben");

    yield* ana.client.send(command("jam", Commands.Jam.make({ on: true })));
    yield* ana.client.next("reply jam", replyTo("jam"));
    yield* ana.client.send(command("deal", Commands.RequestDeal.make({})));
    yield* ana.client.next("reply deal", replyTo("deal"));

    const marked = yield* ben.client.next(
      "the stall",
      eventsWith(isEvent.Stalled)
    );

    const stalled = yield* inspect(base, anaPass.code);

    const refused = stalled.alarmRuns.filter(
      ({ outcome }) => outcome === "Rejected"
    );

    const gaps = refused
      .slice(1)
      .map(({ at }, index) => at - (refused[index]?.at ?? at));

    expect(Option.isSome(marked.view.stalled)).toBe(true);
    expect(refused.length).toBe(TOY_RETRIES.stallAfter);
    expect(
      gaps.map((gap, index) => gap >= retryDelay(TOY_RETRIES, index + 1))
    ).toStrictEqual([true, true]);
    expect(stalled.faults).toStrictEqual(
      [1, 2, 3].map(
        (count) =>
          `Room ${anaPass.code} refused the server's answer to its Deal deadline, ${count} in a row: {"_tag":"ToyRefusal","reason":"Jammed"}. The server asks again in ${retryDelay(TOY_RETRIES, count)} ms.${count === TOY_RETRIES.stallAfter ? " The room is marked stalled, so its players see that the table is stuck and can end the night." : ""} This is a bug in the room core.`
      )
    );

    yield* restart(base, anaPass.code);

    const again = yield* inspect(base, anaPass.code).pipe(
      Effect.repeat({
        schedule: Schedule.spaced("100 millis"),
        times: 40,
        until: (inspection) => inspection.faults.length > 0,
      })
    );

    expect(again.faults[0]).toContain(
      `Deal deadline, ${TOY_RETRIES.stallAfter + 1} in a row`
    );

    const back = yield* joinAs(base, anaPass, "ana again");

    expect(Option.isSome(back.welcome.view.stalled)).toBe(true);

    yield* back.client.send(command("free", Commands.Jam.make({ on: false })));
    yield* back.client.next("reply free", replyTo("free"));

    const dealt = yield* back.client.next(
      "the deal",
      eventsWith(isEvent.SecretDealt)
    );

    const settled = yield* inspect(base, anaPass.code);

    expect(dealt.events[0]?._tag).toBe("StallCleared");
    expect(dealt.view.stalled).toStrictEqual(Option.none());
    expect(settled.alarmRuns.at(-1)?.outcome).toBe("Committed");
  }).pipe(Effect.provide(FetchHttpClient.layer))
);

test(
  "13. a member command the room core throws on: the member gets an unavailable reply, nothing is stored, the room and the other players carry on, the fault is logged once without the command's contents, and faults in a row mark the room stalled",
  Effect.gen(function* thrownCommand() {
    const base = yield* baseUrl;
    const [anaPass, benPass] = yield* openRoomWith(base, ["Ana", "Ben"]);

    if (anaPass === undefined || benPass === undefined) {
      return;
    }

    const { code } = anaPass;
    const ana = yield* joinAs(base, anaPass, "ana");
    const ben = yield* joinAs(base, benPass, "ben");
    const before = yield* inspect(base, code);
    const throwing = Commands.Throw.make({ note: "a private note" });

    yield* ana.client.send(command("boom", throwing));

    const boom = yield* ana.client.next("reply boom", replyTo("boom"));
    const afterBoom = yield* inspect(base, code);

    yield* ana.client.send(
      command("count", Commands.Increment.make({ times: 1 }))
    );

    const counted = yield* ana.client.next("reply count", replyTo("count"));

    const seen = yield* ben.client.next(
      "the count",
      eventsWith(isEvent.Incremented)
    );

    expect(boom.result).toStrictEqual(
      codec.reply.cases.Unavailable.make({ reason: "RoomFault" })
    );
    expect({
      events: afterBoom.events,
      replies: afterBoom.replies,
      seqs: afterBoom.seqs,
    }).toStrictEqual({
      events: before.events,
      replies: before.replies,
      seqs: before.seqs,
    });
    expect(afterBoom.faults).toStrictEqual([
      `Room ${code} threw ToyCoreBrokeError while deciding a member's Throw command, 1 in a row. Nothing was stored, and the member was told the room could not take it. This is a bug in the room core.`,
    ]);
    expect(codec.reply.guards.Accepted(counted.result)).toBe(true);
    expect(seen.events.map(({ _tag }) => _tag)).toStrictEqual(["Incremented"]);
    expect(yield* ana.client.closed).toStrictEqual(Option.none());
    expect(yield* ben.client.closed).toStrictEqual(Option.none());

    yield* ana.client.send(
      command("turn", Commands.StartTurn.make({ ms: 600_000 }))
    );
    yield* ana.client.next("reply turn", replyTo("turn"));

    for (const id of ["boom 1", "boom 2", "boom 3"]) {
      yield* ana.client.send(command(id, throwing));
      yield* ana.client.next(`reply ${id}`, replyTo(id));
    }

    const marked = yield* ben.client.next(
      "the stall",
      eventsWith(isEvent.Stalled)
    );

    const stalled = yield* inspect(base, code);

    expect(Option.isSome(marked.view.stalled)).toBe(true);
    expect(stalled.faults.slice(1)).toStrictEqual(
      [1, 2, 3].map(
        (count) =>
          `Room ${code} threw ToyCoreBrokeError while deciding a member's Throw command, ${count} in a row. Nothing was stored, and the member was told the room could not take it.${count === TOY_RETRIES.stallAfter ? " The room is marked stalled, so its players see that the table is stuck and can end the night." : ""} This is a bug in the room core.`
      )
    );
    expect(stalled.faults.join(" ")).not.toContain("a private note");
  }).pipe(Effect.provide(FetchHttpClient.layer))
);
