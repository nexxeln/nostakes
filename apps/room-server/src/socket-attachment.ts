import type * as cf from "@cloudflare/workers-types";
import { PlayerIdSchema } from "@nostakes/protocol";
import { Option, Result, Schema } from "effect";

export const AttachmentSchema = Schema.TaggedUnion({
  Live: { player: PlayerIdSchema },
  Pending: { acceptedAt: Schema.Int },
});

export type Attachment = typeof AttachmentSchema.Type;

const decodeAttachment = Schema.decodeUnknownOption(AttachmentSchema);

const encodeAttachment = Schema.encodeSync(AttachmentSchema);

export const attachmentOf = (socket: cf.WebSocket): Option.Option<Attachment> =>
  Result.try(() => decodeAttachment(socket.deserializeAttachment())).pipe(
    Result.getOrElse(() => Option.none())
  );

export const attach = (socket: cf.WebSocket, attachment: Attachment) => {
  socket.serializeAttachment(encodeAttachment(attachment));
};
