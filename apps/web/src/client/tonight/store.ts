import { Context, Effect, Layer, Option, Schema } from "effect";

import { StoreFailed } from "./store-failed.js";

export { StoreFailed } from "./store-failed.js";

export const KEPT_DAYS = 30;

export const KEPT_FOR_MS = KEPT_DAYS * 24 * 60 * 60 * 1000;

export const MOST_KEPT_BYTES = 200 * 1024 * 1024;

export const FileKindSchema = Schema.Literals([
  "Chat",
  "Clip",
  "Reel",
  "Slip",
  "Story",
]);

export type FileKind = typeof FileKindSchema.Type;

export interface KeptMoment {
  readonly asked: boolean;
  readonly at: number;
  readonly hand: number;
  readonly room: string;
  readonly source: string;
}

export interface KeptFile {
  readonly at: number;
  readonly blob: Blob;
  readonly hand: number;
  readonly kind: FileKind;
  readonly name: string;
  readonly room: string;
}

const KeptMomentSchema = Schema.Struct({
  asked: Schema.Boolean,
  at: Schema.Finite,
  hand: Schema.Int,
  room: Schema.String,
  source: Schema.String,
});

const StoredFileSchema = Schema.Struct({
  at: Schema.Finite,
  bytes: Schema.instanceOf(ArrayBuffer),
  hand: Schema.Int,
  kind: FileKindSchema,
  name: Schema.String,
  room: Schema.String,
  type: Schema.String,
});

type StoredFile = typeof StoredFileSchema.Type;

const keptOf = (stored: StoredFile): KeptFile => ({
  at: stored.at,
  blob: new File([stored.bytes], stored.name, { type: stored.type }),
  hand: stored.hand,
  kind: stored.kind,
  name: stored.name,
  room: stored.room,
});

const storedOf = (file: KeptFile) =>
  Effect.tryPromise({
    catch: failedTo("read a file to keep"),
    try: () => file.blob.arrayBuffer(),
  }).pipe(
    Effect.map((bytes): StoredFile => ({
      at: file.at,
      bytes,
      hand: file.hand,
      kind: file.kind,
      name: file.name,
      room: file.room,
      type: file.blob.type,
    }))
  );

export class MomentStore extends Context.Service<
  MomentStore,
  {
    readonly files: (
      room: string
    ) => Effect.Effect<readonly KeptFile[], StoreFailed>;
    readonly forget: (before: number) => Effect.Effect<void, StoreFailed>;
    readonly keep: (moment: KeptMoment) => Effect.Effect<void, StoreFailed>;
    readonly keepFile: (file: KeptFile) => Effect.Effect<void, StoreFailed>;
    readonly moments: (
      room: string
    ) => Effect.Effect<readonly KeptMoment[], StoreFailed>;
  }
>()("nostakes/MomentStore") {}

const NAME = "nostakes-tonight";

const MOMENTS = "moments";

const FILES = "files";

const failedTo = (step: string) => (cause: unknown) =>
  new StoreFailed({
    detail:
      cause instanceof Error
        ? `${cause.name}: ${cause.message}`
        : String(cause),
    step,
  });

const settled = <A>(step: string, request: () => IDBRequest<A>) =>
  Effect.callback<A, StoreFailed>((resume) => {
    try {
      const asked = request();

      asked.addEventListener("success", () => {
        resume(Effect.succeed(asked.result));
      });
      asked.addEventListener("error", () => {
        resume(Effect.fail(failedTo(step)(asked.error)));
      });
    } catch (error) {
      resume(Effect.fail(failedTo(step)(error)));
    }
  });

const committed = (
  database: IDBDatabase,
  name: string,
  step: string,
  write: (store: IDBObjectStore) => IDBRequest
) =>
  Effect.callback<"Committed", StoreFailed>((resume) => {
    try {
      const transaction = database.transaction(name, "readwrite");

      transaction.addEventListener("complete", () => {
        resume(Effect.succeed("Committed"));
      });
      transaction.addEventListener("error", () => {
        resume(Effect.fail(failedTo(step)(transaction.error)));
      });
      transaction.addEventListener("abort", () => {
        resume(Effect.fail(failedTo(step)(transaction.error)));
      });
      write(transaction.objectStore(name));
    } catch (error) {
      resume(Effect.fail(failedTo(step)(error)));
    }
  }).pipe(Effect.asVoid);

