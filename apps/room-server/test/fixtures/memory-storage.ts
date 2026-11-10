import type { CommandId, PlayerId, RoomCode } from "@nostakes/protocol";
import { Effect, Option } from "effect";

import { REPLIES_KEPT_PER_PLAYER } from "../../src/room-storage.js";
import type {
  Credential,
  Refusals,
  RoomMeta,
  RoomStorage,
  StoredEvent,
} from "../../src/room-storage.js";

interface StoredReply {
  readonly player: PlayerId;
  readonly id: CommandId;
  readonly reply: string;
}

interface Tables {
  readonly meta: Option.Option<RoomMeta>;
  readonly events: readonly StoredEvent[];
  readonly replies: readonly StoredReply[];
  readonly credentials: readonly Credential[];
  readonly refusals: Option.Option<Refusals>;
  readonly commandFaults: number;
}

const emptyTables: Tables = {
  commandFaults: 0,
  credentials: [],
  events: [],
  meta: Option.none(),
  refusals: Option.none(),
  replies: [],
};

export const memoryStorage = () => {
  let tables = emptyTables;
  let alarm = Option.none<number>();
  let transactions = 0;

  const write = (change: (current: Tables) => Tables) => {
    tables = change(tables);
  };

  const storage: RoomStorage = {
    appendEvent: (row) => {
      if (tables.events.some(({ seq }) => seq === row.seq)) {
        throw new Error(`UNIQUE constraint failed: events.seq ${row.seq}`);
      }

      write((current) => ({ ...current, events: [...current.events, row] }));
    },
    commandFaults: () => tables.commandFaults,
    countEventsAfter: (after) =>
      tables.events.filter(({ seq }) => seq > after).length,
    countReplies: () => tables.replies.length,
    create: (code: RoomCode) => {
      write((current) => ({
        ...current,
        meta: Option.some({ code, halted: Option.none() }),
      }));
    },
    credentials: () => tables.credentials,
    eventsAfter: (after) =>
      tables.events
        .filter(({ seq }) => seq > after)
        .toSorted((left, right) => left.seq - right.seq),
    findReply: (player, id) =>
      Option.fromUndefinedOr(
        tables.replies.find(
          (stored) => stored.player === player && stored.id === id
        )
      ).pipe(Option.map(({ reply }) => reply)),
    forget: Effect.sync(() => {
      tables = emptyTables;
      alarm = Option.none();
    }),
    grant: (credential) => {
      write((current) => ({
        ...current,
        credentials: [...current.credentials, credential],
      }));
    },
    halt: (reason) => {
      write((current) => ({
        ...current,
        meta: current.meta.pipe(
          Option.map((meta) => ({ ...meta, halted: Option.some(reason) }))
        ),
      }));
    },
    meta: () => tables.meta,
    noteCommandFaults: (commandFaults) => {
      write((current) => ({ ...current, commandFaults }));
    },
    noteRefusals: (refusals) => {
      write((current) => ({ ...current, refusals }));
    },
    refusals: () => tables.refusals,
    setAlarm: (at) => {
      alarm = at;
    },
    storeReply: (player, id, reply) => {
      write((current) => {
        const replies = [...current.replies, { id, player, reply }];
        const mine = replies.filter((stored) => stored.player === player);

        const dropped = new Set(
          mine.slice(0, Math.max(0, mine.length - REPLIES_KEPT_PER_PLAYER))
        );

        return {
          ...current,
          replies: replies.filter((stored) => !dropped.has(stored)),
        };
      });
    },
    transaction: (run) => {
      const before = tables;

      transactions += 1;

      try {
        return run();
      } catch (error) {
        tables = before;
        throw error;
      }
    },
  };

  return {
    alarm: () => alarm,
    storage,
    tables: () => tables,
    transactions: () => transactions,
  };
};
