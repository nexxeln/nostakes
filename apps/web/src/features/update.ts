import { avatarFor, codeFor, PARTS } from "@nostakes/avatar";
import type { Avatar, Part } from "@nostakes/avatar";
import {
  Actions,
  CardFromText,
  ChipsSchema,
  RunCountSchema,
  SeatIndexSchema,
  ShownCardsSchema,
} from "@nostakes/engine";
import type { Action } from "@nostakes/engine";
import { RoomCodeSchema } from "@nostakes/protocol";
import {
  ChipAmountSchema,
  MemberCommandSchema,
  RoomSignalSchema,
  RoomViews,
  SeenEvents,
} from "@nostakes/room";
import type {
  MemberCommand,
  Reaction,
  RoomSignal,
  RoomView,
  SeenEvent,
} from "@nostakes/room";
import { Match, Option, Result, Schema } from "effect";
import type * as HttpClient from "effect/http/HttpClient";
import type { ManagedResource, Update } from "foldkit";

import {
  ApplyDeck,
  ApplyTheme,
  SaveCounting,
  SendReport,
  CheckRoom,
  CopyRoomLink,
  CopyText,
  CreateRoom,
  ForgetRoom,
  JoinRoom,
  ReadKnock,
  ReadStandings,
  ReloadPage,
  SaveLearned,
  SaveProfile,
  ReadOwnResult,
  RememberRoom,
  RememberRules,
  SaveSound,
  ScrollToTop,
  SendToRoom,
  SettleSetup,
  ShareRoomLink,
  ShowPath,
  ShuffleFace,
  SignalRoom,
  UseRoomHere,
  WakeRoom,
} from "../client/commands.js";
import type { RoomConnection } from "../client/connection.js";
import { reportedClear } from "./clearing.js";
import {
  NAME_TAKEN_PROBLEM,
  answerOf,
  doorOf,
  pausedUntil,
  stillWaiting,
} from "./door.js";
import { PART_LABELS, stepped, toldOf } from "./face/parts.js";
import { haltedText } from "./halted.js";
import { heirOf } from "./handover.js";
import { BRAND_LINE, INVITE_PREVIEW } from "./link-preview.js";
import { Messages, ReplyOutcomes } from "./message.js";
import type { Message, ReplyOutcome } from "./message.js";
import {
  FairMarks,
  HaltedStandings,
  KnockAnswers,
  RemovedResults,
  Screens,
} from "./model.js";
import type {
  Door,
  DoorAnswer,
  Flags,
  InRoom,
  Link,
  Model,
  RoomRecord,
  RulesSheet,
  SettingsDraft,
  SetupSheet,
} from "./model.js";
import {
  NO_MOMENTS,
  reactionNoted,
  seatStacksOf,
  watchedMoments,
} from "./moments/watch.js";
import { enteredName, nameRefusal } from "./names.js";
import { considerUpdate } from "./page-update.js";
import { rejectionText } from "./rejections.js";
import {
  ClientReportSchema,
  errorName,
  MAX_ERROR_REPORTS,
  namesKnown,
  reportBuild,
  reportScreen,
  scrubMessage,
} from "./reports.js";
import type { ClientReport } from "./reports.js";
import {
  isActing,
  recordChanged,
  recordOf,
  isLegal,
  isLive,
  isYou,
  legalOf,
  openViewOf,
  roomOf,
  settlementText,
  viewOf,
} from "./room.js";
import type { OpenView } from "./room.js";
import { withPreset } from "./rules.js";
import { settingsFrom } from "./settings.js";
import {
  beforeFirstHand,
  debounced,
  roomDraft,
  rulesToRemember,
  setupChange,
  setupPreset,
} from "./setup.js";
import { forgetExpired, heard, reacted } from "./signals.js";
import {
  KEPT_CLOCK_SAMPLES,
  KEPT_EVENTS,
  betFacedIn,
  clockSampleOf,
  happeningsFrom,
} from "./table/from-room.js";
import type { Hint, TableIntent } from "./table/snapshot.js";
import { roomPath } from "./wire.js";

type Services =
  | HttpClient.HttpClient
  | ManagedResource.ServiceOf<typeof RoomConnection>;

type Return = Update.Return<Model, Message, Services>;

const Commands = MemberCommandSchema.cases;

const freshRoom = (code: InRoom["code"], player: InRoom["player"]): InRoom => ({
  addingChips: false,
  clearing: Option.none(),
  clockSamples: [],
  code,
  confirm: Option.none(),
  connected: false,
  copied: "Nothing",
  door: Option.none(),
  drafts: { buyIn: "", chips: "", seat: Option.none() },
  events: [],
  fairness: [],
  fairnessOpen: false,
  halted: Option.none(),
  heir: Option.none(),
  leaveAfter: Option.none(),
  link: Option.none(),
  member: Option.none(),
  menu: false,
  moments: NO_MOMENTS,
  notice: Option.none(),
  peeks: [],
  pending: [],
  picked: Option.none(),
  player,
  reactions: [],
  removed: Option.none(),
  resumed: Option.none(),
  rules: Option.none(),
  setup: Option.none(),
  shown: Option.none(),
  update: Option.none(),
});

const atTheDoor = (
  code: InRoom["code"],
  player: InRoom["player"],
  door: DoorAnswer
): InRoom => ({ ...freshRoom(code, player), door: Option.some(door) });

const roomFor = (
  rooms: Model["rooms"],
  code: InRoom["code"],
  player: InRoom["player"]
) => {
  const door =
    rooms.find(({ record }) => record.code === code)?.record.door ?? "Inside";

  const knocking = door !== "Inside";

  return {
    commands: knocking ? [ReadKnock({ code })] : [],
    room: knocking
      ? atTheDoor(code, player, KnockAnswers.Asking())
      : freshRoom(code, player),
  };
};

const KEPT_FAIR_HANDS = 30;

const checksFor = (model: Model) =>
  Screens.guards.Home(model.screen)
    ? model.rooms.map(({ record }) => CheckRoom({ code: record.code }))
    : [];

const reported = (model: Model, report: ClientReport) =>
  model.counting ? [SendReport({ report })] : [];

export const init = (flags: Flags): Return => {
  const base = {
    build: flags.build ?? "dev",
    counting: flags.counting ?? false,
    deck: flags.deck,
    faceDraft: Option.none(),
    faceHolding: false,
    faceLearned: false,
    faceMood: "Resting" as const,
    facePart: "species" as const,
    facePast: [],
    faceScrub: Option.none(),
    faceShuffles: 0,
    faceTold: "",
    joinCode: "",
    lastRules: Option.flatten(Option.fromUndefinedOr(flags.lastRules)),
    learned: flags.learned,
    nextKey: 1,
    now: 0,
    origin: flags.origin ?? "",
    profile: flags.profile,
    reloadedFor: flags.reloadedFor,
    reporting: { errors: 0, reconnects: 0 },
    rooms: flags.rooms,
    sound: flags.sound,
    systemTheme: flags.systemTheme,
    theme: flags.theme,
  };

  const opened: Return = Option.match(flags.saved, {
    onNone: () =>
      Option.match(flags.invite, {
        onNone: () => ({
          model: {
            ...base,
            screen:
              flags.rooms.length === 0
                ? Screens.Welcome()
                : Screens.Home({ busy: false, problem: Option.none() }),
          },
        }),
        onSome: (code) => ({
          model: {
            ...base,
            screen: Screens.Invited({
              busy: false,
              code,
              problem: Option.none(),
            }),
          },
        }),
      }),
    onSome: ({ code, player }) => {
      const entry = roomFor(flags.rooms, code, player);

      return {
        commands: entry.commands,
        model: { ...base, screen: Screens.Room({ room: entry.room }) },
      };
    },
  });

  return {
    ...opened,
    commands: [
      ...(opened.commands ?? []),
      ApplyTheme({ theme: flags.theme }),
      ApplyDeck({ deck: flags.deck }),
      ...Option.toArray(flags.reloadedFor).flatMap((target) =>
        reported(
          opened.model,
          ClientReportSchema.cases.ForcedReload.make({
            build: reportBuild(opened.model),
            reason: target._tag,
          })
        )
      ),
      ...checksFor(opened.model),
    ],
  };
};

