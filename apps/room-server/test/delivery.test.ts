import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import { expect } from "@effect/vitest";
import type { PlayerId, RoomPass } from "@nostakes/protocol";
import {
  SeqSchema,
  FRAME_BURST,
  FRAMES_PER_SECOND,
  SIGNAL_BURST,
} from "@nostakes/protocol";
import { Effect, Option, Redacted, Schema, pipe } from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

import {
  appliedSeqs,
  codec,
  command,
  isEvents,
  isPresence,
  isSignal,
  joinAs,
  lastSeq,
  describeCatchUp as describeCatchUpOf,
  missedIn,
  openRoomWith,
  replyTo,
  signal,
} from "./fixtures/room-client.js";
import type { RoomClient, ToyServerMessage } from "./fixtures/room-client.js";
import { inspect, ToyStack } from "./fixtures/stack.js";
import {
  ToyMemberCommandSchema,
  ToyRedactedSchema,
  ToySignalSchema,
} from "./fixtures/toy-room.js";
import type { ToySignal } from "./fixtures/toy-room.js";

const { afterAll, beforeAll, deploy, destroy, test } = Test.make({
  dev: true,
  providers: Cloudflare.providers(),
  sidecar: false,
  stage: `room_delivery_${process.pid}`,
});

const deployed = beforeAll(deploy(ToyStack));

afterAll(destroy(ToyStack));

const baseUrl = deployed.pipe(
  Effect.flatMap(({ url }) => Effect.fromNullishOr(url)),
  Effect.orDie
);

const Commands = ToyMemberCommandSchema.cases;

const isSecretDealt = ToyRedactedSchema.guards.SecretDealt;

const eventsIn = (message: ToyServerMessage) => {
  if (isEvents(message)) {
    return message.events;
  }

  return codec.server.guards.Welcome(message) ? missedIn(message) : [];
};

const secretsSeenBy = (client: RoomClient) =>
  client.messages.flatMap((message) =>
    eventsIn(message).flatMap((event) =>
      isSecretDealt(event) && Option.isSome(event.secret)
        ? [{ round: event.round, secret: event.secret.value, to: event.to }]
        : []
    )
  );

const roundDealt =
  (round: number) =>
  (
    message: ToyServerMessage
  ): message is typeof codec.server.cases.Events.Type =>
    isEvents(message) &&
    message.events.some(
      (event) => isSecretDealt(event) && event.round === round
    );

const dealRound = (
  dealer: RoomClient,
  id: string,
  round: number,
  live: readonly RoomClient[]
) =>
  Effect.gen(function* dealUntilEveryoneSeesRound() {
    yield* dealer.send(command(id, Commands.RequestDeal.make({})));
    yield* dealer.next(`reply ${id}`, replyTo(id));
    yield* pipe(
      live,
      Effect.forEach((client) =>
        client.next(`round ${round}`, roundDealt(round))
      )
    );
  });

const pace = (index: number) =>
  index < FRAME_BURST - 4
    ? Effect.void
    : Effect.sleep(`${Math.ceil(1000 / (FRAMES_PER_SECOND - 2))} millis`);

