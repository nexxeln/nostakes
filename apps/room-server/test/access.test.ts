import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import { expect } from "@effect/vitest";
import {
  CLOSE_CODES,
  COMMAND_ALLOWANCE,
  FRAME_ALLOWANCE,
  HELLO_TIMEOUT_MS,
  HttpRefusalSchema,
  MAX_FRAME_BYTES,
  PING_FRAME,
  PLAYER_FRAME_ALLOWANCE,
  PONG_FRAME,
  ROOM_CODE_ALPHABET,
  RoomCodeSchema,
  SOCKETS_PER_PLAYER,
  TOKEN_BYTES,
  TokenSchema,
} from "@nostakes/protocol";
import type { CloseReason, RoomCode, RoomPass } from "@nostakes/protocol";
import {
  Duration,
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
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";

import { retryDelay } from "../src/refused-deadline.js";
import {
  MAX_MEMBERS,
  PENDING_CEILING,
  PENDING_GRACE_MS,
  PENDING_SOCKETS,
} from "../src/room-rpc.js";
import { REJECTIONS_KEPT_PER_SOCKET } from "../src/socket-attachment.js";
import { roomAnalytics } from "./fixtures/analytics-checks.js";
import { harnessHttp } from "./fixtures/harness-http.js";
import {
  codec,
  command,
  connect,
  createRoom,
  hello,
  isClosing,
  isEvents,
  isPresence,
  isWelcome,
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
import { TEST_ORIGIN } from "./fixtures/toy-worker.js";

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

const FLOOD =
  PLAYER_FRAME_ALLOWANCE.burst + 2 * PLAYER_FRAME_ALLOWANCE.perSecond;

const isEvent = ToyRedactedSchema.guards;

const FLOOD_ROUNDS = 40;

const floodedUntil = <E, R>(
  refused: () => boolean,
  round: (index: number) => Effect.Effect<number, E, R>
) =>
  Effect.gen(function* floodInRounds() {
    const sent = { frames: 0, rounds: 0 };

    yield* Effect.suspend(() =>
      refused() ? Effect.succeed(0) : round(sent.rounds)
    ).pipe(
      Effect.tap((frames) =>
        Effect.sync(() => {
          sent.frames += frames;
          sent.rounds += 1;
        })
      ),
      Effect.repeat({
        schedule: Schedule.spaced("100 millis"),
        times: FLOOD_ROUNDS,
        until: refused,
      })
    );

    return sent.frames;
  });

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

const MEMBER_WINS_WITHIN_MS = 2000;

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

    yield* ana.client.send(
      command("t2", Commands.StartTurn.make({ ms: MEMBER_WINS_WITHIN_MS }))
    );
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
  }).pipe(Effect.provide(harnessHttp))
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
  }).pipe(Effect.provide(harnessHttp))
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
  }).pipe(Effect.provide(harnessHttp))
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
  }).pipe(Effect.provide(harnessHttp))
);

const paddedPing = (bytes: number) =>
  `${PING_FRAME}${" ".repeat(bytes - PING_FRAME.length)}`;

const isPong = codec.server.guards.Pong;

test(
  "11. limits: frame size and frames per second are each enforced, and exact pings are answered without counting",
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

    const flooded = yield* floodedUntil(
      () => chatty.client.messages.some(isClosing),
      () =>
        Effect.gen(function* oneFlood() {
          for (let frame = 0; frame < FLOOD; frame += 1) {
            yield* chatty.client.sendText(paddedPing(PING_FRAME.length + 1));
          }

          return FLOOD;
        })
    );

    const tooMany = yield* chatty.client.waitClosed;

    const heartbeat = yield* joinAs(base, anaPass, "exact pings");

    for (let frame = 0; frame < FLOOD; frame += 1) {
      yield* heartbeat.client.sendText(PING_FRAME);
    }

    for (let frame = 0; frame < FLOOD; frame += 1) {
      yield* heartbeat.client.next(`pong ${frame}`, isPong);
    }

    expect(yield* heartbeat.client.closed).toEqual(Option.none());
    expect(
      heartbeat.client.frames.filter((text) => text === PONG_FRAME)
    ).toHaveLength(FLOOD);

    const pongs = chatty.client.messages.filter(
      codec.server.guards.Pong
    ).length;

    expect(tooMany.reason).toBe("TooManyFrames");
    expect(pongs).toBeGreaterThanOrEqual(PLAYER_FRAME_ALLOWANCE.burst - 2);
    expect(pongs).toBeLessThan(flooded);
  }).pipe(Effect.provide(harnessHttp))
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
          `The room refused the server's answer to its Deal deadline, ${count} in a row: ToyRefusal. The server asks again in ${retryDelay(TOY_RETRIES, count)} ms.${count === TOY_RETRIES.stallAfter ? " The room is marked stalled, so its players see that the table is stuck and can end the night." : ""} This is a bug in the room core.`
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
  }).pipe(Effect.provide(harnessHttp))
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
      `The room core threw ToyCoreBrokeError while deciding a member's Throw command, 1 in a row. Nothing was stored, and the member was told the room could not take it. This is a bug in the room core.`,
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
          `The room core threw ToyCoreBrokeError while deciding a member's Throw command, ${count} in a row. Nothing was stored, and the member was told the room could not take it.${count === TOY_RETRIES.stallAfter ? " The room is marked stalled, so its players see that the table is stuck and can end the night." : ""} This is a bug in the room core.`
      )
    );
    expect(stalled.faults.join(" ")).not.toContain("a private note");
  }).pipe(Effect.provide(harnessHttp))
);

