import { cardText } from "@nostakes/engine";
import type { Action, LegalActions, Rejection } from "@nostakes/engine";
import type { PlayerId } from "@nostakes/protocol";
import { RoomViews } from "@nostakes/room";
import type { RoomRejection, RoomView } from "@nostakes/room";
import { Match, Option } from "effect";

import { isYou, nameOf } from "./room.js";

interface Voice {
  readonly name: (player: PlayerId) => string;
  readonly subject: (player: PlayerId) => string;
  readonly possessive: (player: PlayerId) => string;
  readonly seatName: (seat: number) => string;
  readonly isYou: (player: PlayerId) => boolean;
}

const chips = (amount: number) =>
  `${amount.toLocaleString("en-US")} ${amount === 1 ? "chip" : "chips"}`;

const seatLabel = (seat: number) => `seat ${seat + 1}`;

const voiceFor = (view: Option.Option<RoomView>): Voice => {
  const known = (player: PlayerId) =>
    Option.exists(view, (seen) => isYou(seen, player));

  const name = (player: PlayerId) =>
    Option.match(view, {
      onNone: () => "Someone",
      onSome: (seen) => nameOf(seen, player),
    });

  const seated = (seat: number) =>
    view.pipe(
      Option.filter(RoomViews.$is("Open")),
      Option.flatMap((seen) => Option.fromNullishOr(seen.seats[seat])),
      Option.flatMap(({ occupant }) => occupant),
      Option.map(({ player }) => player)
    );

  return {
    isYou: known,
    name: (player) => (known(player) ? "you" : name(player)),
    possessive: (player) => (known(player) ? "your" : `${name(player)}'s`),
    seatName: (seat) =>
      Option.match(seated(seat), {
        onNone: () => seatLabel(seat),
        onSome: (player) => (known(player) ? "you" : name(player)),
      }),
    subject: (player) => (known(player) ? "You" : name(player)),
  };
};