const withoutRoom = (model: Model, code: string): Model => ({
  ...model,
  rooms: model.rooms.filter(({ record }) => record.code !== code),
});

const withRoom = (model: Model, room: InRoom): Model => ({
  ...model,
  screen: Screens.Room({ room }),
});

const inRoom = (model: Model, step: (room: InRoom) => Return): Return =>
  Option.match(roomOf(model), {
    onNone: () => ({ model }),
    onSome: step,
  });

const editRoom = (model: Model, edit: (room: InRoom) => InRoom): Return =>
  inRoom(model, (room) => ({ model: withRoom(model, edit(room)) }));

const droppedLine = (model: Model, link: Link) =>
  link.phase === "Waiting" &&
  roomOf(model).pipe(
    Option.flatMap((room) => room.link),
    Option.exists((before) => before.phase === "Live")
  );

const sendReconnects = (model: Model): Return =>
  model.counting && model.reporting.reconnects > 0
    ? {
        commands: reported(
          model,
          ClientReportSchema.cases.Reconnects.make({
            build: reportBuild(model),
            reconnects: model.reporting.reconnects,
          })
        ),
        model: { ...model, reporting: { ...model.reporting, reconnects: 0 } },
      }
    : { model };

const editRoomThenUpdate = (
  model: Model,
  edit: (room: InRoom) => InRoom
): Return =>
  inRoom(model, (before) => {
    const room = edit(before);
    const step = considerUpdate(room, model.reloadedFor);

    return {
      commands: Option.toArray(step.reload).map((target) =>
        ReloadPage({ target })
      ),
      model: withRoom(model, { ...room, update: step.update }),
    };
  });

const haltedClosedView = (room: InRoom) =>
  room.halted.pipe(
    Option.filter(HaltedStandings.guards.Shown),
    Option.map(({ view }) => view),
    Option.filter(RoomViews.$is("Closed"))
  );

const haltedRefusal = (room: InRoom) =>
  Option.isNone(room.halted) &&
  Option.exists(
    room.link,
    ({ phase, refusal }) =>
      phase === "Refused" && Option.contains(refusal, "RoomHalted")
  );

const removedRefusal = (room: InRoom) =>
  Option.isNone(room.removed) &&
  Option.exists(
    room.link,
    ({ phase, refusal }) =>
      phase === "Refused" && Option.contains(refusal, "Removed")
  );

const markedRemoved = (model: Model, code: string): Return =>
  Option.match(
    Option.fromUndefinedOr(
      model.rooms.find(({ record }) => record.code === code)
    ),
    {
      onNone: () => ({ model }),
      onSome: (known) => {
        const record = { ...known.record, removed: true };

        return {
          commands: [RememberRoom({ record })],
          model: {
            ...model,
            rooms: model.rooms.map((room) =>
              room.record.code === code ? { ...room, record } : room
            ),
          },
        };
      },
    }
  );

const askForOwnResult = (step: Return): Return =>
  Option.match(roomOf(step.model).pipe(Option.filter(removedRefusal)), {
    onNone: () => step,
    onSome: (room) => {
      const marked = markedRemoved(
        withRoom(step.model, {
          ...room,
          removed: Option.some(RemovedResults.Asking()),
        }),
        room.code
      );

      return {
        commands: [
          ...(step.commands ?? []),
          ...(marked.commands ?? []),
          ReadOwnResult({ code: room.code }),
        ],
        model: marked.model,
      };
    },
  });

const doorRecord = (
  model: Model,
  code: InRoom["code"],
  door: Door,
  seenAt: number
): RoomRecord => ({
  closed: false,
  left: false,
  others: [],
  removed: false,
  ...model.rooms.find(({ record }) => record.code === code)?.record,
  code,
  door,
  seenAt,
});

const rememberDoor = (step: Return, door: Door, seenAt: number): Return =>
  Option.match(roomOf(step.model), {
    onNone: () => step,
    onSome: ({ code, player }) => {
      const record = doorRecord(step.model, code, door, seenAt);
      const others = withoutRoom(step.model, code);

      return {
        commands: [...(step.commands ?? []), RememberRoom({ record })],
        model: { ...others, rooms: [{ player, record }, ...others.rooms] },
      };
    },
  });

const knockingRefusal = (room: InRoom) =>
  Option.isNone(room.door) &&
  Option.exists(
    room.link,
    ({ phase, refusal }) =>
      phase === "Refused" && Option.contains(refusal, "Knocking")
  );

const askAtTheDoor = (step: Return): Return =>
  Option.match(roomOf(step.model).pipe(Option.filter(knockingRefusal)), {
    onNone: () => askForOwnResult(step),
    onSome: (room) => ({
      commands: [...(step.commands ?? []), ReadKnock({ code: room.code })],
      model: withRoom(step.model, {
        ...room,
        door: Option.some(KnockAnswers.Asking()),
      }),
    }),
  });

const knockedAt = (
  model: Model,
  message: Extract<Message, { readonly _tag: "KnockedAtRoom" }>
): Return =>
  rememberDoor(
    {
      commands: [ShowPath({ path: roomPath(message.code) })],
      model: withRoom(
        model,
        atTheDoor(
          message.code,
          message.player,
          KnockAnswers.Shown({ knock: message.knock })
        )
      ),
    },
    "Knocking",
    message.at
  );

const gotKnock = (
  model: Model,
  message: Extract<Message, { readonly _tag: "ReceivedKnock" }>
): Return =>
  inRoom(model, (room) => {
    const door = doorOf(message.knock.answer);

    const shown = withRoom(model, {
      ...room,
      door: Option.some(KnockAnswers.Shown({ knock: message.knock })),
    });

    const known = model.rooms.find(({ record }) => record.code === room.code);

    return known?.record.door === door
      ? { model: shown }
      : rememberDoor({ model: shown }, door, message.at);
  });

const letInside = (model: Model): Return =>
  inRoom(model, (room) =>
    rememberDoor(
      {
        model: withRoom(model, {
          ...room,
          door: Option.none(),
          link: Option.none(),
        }),
      },
      "Inside",
      model.now
    )
  );