test(
  "4. secrecy: across reconnects and catch-up no socket receives another member's secret",
  Effect.gen(function* secrecy() {
    const base = yield* baseUrl;
    const passes = yield* openRoomWith(base, ["Ana", "Ben", "Cy", "Dee"]);
    const [anaPass, benPass, cyPass, deePass] = passes;

    if (
      anaPass === undefined ||
      benPass === undefined ||
      cyPass === undefined ||
      deePass === undefined
    ) {
      return;
    }

    const ana = yield* joinAs(base, anaPass, "ana");
    const ben = yield* joinAs(base, benPass, "ben");
    const cy = yield* joinAs(base, cyPass, "cy");
    const dee = yield* joinAs(base, deePass, "dee");
    const deeAgain = yield* joinAs(base, deePass, "dee second device");

    const clients: { pass: RoomPass; client: RoomClient }[] = [
      { client: ana.client, pass: anaPass },
      { client: ben.client, pass: benPass },
      { client: cy.client, pass: cyPass },
      { client: dee.client, pass: deePass },
      { client: deeAgain.client, pass: deePass },
    ];

    yield* dealRound(
      ana.client,
      "deal-1",
      1,
      clients.map(({ client }) => client)
    );

    const cySeen = lastSeq(cy.client);

    yield* cy.client.disconnect;
    yield* dealRound(ben.client, "deal-2", 2, [
      ana.client,
      ben.client,
      dee.client,
      deeAgain.client,
    ]);

    const cyBack = yield* joinAs(
      base,
      cyPass,
      "cy back",
      Option.some(SeqSchema.make(cySeen))
    );

    clients.push({ client: cyBack.client, pass: cyPass });

    yield* dealRound(dee.client, "deal-3", 3, [
      ana.client,
      ben.client,
      cyBack.client,
      dee.client,
      deeAgain.client,
    ]);

    const benLate = yield* joinAs(
      base,
      benPass,
      "ben from the start",
      Option.some(SeqSchema.make(0))
    );

    clients.push({ client: benLate.client, pass: benPass });

    const owned = new Map(
      clients.flatMap(({ client }) =>
        secretsSeenBy(client).map(
          ({ round, secret, to }) => [`${to}:${round}`, { secret, to }] as const
        )
      )
    );

    expect(owned.size).toBe(12);
    expect(missedIn(cyBack.welcome).filter(isSecretDealt).length).toBe(4);
    expect(missedIn(benLate.welcome).filter(isSecretDealt).length).toBe(12);

    for (const { client, pass } of clients) {
      expect(secretsSeenBy(client).every(({ to }) => to === pass.player)).toBe(
        true
      );

      const text = client.frames.join("\n");

      expect(
        [...owned.values()].filter(
          ({ secret, to }) => to !== pass.player && text.includes(secret)
        )
      ).toEqual([]);

      for (const other of passes) {
        expect(text.includes(Redacted.value(other.token))).toBe(false);
      }
    }
  }).pipe(Effect.provide(FetchHttpClient.layer))
);

test(
  "5. no gaps: every viewer applies every sequence number once, in order, through a reconnect mid-burst",
  Effect.gen(function* noGaps() {
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

    const ana = yield* joinAs(base, anaPass, "ana");
    const ben = yield* joinAs(base, benPass, "ben");
    const cy = yield* joinAs(base, cyPass, "cy");
    const start = ana.welcome.seq;
    const bursts = 30;
    const benFirst = ben.client;
    let benSecond = ben.client;
    let benCut = 0;

    for (let index = 0; index < bursts; index += 1) {
      yield* pace(index);
      yield* ana.client.send(
        command(`burst-${index}`, Commands.Increment.make({ times: 3 }))
      );

      if (index === 12) {
        benCut = lastSeq(benFirst);

        yield* benFirst.disconnect;

        const back = yield* joinAs(
          base,
          benPass,
          "ben back",
          Option.some(SeqSchema.make(benCut))
        );

        benSecond = back.client;
      }
    }

    yield* ana.client.next(
      `reply burst-${bursts - 1}`,
      replyTo(`burst-${bursts - 1}`)
    );

    const head = (yield* inspect(base, anaPass.code)).headSeq;

    yield* pipe(
      [cy.client, benSecond],
      Effect.forEach((client) =>
        client.next(
          "last events",
          (message): message is typeof codec.server.cases.Events.Type =>
            isEvents(message) && message.to === head
        )
      )
    );

    const expected = Array.from(
      { length: head - start },
      (_, index) => start + index + 1
    );

    expect(head).toBe(start + bursts * 3);
    expect(benCut).toBeGreaterThan(start);
    expect(appliedSeqs(cy.client)).toEqual(expected);
    expect(appliedSeqs(ana.client)).toEqual(expected);
    expect([
      ...appliedSeqs(benFirst).filter((seq) => seq <= benCut),
      ...appliedSeqs(benSecond),
    ]).toEqual(expected);
  }).pipe(Effect.provide(FetchHttpClient.layer))
);

const DEVICES_PER_MEMBER = 4;

const COMMANDS_PER_CLIENT = 50;

const sendAll = (client: RoomClient, prefix: string) =>
  Effect.gen(function* sendEveryCommand() {
    for (let index = 0; index < COMMANDS_PER_CLIENT; index += 1) {
      yield* pace(index);
      yield* client.send(
        command(`${prefix}-${index}`, Commands.Increment.make({ times: 1 }))
      );
    }

    return yield* client.next(
      `reply ${prefix}-${COMMANDS_PER_CLIENT - 1}`,
      replyTo(`${prefix}-${COMMANDS_PER_CLIENT - 1}`)
    );
  });

const eventLog = (client: RoomClient) =>
  client.messages.flatMap((message) =>
    isEvents(message)
      ? message.events.map((event, index) => ({
          event: JSON.stringify(Schema.encodeSync(ToyRedactedSchema)(event)),
          seq: message.from + index,
        }))
      : []
  );