const capital = (text: string) =>
  `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

const illegalText = (action: Action, legal: LegalActions) =>
  Match.value(action).pipe(
    Match.tagsExhaustive({
      Call: () => "There is nothing to call.",
      Check: () =>
        Option.match(legal.call, {
          onNone: () => "You cannot check right now.",
          onSome: (owed) =>
            `You cannot check. It costs ${chips(owed)} to call.`,
        }),
      Fold: () => "You cannot fold right now.",
      RaiseTo: ({ to }) =>
        Option.match(legal.raise, {
          onNone: () => "You cannot raise here.",
          onSome: ({ maxTo, minTo }) =>
            minTo === maxTo
              ? `You can only go all in, to ${chips(maxTo)}.`
              : `A raise here goes to between ${chips(minTo)} and ${chips(maxTo)}, not ${chips(to)}.`,
        }),
    })
  );

const STRADDLE_TEXT = {
  ButtonStraddleOff: "This room has no straddle on the button.",
  CannotCover: "You do not have the chips to straddle.",
  HeadsUp: "There is no straddle heads-up.",
  OutOfTurn: "Straddles go in turn, and it is not your turn to straddle.",
  PostingToEnter:
    "You are posting to come in this hand, so you cannot straddle.",
  TooMany: "This hand already has as many straddles as the room allows.",
  UnderTheGunOff: "This room has no straddle under the gun.",
} as const;

const handRunning = (view: Option.Option<RoomView>) =>
  Option.exists(view, (seen) =>
    RoomViews.$match(seen, {
      Closed: () => false,
      Open: ({ hand }) => Option.isSome(hand),
    })
  );

const tableText = (
  rejection: Rejection,
  voice: Voice,
  nextHandDealt: boolean
): string =>
  Match.value(rejection).pipe(
    Match.tagsExhaustive({
      AmountNotPositive: () => "Add at least one chip.",
      CardAlreadyPublic: ({ card }) =>
        `The ${cardText(card)} is already shown.`,
      CardNotHeld: ({ card }) => `You did not hold the ${cardText(card)}.`,
      ChipLimitExceeded: ({ amount, available, seat }) =>
        `That takes ${chips(amount)}, and ${voice.seatName(seat)} ${voice.seatName(seat) === "you" ? "have" : "has"} ${chips(available)}.`,
      FoldedSeatCannotHunt: () =>
        "Only players still in at the end may hunt the rabbit in this room.",
      HandInProgress: () => "Wait for this hand to end.",
      IllegalAction: ({ action, legal }) => illegalText(action, legal),
      NoBettingRound: () => "Nobody is betting right now.",
      NoRunChoiceOwed: () =>
        "Nobody is choosing how many times to run it right now.",
      NoShowdownChoiceOwed: () => "It is not your turn to show or muck.",
      NotEnoughPlayers: () =>
        "A hand needs at least two players with chips who are not sitting out.",
      NotInLastHand: () =>
        nextHandDealt
          ? "The next hand is already dealt, so the last one is closed."
          : "You were not dealt into the last hand.",
      NotYourTurn: ({ toAct }) =>
        voice.seatName(toAct) === "you"
          ? "Wait a moment, the table is catching up."
          : `It is ${voice.seatName(toAct)}'s turn.`,
      NothingToHunt: () => "The whole board was dealt, so there is no rabbit.",
      PlayerAlreadySeated: ({ player }) =>
        `${voice.subject(player)} already ${voice.isYou(player) ? "have" : "has"} a seat.`,
      RabbitAlreadyHunted: () => "Someone already hunted the rabbit.",
      RabbitHuntOff: () => "This room does not hunt rabbits.",
      RunsOutOfRange: ({ maxRuns }) =>
        `This room runs it at most ${maxRuns} ${maxRuns === 1 ? "time" : "times"}.`,
      SeatEmpty: ({ seat }) => `${capital(seatLabel(seat))} is empty.`,
      SeatInHand: ({ seat }) =>
        `${capital(voice.seatName(seat))} ${voice.seatName(seat) === "you" ? "are" : "is"} in the hand right now.`,
      SeatTaken: ({ occupant, seat }) =>
        `${voice.subject(occupant)} already ${voice.isYou(occupant) ? "sit" : "sits"} in ${seatLabel(seat)}.`,
      ShowBothCards: () => "This room shows both cards or none.",
      StraddleAboveChipLimit: () =>
        "That straddle is more than the table allows.",
      StraddleNotAllowed: ({ reason }) => STRADDLE_TEXT[reason],
      WinningHandMustTable: () => "A hand that wins a pot has to be shown.",
    })
  );

const DEALER_BUSY = "The dealer is not ready for that yet.";