const knockAgain = (model: Model): Return =>
  inRoom(model, (room) => {
    const answer = room.door.pipe(Option.flatMap(answerOf));

    if (Option.contains(answer, "NameTaken")) {
      return {
        model: {
          ...model,
          screen: Screens.Invited({
            busy: false,
            code: room.code,
            problem: Option.some(NAME_TAKEN_PROBLEM),
          }),
        },
      };
    }

    return {
      commands: [
        JoinRoom({
          avatar: model.profile.avatar,
          code: room.code,
          name: model.profile.name,
          pausedUntil: pausedUntil(model, room.code),
        }),
      ],
      model: {
        ...model,
        screen: Screens.Invited({
          busy: true,
          code: room.code,
          problem: Option.none(),
        }),
      },
    };
  });

const turnedAway = (room: InRoom) =>
  Option.contains(room.door.pipe(Option.flatMap(answerOf)), "TurnedAway");

const askForStandings = (step: Return): Return =>
  Option.match(roomOf(step.model).pipe(Option.filter(haltedRefusal)), {
    onNone: () => askAtTheDoor(step),
    onSome: (room) => ({
      commands: [...(step.commands ?? []), ReadStandings({ code: room.code })],
      model: withRoom(step.model, {
        ...room,
        halted: Option.some(HaltedStandings.Asking()),
      }),
    }),
  });

const noteRoom = (step: Return, view: RoomView, seenAt: number): Return =>
  Option.match(roomOf(step.model), {
    onNone: () => step,
    onSome: ({ player }) => {
      const record = recordOf(view, seenAt);

      const known = step.model.rooms.find(
        (room) => room.record.code === record.code
      );

      return known !== undefined && !recordChanged(known.record, record)
        ? step
        : {
            commands: [...(step.commands ?? []), RememberRoom({ record })],
            model: {
              ...withoutRoom(step.model, record.code),
              rooms: [
                { player, record },
                ...withoutRoom(step.model, record.code).rooms,
              ],
            },
          };
    },
  });

const send = (
  model: Model,
  room: InRoom,
  command: MemberCommand,
  label: string
): Return => {
  const key = model.nextKey;

  const acting =
    MemberCommandSchema.guards.Act(command) ||
    MemberCommandSchema.guards.TableHand(command) ||
    MemberCommandSchema.guards.MuckHand(command);

  return {
    commands: [SendToRoom({ command, key })],
    model: {
      ...withRoom(model, {
        ...room,
        addingChips: false,
        clearing: MemberCommandSchema.guards.ClearRoom(command)
          ? Option.some({
              key,
              named: command.players,
              seq: Option.none(),
            })
          : room.clearing,
        confirm: Option.none(),
        member: Option.none(),
        notice: Option.none(),
        pending: [...room.pending, { acting, key, label }],
        picked: Option.none(),
      }),
      nextKey: key + 1,
    },
  };
};

const actionLabel = (action: Action) =>
  Actions.$match(action, {
    Call: () => "Calling",
    Check: () => "Checking",
    Fold: () => "Folding",
    RaiseTo: ({ to }) => `Raising to ${to}`,
  });

const act = (model: Model, action: Action): Return =>
  inRoom(model, (room) =>
    isLive(room) &&
    !isActing(room) &&
    Option.exists(legalOf(room), (legal) => isLegal(legal, action))
      ? send(model, room, Commands.Act.make({ action }), actionLabel(action))
      : { model }
  );

const notice = (room: InRoom, text: string): InRoom => ({
  ...room,
  notice: Option.some(text),
});

const wholeNumber = (text: string) => {
  const trimmed = text.trim();
  const value = Number(trimmed);

  return trimmed.length > 0 && Number.isSafeInteger(value)
    ? Option.some(value)
    : Option.none();
};

const sit = (model: Model, seatNumber: number): Return =>
  inRoom(model, (room) => {
    const seat = Schema.decodeOption(SeatIndexSchema)(seatNumber);

    const buyIn = wholeNumber(room.drafts.buyIn).pipe(
      Option.flatMap(Schema.decodeOption(ChipAmountSchema))
    );

    return Option.match(Option.all({ buyIn, seat }), {
      onNone: () => ({
        model: withRoom(model, notice(room, "Type a whole number of chips.")),
      }),
      onSome: (request) =>
        send(
          model,
          { ...room, drafts: { ...room.drafts, seat: Option.none() } },
          Commands.RequestSeat.make(request),
          `Asking for seat ${seatNumber + 1}`
        ),
    });
  });

const requestChips = (model: Model): Return =>
  inRoom(model, (room) =>
    Option.match(
      wholeNumber(room.drafts.chips).pipe(
        Option.flatMap(Schema.decodeOption(ChipAmountSchema))
      ),
      {
        onNone: () => ({
          model: withRoom(model, notice(room, "Type a whole number of chips.")),
        }),
        onSome: (amount) =>
          send(
            model,
            { ...room, drafts: { ...room.drafts, chips: "" } },
            Commands.RequestChips.make({ amount }),
            `Adding ${amount} chips`
          ),
      }
    )
  );

const editRules = (
  model: Model,
  edit: (sheet: RulesSheet) => RulesSheet
): Return =>
  editRoom(model, (room) => ({
    ...room,
    rules: room.rules.pipe(Option.map(edit)),
  }));

const FRESH_SETUP: SetupSheet = {
  awaitSeq: Option.none(),
  edits: Option.none(),
  help: Option.none(),
  inFlight: Option.none(),
  token: 0,
  waiting: false,
};

export const setupDraft = (view: OpenView, setup: SetupSheet): SettingsDraft =>
  Option.getOrElse(setup.edits, () => roomDraft(view));

const withSetup = (room: InRoom, setup: SetupSheet): InRoom => ({
  ...room,
  setup: Option.some(setup),
});

const sendSetup = (
  model: Model,
  room: InRoom,
  setup: SetupSheet,
  draft: SettingsDraft
): Return =>
  Result.match(settingsFrom(draft), {
    onFailure: () => ({
      model: withRoom(model, withSetup(room, { ...setup, waiting: false })),
    }),
    onSuccess: (settings) =>
      isLive(room)
        ? send(
            model,
            withSetup(room, {
              ...setup,
              inFlight: Option.some(model.nextKey),
              waiting: false,
            }),
            Commands.ChangeSettings.make({ settings }),
            "Changing the rules"
          )
        : {
            model: withRoom(
              model,
              withSetup(room, {
                ...setup,
                edits: Option.none(),
                waiting: false,
              })
            ),
          },
  });

const hostSetup = (
  model: Model,
  step: (room: InRoom, view: OpenView, setup: SetupSheet) => Return
): Return =>
  inRoom(model, (room) =>
    Option.match(
      Option.all([
        openViewOf(room).pipe(
          Option.filter(
            (view) => isYou(view, view.host) && beforeFirstHand(view)
          )
        ),
        room.setup,
      ]),
      {
        onNone: () => ({ model }),
        onSome: ([view, setup]) => step(room, view, setup),
      }
    )
  );

const editSetup = (
  model: Model,
  edit: (draft: SettingsDraft) => SettingsDraft,
  wait: boolean
): Return =>
  hostSetup(model, (room, view, setup) => {
    const draft = edit(setupDraft(view, setup));
    const edited = { ...setup, edits: Option.some(draft) };

    if (!wait) {
      return sendSetup(model, room, edited, draft);
    }

    const token = setup.token + 1;

    return {
      commands: [SettleSetup({ token })],
      model: withRoom(
        model,
        withSetup(room, { ...edited, token, waiting: true })
      ),
    };
  });

