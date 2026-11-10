import type * as cf from "@cloudflare/workers-types";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import { Effect, Option, Schema } from "effect";

import {
  REPLIES_KEPT_PER_PLAYER,
  STORAGE_SCHEMA_VERSION,
} from "./room-storage.js";
import type { RoomStorage } from "./room-storage.js";

const createTables = [
  `create table if not exists meta (
     id integer primary key check (id = 1),
     schema_version integer not null,
     code text not null,
     halted text
   )`,
  `create table if not exists events (
     seq integer primary key,
     at integer not null,
     event text not null
   )`,
  `create table if not exists commands (
     player text not null,
     id text not null,
     reply text not null,
     primary key (player, id)
   )`,
  `create table if not exists members_auth (
     player text primary key,
     token_hash text not null
   )`,
];

const refusalsTable = `create table if not exists refusals (
   id integer primary key check (id = 1),
   deadline text not null,
   count integer not null,
   retry_at integer not null
 )`;

const commandFaultsTable = `create table if not exists command_faults (
   id integer primary key check (id = 1),
   faults integer not null
 )`;

const CommandFaultRows = Schema.Array(Schema.Struct({ faults: Schema.Int }));

const decodeCommandFaults = Schema.decodeUnknownSync(CommandFaultRows);

const RefusalRows = Schema.Array(
  Schema.Struct({
    count: Schema.Int,
    deadline: Schema.String,
    retry_at: Schema.Int,
  })
);

const MetaRows = Schema.Array(
  Schema.Struct({
    code: RoomCodeSchema,
    halted: Schema.OptionFromNullOr(Schema.String),
    schema_version: Schema.Literal(STORAGE_SCHEMA_VERSION),
  })
);

const EventRows = Schema.Array(
  Schema.Struct({ at: Schema.Int, event: Schema.String, seq: Schema.Int })
);

const ReplyRows = Schema.Array(Schema.Struct({ reply: Schema.String }));

const CountRow = Schema.Struct({ total: Schema.Int });

const CredentialRows = Schema.Array(
  Schema.Struct({ player: PlayerIdSchema, token_hash: Schema.String })
);

const TableRows = Schema.Array(Schema.Struct({ name: Schema.String }));

const decodeMeta = Schema.decodeUnknownSync(MetaRows);

const decodeEvents = Schema.decodeUnknownSync(EventRows);

const decodeReplies = Schema.decodeUnknownSync(ReplyRows);

const decodeCount = Schema.decodeUnknownSync(CountRow);

const decodeCredentials = Schema.decodeUnknownSync(CredentialRows);

const decodeTables = Schema.decodeUnknownSync(TableRows);

const decodeRefusals = Schema.decodeUnknownSync(RefusalRows);

export const sqliteStorage = (
  storage: cf.DurableObjectStorage,
  keepAlive: (pending: Promise<void>) => void
): RoomStorage => {
  const { sql } = storage;

  const isCreated = () =>
    decodeTables(
      sql
        .exec(
          "select name from sqlite_master where type = 'table' and name = 'meta'"
        )
        .toArray()
    ).length > 0;

  return {
    appendEvent: ({ at, event, seq }) => {
      sql.exec(
        "insert into events (seq, at, event) values (?, ?, ?)",
        seq,
        at,
        event
      );
    },
    commandFaults: () => {
      sql.exec(commandFaultsTable);

      return (
        decodeCommandFaults(
          sql.exec("select faults from command_faults").toArray()
        )[0]?.faults ?? 0
      );
    },
    countEventsAfter: (after) =>
      decodeCount(
        sql
          .exec("select count(*) as total from events where seq > ?", after)
          .one()
      ).total,
    countReplies: () =>
      decodeCount(sql.exec("select count(*) as total from commands").one())
        .total,
    create: (code) => {
      for (const statement of createTables) {
        sql.exec(statement);
      }

      sql.exec(
        "insert into meta (id, schema_version, code, halted) values (1, ?, ?, null)",
        STORAGE_SCHEMA_VERSION,
        code
      );
    },
    credentials: () =>
      decodeCredentials(
        sql.exec("select player, token_hash from members_auth").toArray()
      ).map(({ player, token_hash: hash }) => ({ hash, player })),
    eventsAfter: (after) =>
      decodeEvents(
        sql
          .exec(
            "select seq, at, event from events where seq > ? order by seq",
            after
          )
          .toArray()
      ),
    findReply: (player, id) =>
      Option.fromUndefinedOr(
        decodeReplies(
          sql
            .exec(
              "select reply from commands where player = ? and id = ?",
              player,
              id
            )
            .toArray()
        )[0]
      ).pipe(Option.map(({ reply }) => reply)),
    forget: Effect.promise(() => storage.deleteAlarm()).pipe(
      Effect.andThen(Effect.promise(() => storage.deleteAll()))
    ),
    grant: ({ hash, player }) => {
      sql.exec(
        "insert into members_auth (player, token_hash) values (?, ?)",
        player,
        hash
      );
    },
    halt: (reason) => {
      sql.exec("update meta set halted = ? where id = 1", reason);
    },
    meta: () =>
      isCreated()
        ? Option.fromUndefinedOr(
            decodeMeta(
              sql
                .exec("select schema_version, code, halted from meta")
                .toArray()
            )[0]
          ).pipe(Option.map(({ code, halted }) => ({ code, halted })))
        : Option.none(),
    noteCommandFaults: (faults) => {
      sql.exec(commandFaultsTable);
      sql.exec(
        "insert or replace into command_faults (id, faults) values (1, ?)",
        faults
      );
    },
    noteRefusals: (refusals) => {
      sql.exec(refusalsTable);
      sql.exec("delete from refusals");

      for (const { count, deadline, retryAt } of Option.toArray(refusals)) {
        sql.exec(
          "insert into refusals (id, deadline, count, retry_at) values (1, ?, ?, ?)",
          deadline,
          count,
          retryAt
        );
      }
    },
    refusals: () => {
      sql.exec(refusalsTable);

      return Option.fromUndefinedOr(
        decodeRefusals(
          sql.exec("select deadline, count, retry_at from refusals").toArray()
        )[0]
      ).pipe(
        Option.map(({ count, deadline, retry_at: retryAt }) => ({
          count,
          deadline,
          retryAt,
        }))
      );
    },
    setAlarm: (at) => {
      keepAlive(
        Option.match(at, {
          onNone: () => storage.deleteAlarm(),
          onSome: (time) => storage.setAlarm(time),
        })
      );
    },
    storeReply: (player, id, reply) => {
      sql.exec(
        "insert into commands (player, id, reply) values (?, ?, ?)",
        player,
        id,
        reply
      );
      sql.exec(
        `delete from commands where player = ? and rowid not in (
           select rowid from commands where player = ? order by rowid desc limit ?
         )`,
        player,
        player,
        REPLIES_KEPT_PER_PLAYER
      );
    },
    transaction: (write) => storage.transactionSync(write),
  };
};