export const rejectionText = (
  rejection: RoomRejection,
  view: Option.Option<RoomView>
): string => {
  const voice = voiceFor(view);

  return Match.value(rejection).pipe(
    Match.tagsExhaustive({
      ActionNotOnSeat: ({ player }) =>
        `It is not ${voice.possessive(player)} turn, so there is nothing to do for ${voice.name(player)}.`,
      AlreadyAMember: ({ player }) =>
        `${voice.subject(player)} ${voice.isYou(player) ? "are" : "is"} already in this room.`,
      AlreadyLeaving: ({ player }) =>
        `${voice.subject(player)} already ${voice.isYou(player) ? "stand" : "stands"} up when this hand ends.`,
      AlreadySeated: ({ player, seat }) =>
        `${voice.subject(player)} already ${voice.isYou(player) ? "sit" : "sits"} in ${seatLabel(seat)}.`,
      AlreadyTheHost: ({ player }) =>
        `${voice.subject(player)} ${voice.isYou(player) ? "are" : "is"} already the host.`,
      BeaconRejected: () => DEALER_BUSY,
      BeaconRoundWrong: () => DEALER_BUSY,
      BuyInOutOfRange: ({ amount, max, min }) =>
        `A buy-in here is between ${chips(min)} and ${chips(max)}, not ${chips(amount)}.`,
      ChipRequestPending: ({ amount, player }) =>
        `${voice.subject(player)} already asked for ${chips(amount)}. The host has not answered yet.`,
      ChipsOverMax: ({ amount, holding, max, player }) =>
        `${chips(amount)} more would take ${voice.name(player)} from ${chips(holding)} past the ${chips(max)} limit.`,
      ClockNotDue: () => "That clock has not run out yet.",
      CloseAlreadyQueued: () => "The room already closes when this hand ends.",
      DealNotDue: () => "No hand is due to be dealt yet.",
      DealingIsAutomatic: ({ betweenHandsSeconds }) =>
        `This room deals by itself ${betweenHandsSeconds} ${betweenHandsSeconds === 1 ? "second" : "seconds"} after each hand.`,
      GameAlready: ({ status }) =>
        status === "Running"
          ? "The game is already running."
          : "The game is already paused.",
      HostStillHere: ({ claimableAt, host }) =>
        Option.isSome(claimableAt)
          ? `${voice.subject(host)} left less than two minutes ago. Anyone can take over as host once two minutes have passed.`
          : `${voice.subject(host)} ${voice.isYou(host) ? "are" : "is"} still here, so the host stays the same.`,
      MembersOnly: () => "Only players in the room can do that.",
      NameTaken: ({ wanted }) =>
        `Someone here is already called ${wanted}. Try adding an initial.`,
      NoChipRequest: ({ player }) =>
        `${voice.subject(player)} ${voice.isYou(player) ? "have" : "has"} no chip request waiting.`,
      NoSeatRequest: ({ player }) =>
        `${voice.subject(player)} ${voice.isYou(player) ? "have" : "has"} no seat request waiting.`,
      NoSuchDeadline: () => "That clock already stopped.",
      NotAMember: ({ player }) =>
        `${voice.subject(player)} ${voice.isYou(player) ? "are" : "is"} not in the room.`,
      NotSeated: ({ player }) =>
        voice.isYou(player)
          ? "You need a seat for that."
          : `${voice.subject(player)} has no seat.`,
      NotTheHost: ({ host }) =>
        `Only the host, ${voice.name(host)}, can do that.`,
      NothingSealed: () => DEALER_BUSY,
      QueueNotDue: () => DEALER_BUSY,
      QuietNotDue: () => DEALER_BUSY,
      RoomIsClosed: () => "This room is closed.",
      SaltSecretSize: () => DEALER_BUSY,
      SealNotDue: () => DEALER_BUSY,
      SealRoundTooSoon: () => DEALER_BUSY,
      SealedSeatsMoved: () => DEALER_BUSY,
      SeatBeyondTable: ({ seats }) => `This table has ${seats} seats.`,
      SeatNotFree: ({ seat }) =>
        `${capital(seatLabel(seat))} is taken or someone already asked for it.`,
      SeatRequestPending: ({ player, seat }) =>
        `${voice.subject(player)} already asked for ${seatLabel(seat)}. The host has not answered yet.`,
      SeatsStillTaken: ({ seats, wanted }) =>
        `The table cannot shrink to ${wanted} seats while ${seats.length === 1 ? "a seat past that is" : "seats past that are"} taken or asked for.`,
      ServerOnly: () => "Only the room itself can do that.",
      SettlesAfterHand: () => "The room settles up when this hand ends.",
      ShuffleRanOut: () => DEALER_BUSY,
      TableRejected: ({ rejection: refused }) =>
        tableText(refused, voice, handRunning(view)),
      TopUpNotAllowed: ({ duringHand, holding, min, player, rule }) => {
        if (duringHand) {
          return `${voice.subject(player)} can add chips when this hand ends.`;
        }

        return rule === "BelowMin"
          ? `This room adds chips only below the smallest buy-in of ${chips(min)}, and ${voice.name(player)} ${voice.isYou(player) ? "have" : "has"} ${chips(holding)}.`
          : `This room adds chips only once ${voice.name(player)} ${voice.isYou(player) ? "are" : "is"} out of chips.`;
      },
      Unbalanced: () =>
        "The chip count would not balance, so the room refused.",
    })
  );
};