const settledSetup = (model: Model, token: number): Return =>
  hostSetup(model, (room, view, setup) =>
    setup.waiting && setup.token === token
      ? sendSetup(model, room, setup, setupDraft(view, setup))
      : { model }
  );

const flushSetup = (model: Model): Return =>
  hostSetup(model, (room, view, setup) =>
    setup.waiting
      ? sendSetup(model, room, setup, setupDraft(view, setup))
      : { model }
  );

const seenSeq = (room: InRoom) =>
  room.shown.pipe(
    Option.map(({ seq }) => seq),
    Option.getOrElse(() => 0)
  );

const answeredSetup = (
  room: InRoom,
  key: number,
  outcome: ReplyOutcome
): InRoom =>
  Option.match(
    room.setup.pipe(
      Option.filter(({ inFlight }) => Option.contains(inFlight, key))
    ),
    {
      onNone: () => room,
      onSome: (setup) => {
        const answered = { ...setup, inFlight: Option.none() };

        const reached =
          ReplyOutcomes.guards.Accepted(outcome) && outcome.seq > seenSeq(room)
            ? Option.some(outcome.seq)
            : Option.none();

        return withSetup(
          room,
          setup.waiting || Option.isSome(reached)
            ? { ...answered, awaitSeq: reached }
            : { ...answered, awaitSeq: Option.none(), edits: Option.none() }
        );
      },
    }
  );

const caughtUpSetup = (room: InRoom): InRoom =>
  Option.match(
    room.setup.pipe(
      Option.filter(
        ({ awaitSeq, inFlight, waiting }) =>
          !waiting &&
          Option.isNone(inFlight) &&
          Option.exists(awaitSeq, (seq) => seenSeq(room) >= seq)
      )
    ),
    {
      onNone: () => room,
      onSome: (setup) =>
        withSetup(room, {
          ...setup,
          awaitSeq: Option.none(),
          edits: Option.none(),
        }),
    }
  );

const firstHandDealt = (before: InRoom, after: InRoom) =>
  Option.exists(openViewOf(before), beforeFirstHand) &&
  Option.exists(
    openViewOf(after),
    (view) => isYou(view, view.host) && !beforeFirstHand(view)
  );

const rememberFirstHand = (before: InRoom, step: Return): Return =>
  Option.match(
    roomOf(step.model).pipe(
      Option.filter((after) => firstHandDealt(before, after)),
      Option.flatMap(openViewOf)
    ),
    {
      onNone: () => step,
      onSome: (view) => ({
        ...step,
        commands: [
          ...(step.commands ?? []),
          RememberRules({ rules: Option.some(rulesToRemember(view)) }),
        ],
      }),
    }
  );

const openHouseRules = (model: Model): Return => {
  const flushed = flushSetup(model);

  return {
    ...flushed,
    model: Option.match(roomOf(flushed.model), {
      onNone: () => flushed.model,
      onSome: (room) =>
        withRoom(flushed.model, {
          ...room,
          menu: false,
          rules: openViewOf(room).pipe(
            Option.map((view) => ({
              draft: Option.match(room.setup, {
                onNone: () => roomDraft(view),
                onSome: (setup) => setupDraft(view, setup),
              }),
              help: Option.none(),
              open: Option.none(),
            }))
          ),
          setup: Option.none(),
        }),
    }),
  };
};

const openSetup = (model: Model): Return =>
  editRoom(model, (room) => ({
    ...room,
    menu: false,
    rules: Option.none(),
    setup: Option.some(FRESH_SETUP),
  }));

const openRules = (model: Model): Return =>
  inRoom(model, (room) =>
    Option.exists(
      openViewOf(room),
      (view) => isYou(view, view.host) && beforeFirstHand(view)
    )
      ? openSetup(model)
      : openHouseRules(model)
  );

const topUpRoom = (room: InRoom) =>
  Option.match(
    openViewOf(room).pipe(
      Option.flatMap((view) =>
        Option.fromNullishOr(
          view.seats.find(({ occupant }) =>
            Option.exists(occupant, ({ player }) => isYou(view, player))
          )
        ).pipe(
          Option.flatMap(({ occupant }) => occupant),
          Option.map(({ stack }) => view.settings.buyIn.max - stack)
        )
      ),
      Option.filter((chips) => chips > 0)
    ),
    { onNone: () => "", onSome: String }
  );

const pickSeat = (model: Model, seat: number): Return =>
  editRoom(model, (room) => ({
    ...room,
    drafts: {
      ...room.drafts,
      buyIn:
        room.drafts.buyIn === ""
          ? Option.match(openViewOf(room), {
              onNone: () => "",
              onSome: ({ settings }) => String(settings.buyIn.max),
            })
          : room.drafts.buyIn,
      seat: Option.some(seat),
    },
  }));

const showdownChoice = (
  model: Model,
  command: MemberCommand,
  label: string
): Return =>
  inRoom(model, (room) =>
    isLive(room) && !isActing(room)
      ? send(model, room, command, label)
      : { model }
  );

const afterHand = (
  model: Model,
  command: MemberCommand,
  label: string
): Return =>
  inRoom(model, (room) =>
    isLive(room) ? send(model, room, command, label) : { model }
  );

const learn = (model: Model, hint: Hint): Return => {
  if (model.learned.includes(hint)) {
    return { model };
  }

  const learned = [...model.learned, hint];

  return { commands: [SaveLearned({ learned })], model: { ...model, learned } };
};

const Signals = RoomSignalSchema.cases;

const peeksShown = (room: InRoom) =>
  isLive(room) &&
  Option.exists(openViewOf(room), ({ settings }) => settings.peeking);

const peek = (model: Model, looking: boolean): Return =>
  inRoom(model, (room) =>
    peeksShown(room)
      ? {
          commands: [SignalRoom({ signal: Signals.Peeking.make({ looking }) })],
          model,
        }
      : { model }
  );

const reactionKept = (
  room: InRoom,
  from: InRoom["player"],
  signal: RoomSignal
): InRoom =>
  RoomSignalSchema.guards.Reaction(signal)
    ? { ...room, moments: reactionNoted(room.moments, from, signal.reaction) }
    : room;

const react = (model: Model, reaction: Reaction): Return =>
  inRoom(model, (room) =>
    isLive(room)
      ? {
          commands: [
            SignalRoom({ signal: Signals.Reaction.make({ reaction }) }),
          ],
          model,
        }
      : { model }
  );

