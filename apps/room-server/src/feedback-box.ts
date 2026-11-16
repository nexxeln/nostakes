import * as Cloudflare from "@alchemy.run/cloudflare";
import { Clock, Effect, Option, Schema } from "effect";

import {
  FeedbackNoteSchema,
  FeedbackPageSchema,
  FeedbackReadSchema,
  MOST_NOTES_KEPT,
  NOTES_PER_READ,
} from "./feedback-wire.js";

export const FEEDBACK_BOX_NAME = "feedback";

const createNotes = `create table if not exists notes (
   id integer primary key autoincrement,
   at integer not null,
   body text not null
 )`;

const NoteRows = Schema.Array(
  Schema.Struct({ at: Schema.Int, body: Schema.String, id: Schema.Int })
);

const decodeRows = Schema.decodeUnknownSync(NoteRows);

const encodeBody = Schema.encodeSync(Schema.fromJsonString(FeedbackNoteSchema));

const decodeBody = Schema.decodeUnknownOption(
  Schema.fromJsonString(FeedbackNoteSchema)
);

const decodeNote = Schema.decodeUnknownEffect(FeedbackNoteSchema);

const decodeRead = Schema.decodeUnknownEffect(FeedbackReadSchema);

const encodePage = Schema.encodeSync(FeedbackPageSchema);

export const feedbackBox = Cloudflare.DurableObjectState.pipe(
  Effect.map((state) =>
    Effect.sync(() => {
      const { sql } = state.raw.storage;

      sql.exec(createNotes);

      const keep = (input: typeof FeedbackNoteSchema.Encoded) =>
        Effect.gen(function* keepNote() {
          const decoded = yield* decodeNote(input).pipe(Effect.option);

          if (Option.isNone(decoded)) {
            return false;
          }

          const note = decoded.value;
          const at = yield* Clock.currentTimeMillis;

          sql.exec(
            "insert into notes (at, body) values (?, ?)",
            at,
            encodeBody(note)
          );
          sql.exec(
            "delete from notes where id <= (select max(id) from notes) - ?",
            MOST_NOTES_KEPT
          );

          return true;
        });

      const read = (input: typeof FeedbackReadSchema.Encoded) =>
        Effect.gen(function* readNotes() {
          const { after, since } = yield* decodeRead(input).pipe(
            Effect.orElseSucceed(() => ({
              after: 0,
              since: Number.MAX_SAFE_INTEGER,
            }))
          );

          const rows = decodeRows(
            sql
              .exec(
                "select id, at, body from notes where id > ? and at >= ? order by id limit ?",
                after,
                since,
                NOTES_PER_READ + 1
              )
              .toArray()
          );

          const page = rows.slice(0, NOTES_PER_READ);

          return encodePage({
            more: rows.length > NOTES_PER_READ,
            notes: page.flatMap(({ at, body, id }) =>
              Option.toArray(
                decodeBody(body).pipe(
                  Option.map((note) => ({ ...note, at, id }))
                )
              )
            ),
          });
        });

      return { keep, read };
    })
  )
);

export default class FeedbackBox extends Cloudflare.DurableObject<FeedbackBox>()(
  "FeedbackBox",
  feedbackBox
) {}