const SLOT_FLOOD = 64;

const openedElsewhere = {
  code: CLOSE_CODES.OpenedElsewhere,
  reason: "OpenedElsewhere",
};

test(
  "14. socket slots: a member keeps only their newest sockets and the older ones hear they were opened elsewhere, a socket that says hello within the grace gets in however many silent sockets arrive meanwhile, and silent sockets past the grace only push out each other",
  Effect.gen(function* socketSlots() {
    const base = yield* baseUrl;
    const [anaPass, trollPass] = yield* openRoomWith(base, ["Ana", "Troll"]);

    if (anaPass === undefined || trollPass === undefined) {
      return;
    }

    const { code } = anaPass;

    const trolls = yield* pipe(
      Array.from({ length: SLOT_FLOOD }, (_, index) => index),
      Effect.forEach((index) => joinAs(base, trollPass, `troll ${index}`))
    );

    const ana = yield* joinAs(base, anaPass, "ana after the troll's sockets");
    const pushedOut = trolls.slice(0, SLOT_FLOOD - SOCKETS_PER_PLAYER);
    const kept = trolls.slice(SLOT_FLOOD - SOCKETS_PER_PLAYER);

    const pushedOutCloses = yield* pipe(
      pushedOut,
      Effect.forEach(({ client }) => client.waitClosed)
    );

    const keptCloses = yield* pipe(
      kept,
      Effect.forEach(({ client }) => client.closed)
    );

    expect(ana.welcome.you).toBe(anaPass.player);
    expect(pushedOutCloses).toStrictEqual(pushedOut.map(() => openedElsewhere));
    expect(pushedOut.map(({ client }) => client.messages.at(-1))).toStrictEqual(
      pushedOut.map(() =>
        codec.server.cases.Closing.make({ reason: "OpenedElsewhere" })
      )
    );
    expect(keptCloses).toStrictEqual(kept.map(() => Option.none()));
    expect((yield* inspect(base, code)).sockets).toStrictEqual({
      live: SOCKETS_PER_PLAYER + 1,
      pending: 0,
    });

    const prompt = yield* connect(base, code, "ana opening one more socket");

    const silent = yield* pipe(
      Array.from({ length: SLOT_FLOOD }, (_, index) => index),
      Effect.forEach((index) => connect(base, code, `silent ${index}`))
    );

    yield* prompt.send(hello(anaPass));

    const promptWelcome = yield* prompt.next(
      "a welcome through the silent sockets",
      isWelcome
    );

    yield* Effect.sleep(Duration.millis(PENDING_GRACE_MS + 300));

    const late = yield* connect(base, code, "one more after the grace");
    const crowded = silent.slice(0, SLOT_FLOOD - PENDING_SOCKETS + 1);
    const waiting = silent.slice(SLOT_FLOOD - PENDING_SOCKETS + 1);

    const crowdedClosings = yield* pipe(
      crowded,
      Effect.forEach((client) => client.next("its closing frame", isClosing))
    );

    const during = yield* inspect(base, code);

    expect(promptWelcome.you).toBe(anaPass.player);
    expect(during.sockets).toStrictEqual({
      live: SOCKETS_PER_PLAYER + 2,
      pending: PENDING_SOCKETS,
    });
    expect(crowdedClosings).toStrictEqual(
      crowded.map(() =>
        codec.server.cases.Closing.make({ reason: "TooManySockets" })
      )
    );
    expect([...waiting, late].flatMap((client) => client.frames)).toStrictEqual(
      []
    );

    const checkOf = (checked: RoomCode) =>
      HttpClientRequest.post(new URL(`/rooms/${checked}/check`, base)).pipe(
        HttpClientRequest.setHeader("origin", TEST_ORIGIN),
        HttpClient.execute,
        Effect.flatMap((response) =>
          response.text.pipe(
            Effect.map((body) => ({ body, status: response.status }))
          )
        ),
        Effect.orDie
      );

    const beforeCheck = yield* inspect(base, code);
    const there = yield* checkOf(code);
    const gone = yield* checkOf(randomCode());

    expect([there, gone]).toStrictEqual([
      { body: "", status: 204 },
      { body: '{"refusal":"NotFound"}', status: 404 },
    ]);
    expect((yield* inspect(base, code)).sockets).toStrictEqual(
      beforeCheck.sockets
    );

    yield* pipe(
      [...kept.map(({ client }) => client), ana.client, prompt],
      Effect.forEach((client) => client.disconnect)
    );
    yield* pipe(
      [...waiting, late],
      Effect.forEach((client) => client.disconnect)
    );
  }).pipe(Effect.provide(harnessHttp))
);