const fromTable = (model: Model, intent: TableIntent): Return =>
  Match.value(intent).pipe(
    Match.tagsExhaustive({
      Call: () => act(model, Actions.Call()),
      Check: () => act(model, Actions.Check()),
      Fold: () => act(model, Actions.Fold()),
      HuntRabbit: () =>
        afterHand(model, Commands.RabbitHunt.make({}), "Hunting the rabbit"),
      Learned: ({ hint }) => learn(model, hint),
      Muck: () => showdownChoice(model, Commands.MuckHand.make({}), "Mucking"),
      Peek: ({ looking }) => peek(model, looking),
      Pick: ({ seat }) =>
        editRoom(model, (room) => ({ ...room, picked: Option.some(seat) })),
      Posting: ({ post }) =>
        afterHand(
          model,
          Commands.ChoosePosting.make({ post }),
          post ? "Posting to come in" : "Waiting for the big blind"
        ),
      Raise: ({ to }) =>
        Option.match(Schema.decodeOption(ChipsSchema)(to), {
          onNone: () => ({ model }),
          onSome: (amount) => act(model, Actions.RaiseTo({ to: amount })),
        }),
      React: ({ reaction }) => react(model, reaction),
      Rules: () => openRules(model),
      Runs: ({ runs }) =>
        Option.match(RunCountSchema.makeOption(runs), {
          onNone: () => ({ model }),
          onSome: (count) =>
            afterHand(
              model,
              Commands.ChooseRuns.make({ runs: count }),
              count === 1 ? "Running it once" : `Running it ${count} times`
            ),
        }),
      Show: () => showdownChoice(model, Commands.TableHand.make({}), "Showing"),
      ShowCards: ({ cards }) =>
        Option.match(
          Option.all(
            cards.map((card) => Schema.decodeOption(CardFromText)(card))
          ).pipe(
            Option.flatMap((picked) => ShownCardsSchema.makeOption(picked))
          ),
          {
            onNone: () => ({ model }),
            onSome: (shown) =>
              afterHand(
                model,
                Commands.ShowCards.make({ cards: shown }),
                "Showing"
              ),
          }
        ),
      Sit: ({ seat }) => pickSeat(model, seat),
    })
  );

const remember = (
  room: InRoom,
  applied: readonly { readonly event: SeenEvent; readonly seq: number }[]
): InRoom => {
  const fresh = happeningsFrom(
    betFacedIn(room.shown.pipe(Option.map(({ view }) => view))),
    applied
  );

  return fresh.length === 0
    ? room
    : { ...room, events: [...room.events, ...fresh].slice(-KEPT_EVENTS) };
};

const clearingAnswered = (
  room: InRoom,
  key: number,
  outcome: ReplyOutcome
): InRoom["clearing"] =>
  room.clearing.pipe(
    Option.filter((clearing) => clearing.key === key),
    Option.flatMap((clearing) =>
      ReplyOutcomes.guards.Accepted(outcome)
        ? Option.some({ ...clearing, seq: Option.some(outcome.seq) })
        : Option.none()
    ),
    Option.orElse(() =>
      room.clearing.pipe(Option.filter((clearing) => clearing.key !== key))
    )
  );

const settle = (room: InRoom, key: number, outcome: ReplyOutcome): InRoom => {
  const sent = room.pending.find((pending) => pending.key === key);

  if (sent === undefined) {
    return room;
  }

  const pending = room.pending.filter((entry) => entry.key !== key);
  const clearing = clearingAnswered(room, key, outcome);

  return ReplyOutcomes.match(outcome, {
    Accepted: () => reportedClear({ ...room, clearing, pending }),
    Lost: ({ reason }) => ({
      ...room,
      clearing,
      notice: Option.some(`${sent.label} did not reach the room: ${reason}`),
      pending,
    }),
    Rejected: ({ rejection }) => ({
      ...room,
      clearing,
      notice: Option.some(rejectionText(rejection, viewOf(room))),
      pending,
    }),
  });
};

const presenceOf = (room: InRoom) =>
  Option.match(room.link, {
    onNone: () => [],
    onSome: ({ presence }) => presence,
  });

const leave = (model: Model): Return =>
  inRoom(model, (room) => {
    if (!isLive(room)) {
      return { model };
    }

    const heir = openViewOf(room).pipe(
      Option.flatMap((view) => heirOf(view, presenceOf(room), room.heir))
    );

    return Option.match(heir, {
      onNone: () => send(model, room, Commands.LeaveRoom.make({}), "Leaving"),
      onSome: (to) =>
        send(
          model,
          {
            ...room,
            heir: Option.none(),
            leaveAfter: Option.some(model.nextKey),
          },
          Commands.TransferHost.make({ to }),
          "Handing over the host"
        ),
    });
  });

const answered = (model: Model, key: number, outcome: ReplyOutcome): Return =>
  inRoom(model, (room) => {
    const handedOver =
      Option.contains(room.leaveAfter, key) &&
      ReplyOutcomes.guards.Accepted(outcome);

    const next = {
      ...settle(answeredSetup(room, key, outcome), key, outcome),
      leaveAfter: room.leaveAfter.pipe(Option.filter((after) => after !== key)),
    };

    return handedOver
      ? send(model, next, Commands.LeaveRoom.make({}), "Leaving")
      : { model: withRoom(model, next) };
  });

const ownMember = (room: InRoom) =>
  openViewOf(room).pipe(
    Option.flatMap((view) =>
      Option.fromNullishOr(
        view.members.find((member) => isYou(view, member.player))
      )
    )
  );

const closedFace = (model: Model): Model => ({
  ...model,
  faceDraft: Option.none(),
  facePast: [],
  faceScrub: Option.none(),
});

const openedFace = (model: Model, worn: Avatar): Model => ({
  ...model,
  faceDraft: Option.some(worn),
  faceHolding: false,
  faceMood: "Resting",
  facePart: "species",
  facePast: [],
  faceScrub: Option.none(),
  faceTold: "",
});

const keepFace = (model: Model): Return =>
  Option.match(model.faceDraft, {
    onNone: () => ({ model }),
    onSome: (draft) => {
      const profile = { ...model.profile, avatar: codeFor(draft) };

      return {
        commands: [SaveProfile({ profile })],
        model: { ...closedFace(model), profile },
      };
    },
  });

const sendFace = (model: Model): Return =>
  inRoom(model, (room) =>
    Option.match(Option.all([model.faceDraft, ownMember(room)]), {
      onNone: () => ({ model: closedFace(model) }),
      onSome: ([draft, member]) => {
        const profile = { ...model.profile, avatar: codeFor(draft) };

        const sent = send(
          { ...closedFace(model), profile },
          room,
          Commands.SetProfile.make({
            avatar: profile.avatar,
            name: member.name,
          }),
          "Changing your face"
        );

        return {
          ...sent,
          commands: [...(sent.commands ?? []), SaveProfile({ profile })],
        };
      },
    })
  );

const FACES_KEPT_FOR_UNDO = 40;

interface Worn {
  readonly avatar: Avatar;
  readonly told: string;
  readonly shuffled: boolean;
}

const wearFace = (model: Model, { avatar, shuffled, told }: Worn): Return =>
  Option.match(model.faceDraft, {
    onNone: () => {
      const profile = { ...model.profile, avatar: codeFor(avatar) };

      return {
        commands: [SaveProfile({ profile })],
        model: { ...model, profile },
      };
    },
    onSome: (draft) =>
      codeFor(draft) === codeFor(avatar)
        ? { model }
        : {
            model: {
              ...model,
              faceDraft: Option.some(avatar),
              facePast: [...model.facePast, draft].slice(-FACES_KEPT_FOR_UNDO),
              faceShuffles: model.faceShuffles + (shuffled ? 1 : 0),
              faceTold: told,
            },
          },
  });

const toldOfChange = (model: Model, avatar: Avatar) =>
  model.faceDraft.pipe(
    Option.flatMap((draft) =>
      Option.fromNullishOr(PARTS.find((part) => draft[part] !== avatar[part]))
    ),
    Option.match({
      onNone: () => "",
      onSome: (part) => toldOf(avatar, part),
    })
  );

