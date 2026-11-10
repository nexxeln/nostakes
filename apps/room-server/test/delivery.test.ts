import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import { expect } from "@effect/vitest";
import type { RoomPass } from "@nostakes/protocol";
import { SeqSchema, FRAME_BURST, FRAMES_PER_SECOND } from "@nostakes/protocol";
import { Effect, Option, Redacted, Schema, pipe } from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

import {
  appliedSeqs,
  codec,
  command,
  isEvents,
  joinAs,
  lastSeq,
  openRoomWith,
  replyTo,
} from "./fixtures/room-client.js";
import type { RoomClient, ToyServerMessage } from "./fixtures/room-client.js";
import { inspect, ToyStack } from "./fixtures/stack.js";
import {
  ToyMemberCommandSchema,
  ToyRedactedSchema,
} from "./fixtures/toy-room.js";

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

  return codec.server.guards.Welcome(message) ? message.missed : [];
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
    expect(cyBack.welcome.missed.filter(isSecretDealt).length).toBe(4);
    expect(benLate.welcome.missed.filter(isSecretDealt).length).toBe(12);

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