test(
  "13. order under load: three members on four devices each send 600 commands in all and every socket sees the stored order",
  Effect.gen(function* underLoad() {
    const base = yield* baseUrl;
    const passes = yield* openRoomWith(base, ["Ana", "Ben", "Cy"]);

    const devices = passes.flatMap((pass) =>
      Array.from({ length: DEVICES_PER_MEMBER }, () => pass)
    );

    const clients = yield* pipe(
      devices,
      Effect.forEach((pass, index) =>
        joinAs(base, pass, `sender ${index}`).pipe(
          Effect.map(({ client }) => client)
        )
      )
    );

    const code = passes[0]?.code;

    if (code === undefined) {
      return;
    }

    const start = (yield* inspect(base, code)).headSeq;

    const senders = clients.map((client, index) =>
      sendAll(client, `load-${index}`)
    );

    const replies = yield* Effect.all(senders, { concurrency: "unbounded" });

    const head = start + COMMANDS_PER_CLIENT * clients.length;

    yield* pipe(
      clients,
      Effect.forEach((client) =>
        client.next(
          "final events",
          (message): message is typeof codec.server.cases.Events.Type =>
            isEvents(message) && message.to === head
        )
      )
    );

    const stored = yield* inspect(base, code);

    const expected = stored.events.slice(start).map((event, index) => ({
      event,
      seq: start + index + 1,
    }));

    expect(
      replies.every((reply) => codec.reply.guards.Accepted(reply.result))
    ).toBe(true);
    expect(stored.headSeq).toBe(head);
    expect(stored.seqs).toEqual(
      Array.from({ length: head }, (_, index) => index + 1)
    );

    for (const client of clients) {
      expect(eventLog(client)).toEqual(expected);
    }
  }).pipe(Effect.provide(FetchHttpClient.layer)),
  { timeout: 60_000 }
);

const Signals = ToySignalSchema.cases;

const wave = (count: number) => signal(Signals.Wave.make({ count }));

const point = signal(Signals.Point.make({}));

const describeSignal = (
  names: ReadonlyMap<PlayerId, string>,
  from: PlayerId,
  sent: ToySignal
) =>
  `${names.get(from) ?? from} ${ToySignalSchema.match(sent, {
    Point: () => "points",
    Wave: ({ count }) => `waves ${count}`,
  })}`;

const signalsSeenBy = (
  client: RoomClient,
  names: ReadonlyMap<PlayerId, string>
) =>
  client.messages.flatMap((message) =>
    isSignal(message)
      ? [describeSignal(names, message.from, message.signal)]
      : []
  );

const signalArrived =
  (from: PlayerId, count: number) =>
  (
    message: ToyServerMessage
  ): message is typeof codec.server.cases.Signal.Type =>
    isSignal(message) &&
    message.from === from &&
    ToySignalSchema.guards.Wave(message.signal) &&
    message.signal.count === count;

const awaitSignal = (
  clients: readonly RoomClient[],
  from: PlayerId,
  count: number
) =>
  pipe(
    clients,
    Effect.forEach((client) =>
      client.next(`wave ${count}`, signalArrived(from, count))
    )
  );

