import type { RoomRejection } from "@nostakes/room";

const PLAIN = new Map<string, string>([
  ["ActionNotOnSeat", "It is not that player's turn."],
  ["AlreadyAMember", "You are already in this room."],
  ["AlreadyLeaving", "You are already standing up after this hand."],
  ["AlreadySeated", "You already have a seat."],
  ["AlreadyTheHost", "That player is already the host."],
  ["BuyInOutOfRange", "That buy-in is outside the room's range."],
  ["ChipRequestPending", "You already asked for chips. Wait for the host."],
  ["ChipsOverMax", "That would take your stack past the largest buy-in."],
  ["CloseAlreadyQueued", "The room already closes after this hand."],
  ["GameAlready", "The game is already in that state."],
  ["MembersOnly", "Only players in the room can do that."],
  ["NoChipRequest", "That chip request is gone."],
  ["NoSeatRequest", "That seat request is gone."],
  ["NotAMember", "That player is not in the room."],
  ["NotSeated", "You need a seat for that."],
  ["NotTheHost", "Only the host can do that."],
  ["RoomIsClosed", "The room is closed."],
  ["SeatNotFree", "Someone is already in that seat."],
  ["SeatRequestPending", "You already asked for a seat. Wait for the host."],
  ["SettlesAfterHand", "The room settles up when this hand ends."],
  ["TableRejected", "The table did not allow that right now."],
  ["Unbalanced", "The chip count would not balance, so the room refused."],
]);

export const rejectionText = (rejection: RoomRejection) =>
  PLAIN.get(rejection._tag) ?? `The room refused that (${rejection._tag}).`;