const opened = Effect.callback<IDBDatabase, StoreFailed>((resume) => {
  try {
    const asked = globalThis.indexedDB.open(NAME, 1);

    asked.addEventListener("upgradeneeded", () => {
      const database = asked.result;

      const moments = database.createObjectStore(MOMENTS, {
        keyPath: ["room", "hand"],
      });

      const files = database.createObjectStore(FILES, {
        keyPath: ["room", "hand", "kind"],
      });

      moments.createIndex("room", "room");
      files.createIndex("room", "room");
    });
    asked.addEventListener("success", () => {
      resume(Effect.succeed(asked.result));
    });
    asked.addEventListener("error", () => {
      resume(Effect.fail(failedTo("open the store")(asked.error)));
    });
    asked.addEventListener("blocked", () => {
      resume(
        Effect.fail(
          failedTo("open the store")("another tab holds an older store")
        )
      );
    });
  } catch (error) {
    resume(Effect.fail(failedTo("open the store")(error)));
  }
});

const decodedAll = <A>(schema: Schema.Codec<A>, rows: readonly unknown[]) =>
  rows.flatMap((row) => {
    const decoded = Schema.decodeUnknownOption(schema)(row);

    return Option.isSome(decoded) ? [decoded.value] : [];
  });

const storeOf = (
  database: IDBDatabase,
  name: string,
  mode: IDBTransactionMode
) => database.transaction(name, mode).objectStore(name);

const sizeOf = (file: StoredFile) => file.bytes.byteLength;

const storeWith = (database: IDBDatabase): MomentStore["Service"] => {
  const allFiles = settled("read the kept files", () =>
    storeOf(database, FILES, "readonly").getAll()
  ).pipe(Effect.map((rows) => decodedAll(StoredFileSchema, rows)));

  const deleteFile = (file: StoredFile) =>
    settled("drop a kept file", () =>
      storeOf(database, FILES, "readwrite").delete([
        file.room,
        file.hand,
        file.kind,
      ])
    );

  const bounded = allFiles.pipe(
    Effect.flatMap((files) => {
      const oldestFirst = files.toSorted((left, right) => left.at - right.at);
      let total = oldestFirst.reduce((sum, file) => sum + sizeOf(file), 0);
      const dropped: StoredFile[] = [];

      for (const file of oldestFirst) {
        if (total <= MOST_KEPT_BYTES) {
          break;
        }

        dropped.push(file);
        total -= sizeOf(file);
      }

      return Effect.forEach(dropped, deleteFile, { discard: true });
    })
  );

  return {
    files: (room) =>
      settled("read the kept files", () =>
        storeOf(database, FILES, "readonly").index("room").getAll(room)
      ).pipe(
        Effect.map((rows) => decodedAll(StoredFileSchema, rows).map(keptOf))
      ),
    forget: (before) =>
      Effect.all([
        allFiles.pipe(
          Effect.flatMap((files) =>
            Effect.forEach(
              files.filter((file) => file.at < before),
              deleteFile,
              { discard: true }
            )
          )
        ),
        settled("read the kept moments", () =>
          storeOf(database, MOMENTS, "readonly").getAll()
        ).pipe(
          Effect.map((rows) => decodedAll(KeptMomentSchema, rows)),
          Effect.flatMap((moments) =>
            Effect.forEach(
              moments.filter((moment) => moment.at < before),
              (moment) =>
                settled("drop a kept moment", () =>
                  storeOf(database, MOMENTS, "readwrite").delete([
                    moment.room,
                    moment.hand,
                  ])
                ),
              { discard: true }
            )
          )
        ),
      ]).pipe(Effect.asVoid),
    keep: (moment) =>
      committed(database, MOMENTS, "keep a moment", (moments) =>
        moments.put(moment)
      ),
    keepFile: (file) =>
      storedOf(file).pipe(
        Effect.flatMap((stored) =>
          committed(database, FILES, "keep a file", (files) =>
            files.put(stored)
          )
        ),
        Effect.andThen(bounded)
      ),
    moments: (room) =>
      settled("read the kept moments", () =>
        storeOf(database, MOMENTS, "readonly").index("room").getAll(room)
      ).pipe(Effect.map((rows) => decodedAll(KeptMomentSchema, rows))),
  };
};

export const liveMomentStore = Layer.effect(
  MomentStore,
  opened.pipe(Effect.map(storeWith))
);

export const momentStoreIn = (database: IDBDatabase) =>
  Layer.succeed(MomentStore, storeWith(database));