const isClosingWith =
  (reason: CloseReason) =>
  (message: ToyServerMessage): message is ToyClosing =>
    isClosing(message) && message.reason === reason;

type ToyClosing = typeof codec.server.cases.Closing.Type;

const UNDER_ONE_SOCKET = FRAME_ALLOWANCE.burst - 1;

test(
  "15. writes on demand: a member's rejected commands write no storage while their socket is open and stay final for their ids on every socket and after a reconnect, and a player's commands and frames are metered across all their sockets",
  Effect.gen(function* writesOnDemand() {
    const base = yield* baseUrl;

    const [anaPass, benPass, cyPass] = yield* openRoomWith(base, [
      "Ana",
      "Ben",
      "Cy",
    ]);

    if (
      anaPass === undefined ||
      benPass === undefined ||
      cyPass === undefined
    ) {
      return;
    }

    const { code } = anaPass;
    const ana = yield* joinAs(base, anaPass, "ana laptop");
    const before = yield* inspect(base, code);
    const tries = COMMAND_ALLOWANCE.burst - 4;
    const early: ToyServerMessage[] = [];

    for (let index = 0; index < tries; index += 1) {
      yield* ana.client.send(command(`early ${index}`, Commands.Act.make({})));
      early.push(
        yield* ana.client.next(
          `reply early ${index}`,
          replyTo(`early ${index}`)
        )
      );
    }

    const afterRejections = yield* inspect(base, code);
    const phone = yield* joinAs(base, anaPass, "ana phone");

    yield* phone.client.send(
      command("turn", Commands.StartTurn.make({ ms: 600_000 }))
    );

    const turn = yield* phone.client.next("reply turn", replyTo("turn"));

    yield* phone.client.send(
      command(`early ${tries - 1}`, Commands.Act.make({}))
    );

    const fromLaptop = yield* phone.client.next(
      "the laptop's rejection",
      replyTo(`early ${tries - 1}`)
    );

    yield* ana.client.disconnect;

    const kept = yield* inspect(base, code).pipe(
      Effect.repeat({
        schedule: Schedule.spaced("50 millis"),
        times: 40,
        until: (inspection) => inspection.replies > before.replies + 1,
      })
    );

    const again = yield* joinAs(base, anaPass, "ana laptop again");

    yield* again.client.send(
      command(`early ${tries - 2}`, Commands.Act.make({}))
    );

    const fromStorage = yield* again.client.next(
      "the stored rejection",
      replyTo(`early ${tries - 2}`)
    );

    expect(
      early.every(
        (reply) =>
          codec.server.guards.Reply(reply) &&
          codec.reply.guards.Rejected(reply.result)
      )
    ).toBe(true);
    expect(afterRejections.rowsWritten).toBe(before.rowsWritten);
    expect(afterRejections.replies).toBe(before.replies);
    expect(
      codec.server.guards.Reply(turn) &&
        codec.reply.guards.Accepted(turn.result)
    ).toBe(true);
    expect(fromLaptop).toStrictEqual(early.at(-1));
    expect(fromStorage).toStrictEqual(early.at(-2));
    expect(kept.replies).toBe(before.replies + 1 + REJECTIONS_KEPT_PER_SOCKET);

    const benSockets = yield* pipe(
      Array.from({ length: SOCKETS_PER_PLAYER }, (_, index) => index),
      Effect.forEach((index) => joinAs(base, benPass, `ben ${index}`))
    );

    yield* floodedUntil(
      () => benSockets.some(({ client }) => client.messages.some(isClosing)),
      (round) =>
        Effect.gen(function* oneBurstAndOneMore() {
          for (let index = 0; index <= COMMAND_ALLOWANCE.burst; index += 1) {
            const sender = benSockets[index % benSockets.length];

            if (sender !== undefined) {
              yield* sender.client.send(
                command(
                  `count ${round}.${index}`,
                  Commands.Increment.make({ times: 1 })
                )
              );
            }
          }

          return COMMAND_ALLOWANCE.burst + 1;
        })
    );

    const benClosing = yield* Effect.raceAll(
      benSockets.map(({ client }) =>
        client.next("the flood's close", isClosing)
      )
    );

    const churned: RoomClient[] = [];

    yield* floodedUntil(
      () =>
        churned.some((client) =>
          client.messages.some(isClosingWith("TooManyFrames"))
        ),
      (round) =>
        Effect.gen(function* oneMoreSocket() {
          const { client } = yield* joinAs(base, cyPass, `cy ${round}`);

          for (let frame = 0; frame < UNDER_ONE_SOCKET; frame += 1) {
            yield* client.sendText(paddedPing(PING_FRAME.length + 1));
          }

          churned.push(client);

          return UNDER_ONE_SOCKET;
        })
    );

    const cyClosing = yield* Effect.raceAll(
      churned.map((client) =>
        client.next("a flood's close", isClosingWith("TooManyFrames"))
      )
    );

    expect(benClosing).toStrictEqual(
      codec.server.cases.Closing.make({ reason: "TooManyFrames" })
    );
    expect(cyClosing.reason).toBe("TooManyFrames");
  }).pipe(Effect.provide(harnessHttp))
);