test(
  "signals: a wave reaches every other socket in its room and never its sender or another room, is not stored, and is not replayed to a socket that reconnects",
  Effect.gen(function* relayed() {
    const base = yield* baseUrl;
    const passes = yield* openRoomWith(base, ["Ana", "Ben", "Cy"]);
    const elsewhere = yield* openRoomWith(base, ["Dee", "Eli"]);
    const [anaPass, benPass, cyPass] = passes;
    const [deePass, eliPass] = elsewhere;

    if (
      anaPass === undefined ||
      benPass === undefined ||
      cyPass === undefined ||
      deePass === undefined ||
      eliPass === undefined
    ) {
      return;
    }

    const names = new Map(
      [anaPass, benPass, cyPass, deePass, eliPass].map(
        (pass, index) =>
          [
            pass.player,
            ["Ana", "Ben", "Cy", "Dee", "Eli"][index] ?? "",
          ] as const
      )
    );

    const ana = yield* joinAs(base, anaPass, "ana");
    const ben = yield* joinAs(base, benPass, "ben");
    const cy = yield* joinAs(base, cyPass, "cy");
    const dee = yield* joinAs(base, deePass, "dee");
    const eli = yield* joinAs(base, eliPass, "eli");
    const before = yield* inspect(base, anaPass.code);

    yield* ana.client.send(wave(1));
    yield* awaitSignal([ben.client, cy.client], anaPass.player, 1);

    yield* eli.client.send(wave(2));
    yield* awaitSignal([dee.client], eliPass.player, 2);

    yield* ana.client.send(
      command("after-wave", Commands.Increment.make({ times: 1 }))
    );

    const increment = yield* ana.client.next(
      "reply after the wave",
      replyTo("after-wave")
    );

    const benSeen = codec.reply.guards.Accepted(increment.result)
      ? increment.result.seq
      : 0;

    yield* ben.client.next(
      "the increment",
      (message): message is typeof codec.server.cases.Events.Type =>
        isEvents(message) && message.to === benSeen
    );
    yield* ben.client.disconnect;
    yield* ana.client.next(
      "presence without Ben",
      (message): message is typeof codec.server.cases.Presence.Type =>
        isPresence(message) && !message.connected.includes(benPass.player)
    );
    yield* ana.client.send(wave(3));
    yield* awaitSignal([cy.client], anaPass.player, 3);

    const benBack = yield* joinAs(
      base,
      benPass,
      "ben back",
      Option.some(SeqSchema.make(benSeen))
    );

    yield* cy.client.send(wave(4));
    yield* awaitSignal([ana.client, benBack.client], cyPass.player, 4);

    const after = yield* inspect(base, anaPass.code);

    expect(signalsSeenBy(ana.client, names)).toEqual(["Cy waves 4"]);
    expect(signalsSeenBy(ben.client, names)).toEqual(["Ana waves 1"]);
    expect(signalsSeenBy(benBack.client, names)).toEqual(["Cy waves 4"]);
    expect(signalsSeenBy(cy.client, names)).toEqual([
      "Ana waves 1",
      "Ana waves 3",
    ]);
    expect(signalsSeenBy(dee.client, names)).toEqual(["Eli waves 2"]);
    expect(signalsSeenBy(eli.client, names)).toEqual([]);
    expect(describeCatchUpOf(benBack.welcome)).toBe("UpToDate");
    expect(after.headSeq).toBe(before.headSeq + 1);
    expect(after.events.filter((event) => event.includes("Wave"))).toEqual([]);
    expect(after.replies).toBe(before.replies + 1);
  }).pipe(Effect.provide(FetchHttpClient.layer))
);

test(
  "signal limit: a burst past the limit loses its last waves and keeps its socket, and a point from a member without the turn is dropped",
  Effect.gen(function* limited() {
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

    const names = new Map([
      [anaPass.player, "Ana"],
      [benPass.player, "Ben"],
      [cyPass.player, "Cy"],
    ]);

    const ana = yield* joinAs(base, anaPass, "ana");
    const ben = yield* joinAs(base, benPass, "ben");
    const cy = yield* joinAs(base, cyPass, "cy");
    const burst = SIGNAL_BURST + 2;

    expect(burst + 2).toBeLessThanOrEqual(FRAME_BURST);

    for (let count = 1; count <= burst; count += 1) {
      yield* ana.client.send(wave(count));
    }

    yield* ana.client.send(
      command("after-burst", Commands.Increment.make({ times: 1 }))
    );

    const reply = yield* ana.client.next(
      "reply after the burst",
      replyTo("after-burst")
    );

    yield* ben.client.next("the increment after the burst", isEvents);

    const relayedWaves = signalsSeenBy(ben.client, names);

    yield* cy.client.send(
      command("turn", Commands.StartTurn.make({ ms: 60_000 }))
    );
    yield* cy.client.next("reply to the turn", replyTo("turn"));
    yield* ben.client.send(point);
    yield* ben.client.send(wave(9));
    yield* cy.client.send(point);
    yield* cy.client.send(wave(10));
    yield* awaitSignal([ana.client], benPass.player, 9);
    yield* awaitSignal([ana.client], cyPass.player, 10);

    const seenFrom = (name: string) =>
      signalsSeenBy(ana.client, names).filter((seen) =>
        seen.startsWith(`${name} `)
      );

    expect(codec.reply.guards.Accepted(reply.result)).toBe(true);
    expect(yield* ana.client.closed).toEqual(Option.none());
    expect(relayedWaves.length).toBeGreaterThanOrEqual(SIGNAL_BURST);
    expect(relayedWaves.length).toBeLessThan(burst);
    expect(relayedWaves).toEqual(
      Array.from(
        { length: relayedWaves.length },
        (_, index) => `Ana waves ${index + 1}`
      )
    );
    expect(seenFrom("Ben")).toEqual(["Ben waves 9"]);
    expect(seenFrom("Cy")).toEqual(["Cy points", "Cy waves 10"]);
  }).pipe(Effect.provide(FetchHttpClient.layer))
);
