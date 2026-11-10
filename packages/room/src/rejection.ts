import { Schema } from "effect";

import { AlreadyAMember } from "./rejections/already-a-member.js";
import { AlreadyTheHost } from "./rejections/already-the-host.js";
import { MembersOnly } from "./rejections/members-only.js";
import { NotAMember } from "./rejections/not-a-member.js";
import { NotTheHost } from "./rejections/not-the-host.js";
import { RoomIsClosed } from "./rejections/room-is-closed.js";
import { ServerOnly } from "./rejections/server-only.js";

export const RoomRejectionSchema = Schema.Union([
  AlreadyAMember,
  AlreadyTheHost,
  MembersOnly,
  NotAMember,
  NotTheHost,
  RoomIsClosed,
  ServerOnly,
]);

export type RoomRejection = typeof RoomRejectionSchema.Type;

export { AlreadyAMember } from "./rejections/already-a-member.js";

export { AlreadyTheHost } from "./rejections/already-the-host.js";

export { MembersOnly } from "./rejections/members-only.js";

export { NotAMember } from "./rejections/not-a-member.js";

export { NotTheHost } from "./rejections/not-the-host.js";

export { RoomIsClosed } from "./rejections/room-is-closed.js";

export { ServerOnly } from "./rejections/server-only.js";