const holdFacePart = (model: Model, part: Part): Model => ({
  ...model,
  faceHolding: !(model.faceHolding && model.facePart === part),
  faceLearned: true,
  facePart: part,
  faceTold: model.faceDraft.pipe(
    Option.match({
      onNone: () => "",
      onSome: (draft) =>
        model.faceHolding && model.facePart === part
          ? `${PART_LABELS[part]} put down`
          : toldOf(draft, part),
    })
  ),
});

const scrubFacePart = (model: Model, part: Part, by: number): Return =>
  Option.match(model.faceDraft, {
    onNone: () => ({ model }),
    onSome: (draft) => {
      const from = Option.getOrElse(model.faceScrub, () => draft);
      const avatar = stepped(from, part, by);

      return {
        model: {
          ...model,
          faceDraft: Option.some(avatar),
          faceHolding: true,
          faceLearned: true,
          facePart: part,
          faceScrub: Option.some(from),
          faceTold: toldOf(avatar, part),
        },
      };
    },
  });

const settleFaceScrub = (model: Model, kept: boolean): Return =>
  Option.match(Option.all([model.faceDraft, model.faceScrub]), {
    onNone: () => ({ model: { ...model, faceScrub: Option.none() } }),
    onSome: ([draft, from]) => ({
      model: {
        ...model,
        faceDraft: Option.some(kept ? draft : from),
        facePast:
          kept && codeFor(draft) !== codeFor(from)
            ? [...model.facePast, from].slice(-FACES_KEPT_FOR_UNDO)
            : model.facePast,
        faceScrub: Option.none(),
      },
    }),
  });

const flipFacePart = (model: Model, part: Part, by: number): Return =>
  Option.match(model.faceDraft, {
    onNone: () => ({ model }),
    onSome: (draft) => {
      const avatar = stepped(draft, part, by);

      return wearFace(
        { ...model, faceHolding: true, faceLearned: true, facePart: part },
        { avatar, shuffled: false, told: toldOf(avatar, part) }
      );
    },
  });

const undoFace = (model: Model): Return =>
  Option.match(
    Option.all([model.faceDraft, Option.fromNullishOr(model.facePast.at(-1))]),
    {
      onNone: () => ({ model }),
      onSome: ([, before]) => ({
        model: {
          ...model,
          faceDraft: Option.some(before),
          facePast: model.facePast.slice(0, -1),
          faceTold: "Back to the face before",
        },
      }),
    }
  );

const saveFace = (model: Model): Return =>
  Option.match(roomOf(model), {
    onNone: () => keepFace(model),
    onSome: () => sendFace(model),
  });