const MARKED_NAME = "Nadia Markerworth";

test(
  "16. a halt logs only the kinds, sequence numbers, and invariants of the batch it refused, and no log line from the room names the room's code, a member, or a secret",
  Effect.gen(function* haltLogs() {
    const base = yield* baseUrl;

    const [hostPass, nadiaPass] = yield* openRoomWith(base, [
      "Host",
      MARKED_NAME,
    ]);

    if (hostPass === undefined || nadiaPass === undefined) {
      return;
    }

    const { code } = hostPass;
    const nadia = yield* joinAs(base, nadiaPass, "nadia");

    yield* nadia.client.send(command("deal", Commands.RequestDeal.make({})));
    yield* nadia.client.next("reply deal", replyTo("deal"));

    const dealt = yield* nadia.client.next(
      "her secret",
      eventsWith(isEvent.SecretDealt)
    );

    const secrets = dealt.events.flatMap((event) =>
      isEvent.SecretDealt(event) ? Option.toArray(event.secret) : []
    );

    const before = yield* inspect(base, code);

    yield* nadia.client.send(command("bad", Commands.Corrupt.make({})));
    yield* nadia.client.waitClosed;

    const after = yield* inspect(base, code);
    const lines = after.logged.join("\n");

    const keys = (yield* roomAnalytics(base, code)).map(
      ({ point }) => point.indexes[0]
    );

    for (const marker of [MARKED_NAME, code, ...secrets]) {
      expect(lines).not.toContain(marker);
      expect(after.faults.join("\n")).not.toContain(marker);
    }

    expect(secrets).toHaveLength(1);
    expect(Option.isSome(after.halted)).toBe(true);
    expect(lines).toContain("room halted on an unsound commit");
    expect(lines).toContain("Joined,SecretDealt,Incremented");
    expect(lines).toContain(`"from":${before.headSeq + 1}`);
    expect(lines).toContain(`"to":${before.headSeq + 3}`);
    expect(lines).toContain("differs from");
    expect(new Set(keys).size).toBe(1);
    expect(
      after.logged.every((line) => line.includes(`"room":"${keys[0]}"`))
    ).toBe(true);
  }).pipe(Effect.provide(harnessHttp))
);

test(
  "17. the waiting pool has a ceiling: past it a new socket pushes out the oldest that has not said hello, however young, so silent sockets cannot pile up in a room",
  Effect.gen(function* waitingCeiling() {
    const base = yield* baseUrl;
    const [anaPass] = yield* openRoomWith(base, ["Ana"]);

    if (anaPass === undefined) {
      return;
    }

    const { code } = anaPass;

    const silent = yield* Effect.all(
      Array.from({ length: PENDING_CEILING + 2 }, (_, index) =>
        connect(base, code, `silent ${index}`)
      ),
      { concurrency: 16 }
    );

    const during = yield* inspect(base, code);

    const pushedOut = yield* Effect.raceAll(
      silent.map((client) =>
        client.next("a push out", isClosingWith("TooManySockets"))
      )
    );

    expect(during.sockets.pending).toBeLessThanOrEqual(PENDING_CEILING);
    expect(pushedOut.reason).toBe("TooManySockets");

    yield* pipe(
      silent,
      Effect.forEach((client) => client.disconnect)
    );
  }).pipe(Effect.provide(harnessHttp))
);
