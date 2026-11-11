import type * as cf from "@cloudflare/workers-types";
import {
  CloseReasonSchema,
  CommandIdSchema,
  PlayerIdSchema,
} from "@nostakes/protocol";
import { Option, Result, Schema } from "effect";

export const REJECTIONS_KEPT_PER_SOCKET = 8;

export const REJECTION_BYTES_PER_SOCKET = 8192;

export const KeptRejectionSchema = Schema.Struct({
  id: CommandIdSchema,
  reply: Schema.String,
});

export type KeptRejection = typeof KeptRejectionSchema.Type;

export const AttachmentSchema = Schema.TaggedUnion({
  Closed: { reason: CloseReasonSchema },
  Live: {
    heardAt: Schema.Int,
    opened: Schema.Int,
    player: PlayerIdSchema,
    rejected: Schema.Array(KeptRejectionSchema),
  },
  Pending: { acceptedAt: Schema.Int, opened: Schema.Int },
});

export type Attachment = typeof AttachmentSchema.Type;

const decodeAttachment = Schema.decodeUnknownOption(AttachmentSchema);

const encodeAttachment = Schema.encodeSync(AttachmentSchema);

export const attachmentOf = (socket: cf.WebSocket): Option.Option<Attachment> =>
  Result.try(() => decodeAttachment(socket.deserializeAttachment())).pipe(
    Result.getOrElse(() => Option.none())
  );

export const openedOf = (attachment: Attachment) =>
  AttachmentSchema.guards.Closed(attachment)
    ? Option.none()
    : Option.some(attachment.opened);

export const attach = (socket: cf.WebSocket, attachment: Attachment) => {
  socket.serializeAttachment(encodeAttachment(attachment));
};