export const update = (model: Model, message: Message): Return =>
  Messages.match(message, {
    AcquiredConnection: () =>
      editRoom(model, (room) => ({ ...room, connected: true })),
    CaughtError: ({ message: text, name }) =>
      model.counting && model.reporting.errors < MAX_ERROR_REPORTS
        ? {
            commands: reported(
              model,
              ClientReportSchema.cases.ClientError.make({
                build: reportBuild(model),
                message: scrubMessage(text, namesKnown(model)),
                name: errorName(name),
                screen: reportScreen(model),
              })
            ),
            model: {
              ...model,
              reporting: {
                ...model.reporting,
                errors: model.reporting.errors + 1,
              },
            },
          }
        : { model },
    ChangedDraft: ({ field, value }) =>
      editRoom(model, (room) => ({
        ...room,
        drafts: { ...room.drafts, [field]: value },
      })),
    ChangedJoinCode: ({ value }) => ({
      model: { ...model, joinCode: value.toUpperCase() },
    }),
    ChangedName: ({ value }) => ({
      model: { ...model, profile: { ...model.profile, name: value } },
    }),
    ChangedSetting: ({ path, value }) =>
      editRules(model, (sheet) => ({
        ...sheet,
        draft: { ...sheet.draft, [path]: value },
      })),
    ChangedSetupSetting: ({ path, value }) =>
      editSetup(
        model,
        (draft) => setupChange(draft, path, value),
        debounced(path)
      ),
    ChangedSystemTheme: ({ theme }) => ({
      model: { ...model, systemTheme: theme },
    }),
    CheckedRoom: ({ code, gone }) =>
      gone
        ? { commands: [ForgetRoom({ code })], model: withoutRoom(model, code) }
        : { model },
    ChoseDeck: ({ deck }) => ({
      commands: [ApplyDeck({ deck })],
      model: { ...model, deck },
    }),
    ChoseFaceMood: ({ mood }) => ({ model: { ...model, faceMood: mood } }),
    ChoseFacePart: ({ part }) => ({ model: holdFacePart(model, part) }),
    ChoseHeir: ({ player }) =>
      editRoom(model, (room) => ({ ...room, heir: Option.some(player) })),
    ChosePreset: ({ preset }) =>
      editRules(model, (sheet) => ({
        ...sheet,
        draft: withPreset(sheet.draft, preset),
      })),
    ChoseSetupPreset: ({ preset }) =>
      editSetup(model, (draft) => setupPreset(draft, preset), false),
    ChoseTheme: ({ theme }) => ({
      commands: [ApplyTheme({ theme: Option.some(theme) })],
      model: { ...model, theme: Option.some(theme) },
    }),
    ClickedAddChips: () =>
      editRoom(model, (room) => ({
        ...room,
        addingChips: true,
        drafts: { ...room.drafts, chips: topUpRoom(room) },
        menu: false,
      })),
    ClickedBackToWelcome: () =>
      Screens.guards.Home(model.screen) && model.rooms.length === 0
        ? {
            commands: [ScrollToTop()],
            model: { ...model, screen: Screens.Welcome() },
          }
        : { model },
    ClickedCancelFace: () => ({
      model: closedFace(model),
    }),
    ClickedCheckResult: () =>
      inRoom(model, (room) => ({
        commands: [ReadOwnResult({ code: room.code })],
        model,
      })),
    ClickedConfirm: ({ confirm }) =>
      editRoom(model, (room) => ({
        ...room,
        confirm: Option.some(confirm),
        heir: Option.none(),
        member: Option.none(),
        menu: false,
        picked: Option.none(),
      })),
    ClickedCopyLink: () =>
      inRoom(model, (room) => ({
        commands: [CopyRoomLink({ code: room.code })],
        model,
      })),
    ClickedCopyProof: ({ hand }) =>
      inRoom(model, (room) => ({
        commands: room.fairness.flatMap((judged) =>
          judged.hand === hand && FairMarks.guards.Failed(judged.mark)
            ? [CopyText({ copied: "Proof", text: judged.mark.proof })]
            : []
        ),
        model,
      })),
    ClickedCopySettlement: () =>
      inRoom(model, (room) =>
        Option.match(
          haltedClosedView(room).pipe(
            Option.map(haltedText),
            Option.orElse(() =>
              viewOf(room).pipe(
                Option.filter(RoomViews.$is("Closed")),
                Option.map(settlementText)
              )
            )
          ),
          {
            onNone: () => ({ model }),
            onSome: (text) => ({
              commands: [CopyText({ copied: "Settlement", text })],
              model,
            }),
          }
        )
      ),
    ClickedEditFace: () => ({
      model: openedFace(
        model,
        avatarFor(
          roomOf(model).pipe(
            Option.flatMap(ownMember),
            Option.map(({ avatar }) => avatar),
            Option.getOrElse(() => model.profile.avatar)
          )
        )
      ),
    }),
    ClickedFairness: () =>
      editRoom(model, (room) => ({ ...room, fairnessOpen: true })),
    ClickedHome: () =>
      inRoom(model, (room) => {
        const keepsResult = Option.isSome(room.removed) || turnedAway(room);

        return {
          commands: keepsResult
            ? [ShowPath({ path: "/" })]
            : [ShowPath({ path: "/" }), ForgetRoom({ code: room.code })],
          model: {
            ...(keepsResult ? model : withoutRoom(model, room.code)),
            faceDraft: Option.none(),
            screen: Screens.Home({ busy: false, problem: Option.none() }),
          },
        };
      }),
    ClickedHouseRules: () => openHouseRules(model),
    ClickedKnockAgain: () => knockAgain(model),
    ClickedKnownRoom: ({ code }) =>
      Option.match(
        Option.fromNullishOr(
          model.rooms.find(({ record }) => record.code === code)
        ),
        {
          onNone: () => ({ model }),
          onSome: ({ player }) => {
            const entry = roomFor(model.rooms, code, player);

            return {
              commands: [ShowPath({ path: roomPath(code) }), ...entry.commands],
              model: withRoom(model, entry.room),
            };
          },
        }
      ),
    ClickedLeave: () => leave(model),
    ClickedMember: ({ player }) =>
      editRoom(model, (room) => ({
        ...room,
        member: Option.some(player),
        menu: false,
      })),
    ClickedMenu: () => editRoom(model, (room) => ({ ...room, menu: true })),
    ClickedOpenRoom: () =>
      Screens.guards.Welcome(model.screen)
        ? {
            commands: [ScrollToTop()],
            model: {
              ...model,
              screen: Screens.Home({ busy: false, problem: Option.none() }),
            },
          }
        : { model },
    ClickedRequestChips: () => requestChips(model),
    ClickedRoomCommand: ({ command, label }) =>
      MemberCommandSchema.guards.Act(command)
        ? act(model, command.action)
        : inRoom(model, (room) =>
            isLive(room) ? send(model, room, command, label) : { model }
          ),
    ClickedRuleGroup: ({ group }) =>
      editRules(model, (sheet) => ({
        ...sheet,
        help: Option.none(),
        open: Option.contains(sheet.open, group)
          ? Option.none()
          : Option.some(group),
      })),
    ClickedRuleHelp: ({ path }) =>
      editRules(model, (sheet) => ({
        ...sheet,
        help: Option.contains(sheet.help, path)
          ? Option.none()
          : Option.some(path),
      })),
    ClickedSaveFace: () => saveFace(model),
    ClickedSaveSettings: () =>
      inRoom(model, (room) =>
        Option.match(room.rules, {
          onNone: () => ({ model }),
          onSome: ({ draft }) =>
            Result.match(settingsFrom(draft), {
              onFailure: (problem) => ({
                model: withRoom(model, notice(room, problem)),
              }),
              onSuccess: (settings) =>
                send(
                  model,
                  { ...room, rules: Option.none() },
                  Commands.ChangeSettings.make({ settings }),
                  "Saving the settings"
                ),
            }),
        })
      ),
    ClickedSeat: ({ seat }) => pickSeat(model, seat),
    ClickedSetup: () => openSetup(model),
    ClickedShareLink: () =>
      inRoom(model, (room) => ({
        commands: [
          ShareRoomLink({
            code: room.code,
            text: INVITE_PREVIEW.description,
            title: BRAND_LINE,
          }),
        ],
        model,
      })),
    ClickedShuffleFace: () => ({ commands: [ShuffleFace()], model }),
    ClickedSit: ({ seat }) => sit(model, seat),
    ClickedStandardRules: () => ({
      commands: [RememberRules({ rules: Option.none() })],
      model: { ...model, lastRules: Option.none() },
    }),
    ClickedUndoFace: () => undoFace(model),
    ClickedUseHere: () => ({ commands: [UseRoomHere()], model }),
    ClosedSheet: () => {
      const flushed = flushSetup(model);

      return {
        ...flushed,
        model: editRoom(flushed.model, (room) => ({
          ...room,
          addingChips: false,
          confirm: Option.none(),
          drafts: { ...room.drafts, seat: Option.none() },
          fairnessOpen: false,
          heir: Option.none(),
          member: Option.none(),
          menu: false,
          picked: Option.none(),
          rules: Option.none(),
          setup: Option.none(),
        })).model,
      };
    },
    CompletedCopy: ({ copied }) =>
      editRoom(model, (room) => ({ ...room, copied })),
    CompletedForget: () => ({ model }),
    CompletedNavigation: () => ({ model }),
    CompletedPreference: () => ({ model }),
    CompletedWake: () => ({ model }),
    EnteredRoom: ({ code, opened, player, rulesDropped }) => ({
      commands: [ShowPath({ path: roomPath(code) })],
      model: withRoom(model, {
        ...freshRoom(code, player),
        notice: rulesDropped
          ? Option.some(
              "Your last rules could not be used, so the room opened with the standard ones."
            )
          : Option.none(),
        setup: opened ? Option.some(FRESH_SETUP) : Option.none(),
      }),
    }),
    FailedConnection: ({ problem }) =>
      editRoom(model, (room) => notice(room, problem)),
    FailedEntry: ({ problem }) => ({
      model: {
        ...model,
        screen: Screens.match(model.screen, {
          Home: () =>
            Screens.Home({ busy: false, problem: Option.some(problem) }),
          Invited: ({ code }) =>
            Screens.Invited({
              busy: false,
              code,
              problem: Option.some(problem),
            }),
          Room: () => model.screen,
          Welcome: () => model.screen,
        }),
      },
    }),
    FlippedFacePart: ({ by, part }) => flipFacePart(model, part, by),
    HeardSignal: ({ from, receivedAt, signal }) =>
      inRoom(model, (room) => ({
        model: {
          ...withRoom(
            { ...model, now: receivedAt },
            reactionKept(
              heard(
                forgetExpired(room, receivedAt),
                from,
                signal,
                receivedAt,
                model.nextKey
              ),
              from,
              signal
            )
          ),
          nextKey: model.nextKey + 1,
        },
      })),
    JudgedHand: ({ hand, mark }) => {
      const kept = editRoom(model, (room) => ({
        ...room,
        fairness: [
          { hand, mark },
          ...room.fairness.filter((judged) => judged.hand !== hand),
        ]
          .toSorted((one, other) => other.hand - one.hand)
          .slice(0, KEPT_FAIR_HANDS),
      }));

      return FairMarks.guards.Failed(mark)
        ? {
            ...kept,
            commands: reported(
              model,
              ClientReportSchema.cases.DeckCheckFailed.make({
                build: reportBuild(model),
              })
            ),
          }
        : kept;
    },
    KnockedAtRoom: (knocked) => knockedAt(model, knocked),
    LetInside: () => letInside(model),
    MissedKnock: ({ reason }) =>
      editRoom(model, (room) => ({
        ...room,
        door: Option.some(KnockAnswers.Missing({ reason })),
      })),
    MissedOwnResult: ({ reason }) =>
      editRoom(model, (room) => ({
        ...room,
        removed: Option.some(RemovedResults.Missing({ reason })),
      })),
    MissedStandings: ({ reason }) =>
      editRoom(model, (room) => ({
        ...room,
        halted: Option.some(HaltedStandings.Missing({ reason })),
      })),
    PickedAvatar: ({ avatar }) =>
      wearFace(model, {
        avatar,
        shuffled: false,
        told: toldOfChange(model, avatar),
      }),
    PolledDoor: () =>
      inRoom(model, (room) =>
        stillWaiting(room)
          ? { commands: [ReadKnock({ code: room.code })], model }
          : { model }
      ),
    ReceivedKnock: (knocked) => gotKnock(model, knocked),
    ReceivedLink: ({ link }) =>
      askForStandings(
        editRoomThenUpdate(
          {
            ...model,
            now: link.receivedAt,
            reporting: droppedLine(model, link)
              ? {
                  ...model.reporting,
                  reconnects: model.reporting.reconnects + 1,
                }
              : model.reporting,
          },
          (room) => ({
            ...room,
            link: Option.some(link),
          })
        )
      ),
    ReceivedOwnResult: ({ result }) =>
      editRoom(model, (room) => ({
        ...room,
        removed: Option.some(RemovedResults.Shown({ result })),
      })),
    ReceivedReply: ({ key, outcome }) => answered(model, key, outcome),
    ReceivedStandings: ({ view }) =>
      editRoom(model, (room) => ({
        ...room,
        halted: Option.some(HaltedStandings.Shown({ view })),
      })),
    ReceivedTableIntent: ({ intent }) => fromTable(model, intent),
    ReceivedUpdate: ({ events, receivedAt, seq, view }) =>
      Option.match(roomOf(model), {
        onNone: () => ({ model }),
        onSome: (before) =>
          rememberFirstHand(
            before,
            noteRoom(
              editRoomThenUpdate({ ...model, now: receivedAt }, (room) =>
                caughtUpSetup(
                  reportedClear({
                    ...remember(room, events),
                    clockSamples: RoomViews.$is("Open")(view)
                      ? [
                          ...room.clockSamples,
                          clockSampleOf(view, receivedAt),
                        ].slice(-KEPT_CLOCK_SAMPLES)
                      : room.clockSamples,
                    moments: watchedMoments(
                      room.moments,
                      events,
                      seatStacksOf(view)
                    ),
                    resumed: Option.orElse(
                      Option.fromUndefinedOr(
                        events.findLast(
                          ({ event }) =>
                            SeenEvents.$is("TableAttended")(event) &&
                            Option.isSome(event.quietSince)
                        )
                      ).pipe(
                        Option.flatMap(({ event }) =>
                          SeenEvents.$is("TableAttended")(event)
                            ? Option.some({ player: event.player, receivedAt })
                            : Option.none()
                        )
                      ),
                      () => room.resumed
                    ),
                    shown: Option.some({ receivedAt, seq, view }),
                  })
                )
              ),
              view,
              receivedAt
            )
          ),
      }),
    ReleasedConnection: () =>
      editRoom(model, (room) => ({ ...room, connected: false })),
    ScrolledToTop: () => ({ model }),
    ScrubbedFacePart: ({ by, part }) => scrubFacePart(model, part, by),
    SentSignal: ({ at, sent, signal }) =>
      sent && RoomSignalSchema.guards.Reaction(signal)
        ? inRoom(model, (room) => ({
            model: {
              ...withRoom(
                { ...model, now: at },
                reactionKept(
                  reacted(
                    forgetExpired(room, at),
                    room.player,
                    signal.reaction,
                    at,
                    model.nextKey
                  ),
                  room.player,
                  signal
                )
              ),
              nextKey: model.nextKey + 1,
            },
          }))
        : { model },
    SettledFaceScrub: ({ kept }) => settleFaceScrub(model, kept),
    SettledSetupEdit: ({ token }) => settledSetup(model, token),
    ShuffledFace: ({ avatar }) =>
      wearFace(model, { avatar, shuffled: true, told: "A new face" }),
    StartedReload: () => ({ model }),
    SubmittedCreate: () => {
      const name = enteredName(model.profile.name);

      if (!Screens.guards.Home(model.screen) || model.screen.busy) {
        return { model };
      }

      return Option.match(nameRefusal(name), {
        onNone: () => ({
          commands: [
            CreateRoom({
              avatar: model.profile.avatar,
              name,
              settings: model.lastRules,
            }),
          ],
          model: {
            ...model,
            profile: { ...model.profile, name },
            screen: Screens.Home({ busy: true, problem: Option.none() }),
          },
        }),
        onSome: (problem) => ({
          model: {
            ...model,
            screen: Screens.Home({
              busy: false,
              problem: Option.some(problem),
            }),
          },
        }),
      });
    },
    SubmittedInvite: () => {
      const name = enteredName(model.profile.name);

      if (!Screens.guards.Invited(model.screen) || model.screen.busy) {
        return { model };
      }

      const { code } = model.screen;

      return Option.match(nameRefusal(name), {
        onNone: () => ({
          commands: [
            JoinRoom({
              avatar: model.profile.avatar,
              code,
              name,
              pausedUntil: pausedUntil(model, code),
            }),
          ],
          model: {
            ...model,
            profile: { ...model.profile, name },
            screen: Screens.Invited({
              busy: true,
              code,
              problem: Option.none(),
            }),
          },
        }),
        onSome: (problem) => ({
          model: {
            ...model,
            screen: Screens.Invited({
              busy: false,
              code,
              problem: Option.some(problem),
            }),
          },
        }),
      });
    },
    SubmittedJoin: () => {
      const name = enteredName(model.profile.name);

      const code = Schema.decodeOption(RoomCodeSchema)(model.joinCode.trim());

      if (!Screens.guards.Home(model.screen) || model.screen.busy) {
        return { model };
      }

      return Option.match(code, {
        onNone: () => ({
          model: {
            ...model,
            screen: Screens.Home({
              busy: false,
              problem: Option.some("A room code is six letters and digits."),
            }),
          },
        }),
        onSome: (valid) =>
          Option.match(nameRefusal(name), {
            onNone: () => ({
              commands: [
                JoinRoom({
                  avatar: model.profile.avatar,
                  code: valid,
                  name,
                  pausedUntil: pausedUntil(model, valid),
                }),
              ],
              model: {
                ...model,
                profile: { ...model.profile, name },
                screen: Screens.Home({ busy: true, problem: Option.none() }),
              },
            }),
            onSome: (problem) => ({
              model: {
                ...model,
                screen: Screens.Home({
                  busy: false,
                  problem: Option.some(problem),
                }),
              },
            }),
          }),
      });
    },
    SwitchedCounting: ({ on }) => ({
      commands: [SaveCounting({ on })],
      model: {
        ...model,
        counting: on,
        reporting: on ? model.reporting : { errors: 0, reconnects: 0 },
      },
    }),
    SwitchedSound: ({ on }) => ({
      commands: [SaveSound({ on })],
      model: { ...model, sound: on },
    }),
    Ticked: ({ now }) =>
      Option.match(roomOf(model), {
        onNone: () => ({ model: { ...model, now } }),
        onSome: (room) => ({
          model: withRoom({ ...model, now }, forgetExpired(room, now)),
        }),
      }),
    WokePage: ({ visible }) =>
      visible
        ? inRoom(model, () => ({ commands: [WakeRoom()], model }))
        : sendReconnects(model),
  });
