import { avatarFor } from "@nostakes/avatar";
import type { PlayerId } from "@nostakes/protocol";
import { MemberCommandSchema } from "@nostakes/room";
import { Match, Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import { commandButton } from "./buttons.js";
import { deviceToggles } from "./chrome.js";
import { face } from "./face-builder.js";
import { Messages } from "./message.js";
import type { Message } from "./message.js";
import { pageTheme } from "./model.js";
import type { Confirm, InRoom, Model, Theme } from "./model.js";
import { entryOf, entryWords } from "./posting.js";
import { isLive, isYou, nameOf } from "./room.js";
import type { OpenView } from "./room.js";
import { rulesCard } from "./rules-view.js";
import { icon, sheet, sheetLayer, sheetTop } from "./sheet.js";
import { serverNowOf, takeOverLine } from "./stuck-line.js";

type H = HtmlBuilder<Message>;

type Occupant = Option.Option.Value<OpenView["seats"][number]["occupant"]>;

const Commands = MemberCommandSchema.cases;

const SEAT_FACE_PX = 48;

const LIST_FACE_PX = 30;

const occupantOf = (view: OpenView, player: PlayerId) =>
  Option.fromNullishOr(
    view.seats.find(({ occupant }) =>
      Option.exists(occupant, (seated) => seated.player === player)
    )
  ).pipe(
    Option.flatMap(({ occupant }) => occupant),
    Option.map((occupant) => ({
      occupant,
      seat: view.seats.findIndex(({ occupant: other }) =>
        Option.exists(other, (seated) => seated.player === player)
      ),
    }))
  );

const inPot = (view: OpenView, player: PlayerId) =>
  Option.match(view.hand, {
    onNone: () => 0,
    onSome: ({ players }) =>
      players.find((seated) => seated.player === player)?.committedTotal ?? 0,
  });

const netOf = (view: OpenView, player: PlayerId): Option.Option<number> => {
  const balance = view.balances.find((entry) => entry.player === player);
  const seated = occupantOf(view, player);

  if (balance === undefined && Option.isNone(seated)) {
    return Option.none();
  }

  const onTable = Option.match(seated, {
    onNone: () => 0,
    onSome: ({ occupant }) => occupant.stack + inPot(view, player),
  });

  return Option.some(
    onTable + (balance?.cashedOut ?? 0) - (balance?.boughtIn ?? 0)
  );
};

const MINUS = "−";

const netView = (net: Option.Option<number>, h: H): Html =>
  Option.match(net, {
    onNone: () => h.empty,
    onSome: (amount) => {
      if (amount === 0) {
        return h.span([h.Class("net")], ["0"]);
      }

      return amount > 0
        ? h.span([h.Class("net is-up")], [`+${amount}`])
        : h.span([h.Class("net is-down")], [`${MINUS}${-amount}`]);
    },
  });

const statusOf = (view: OpenView, seated: Option.Option<Occupant>) => {
  const waitingSeat = view.requests.seats.find(({ player }) =>
    isYou(view, player)
  );

  const waitingChips = [...view.requests.chips, ...view.queued.chips].find(
    ({ player }) => isYou(view, player)
  );

  if (waitingSeat !== undefined) {
    return `Waiting for seat ${waitingSeat.seat + 1}`;
  }

  return Option.match(seated, {
    onNone: () => "Watching",
    onSome: (occupant) => {
      if (occupant.leaving) {
        return "Standing up after this hand";
      }

      if (waitingChips !== undefined) {
        return `+${waitingChips.amount} on the way`;
      }

      if (occupant.sittingOut) {
        return "Sitting out";
      }

      return Option.match(entryOf(view), {
        onNone: () => "",
        onSome: (entry) => entryWords(entry).line,
      });
    },
  });
};

const straddleSwitch = (room: InRoom, view: OpenView, seated: Occupant, h: H) =>
  view.settings.table.straddle.underTheGun > 0 ||
  view.settings.table.straddle.button
    ? h.div(
        [h.Class("rule-line menu-line")],
        [
          h.span([h.Class("rule-name")], ["Straddle"]),
          h.button(
            [
              h.Type("button"),
              h.Class(seated.straddling ? "switch is-on" : "switch"),
              h.Role("switch"),
              h.AriaChecked(seated.straddling),
              h.AriaLabel("Straddle"),
              h.Disabled(!isLive(room)),
              h.OnClick(
                Messages.ClickedRoomCommand({
                  command: Commands.DeclareStraddle.make({
                    on: !seated.straddling,
                  }),
                  label: seated.straddling
                    ? "Stopping the straddle"
                    : "Declaring a straddle",
                })
              ),
            ],
            []
          ),
        ]
      )
    : h.empty;

const seatActions = (room: InRoom, view: OpenView, seated: Occupant, h: H) => [
  h.div(
    [h.Class("seat-actions")],
    [
      seated.sittingOut
        ? commandButton(
            h,
            room,
            Commands.SitIn.make({}),
            "Sit back in",
            "Sitting in",
            "button primary"
          )
        : commandButton(
            h,
            room,
            Commands.SitOut.make({}),
            "Sit out",
            "Sitting out"
          ),
      h.button(
        [
          h.Type("button"),
          h.Class("button"),
          h.Disabled(!isLive(room)),
          h.OnClick(Messages.ClickedAddChips()),
        ],
        ["Add chips"]
      ),
      seated.leaving
        ? h.empty
        : commandButton(
            h,
            room,
            Commands.LeaveSeat.make({}),
            "Stand up",
            "Standing up"
          ),
    ]
  ),
  straddleSwitch(room, view, seated, h),
];

const seatBlock = (model: Model, room: InRoom, view: OpenView, h: H) => {
  const you = view.members.find(({ player }) => isYou(view, player));

  const seated = view.you.pipe(
    Option.flatMap((player) => occupantOf(view, player)),
    Option.map(({ occupant }) => occupant)
  );

  const status = statusOf(view, seated);

  return [
    h.div(
      [h.Class("seat-card")],
      [
        h.button(
          [
            h.Type("button"),
            h.Class("seat-face"),
            h.AriaLabel("Change your face"),
            h.OnClick(Messages.ClickedEditFace()),
          ],
          [
            face(
              avatarFor(you?.avatar ?? model.profile.avatar),
              "Resting",
              { size: SEAT_FACE_PX, theme: pageTheme(model) },
              "face-frame",
              h
            ),
          ]
        ),
        h.span(
          [h.Class("seat-who")],
          [
            h.span([h.Class("seat-name")], [you?.name ?? model.profile.name]),
            status.length > 0
              ? h.span([h.Class("seat-status")], [status])
              : h.empty,
          ]
        ),
        Option.match(seated, {
          onNone: () => h.empty,
          onSome: ({ stack }) =>
            h.span([h.Class("seat-stack")], [String(stack)]),
        }),
      ]
    ),
    ...Option.match(seated, {
      onNone: () => [],
      onSome: (occupant) => seatActions(room, view, occupant, h),
    }),
  ];
};

const hostStrip = (room: InRoom, view: OpenView, h: H): Html => {
  if (!isYou(view, view.host) || view.game === "Waiting") {
    return h.empty;
  }

  const dealDue =
    view.settings.dealing === "Host" &&
    Option.isNone(view.hand) &&
    !view.queued.close;

  return h.div(
    [h.Class("host-strip")],
    [
      dealDue
        ? commandButton(
            h,
            room,
            Commands.DealNextHand.make({}),
            "Deal",
            "Dealing",
            "button primary"
          )
        : h.empty,
      commandButton(
        h,
        room,
        Commands.PauseGame.make({}),
        "Pause after this hand",
        "Pausing",
        "button small"
      ),
    ]
  );
};

const requestRow = (
  key: string,
  text: string,
  buttons: readonly Html[],
  h: H
): Html =>
  h.div(
    [h.Key(key), h.Class("menu-request")],
    [h.span([h.Class("request-text")], [text]), ...buttons]
  );

const approvals = (room: InRoom, view: OpenView, h: H): readonly Html[] => {
  if (!isYou(view, view.host)) {
    return [];
  }

  const answer = (
    yes: Parameters<typeof commandButton>[2],
    no: Parameters<typeof commandButton>[2],
    yesLabel: string
  ) => [
    commandButton(h, room, yes, yesLabel, yesLabel, "button primary small"),
    commandButton(h, room, no, "No", "Saying no", "button quiet small"),
  ];

  return [
    ...view.requests.seats.map((request) =>
      requestRow(
        `seat-${request.player}`,
        `${nameOf(view, request.player)} · seat ${request.seat + 1} · ${request.buyIn}`,
        answer(
          Commands.ApproveSeat.make({ player: request.player }),
          Commands.DenySeat.make({ player: request.player }),
          "Let in"
        ),
        h
      )
    ),
    ...view.requests.chips.map((request) =>
      requestRow(
        `chips-${request.player}`,
        `${nameOf(view, request.player)} · +${request.amount}`,
        answer(
          Commands.ApproveChips.make({ player: request.player }),
          Commands.DenyChips.make({ player: request.player }),
          "Give"
        ),
        h
      )
    ),
  ];
};

const memberNote = (view: OpenView, player: PlayerId) =>
  Option.match(occupantOf(view, player), {
    onNone: () => "",
    onSome: ({ occupant }) => (occupant.sittingOut ? "out" : ""),
  });

const peopleList = (
  view: OpenView,
  presence: readonly PlayerId[],
  theme: Theme,
  h: H
): Html => {
  const hosting = isYou(view, view.host);

  return h.ul(
    [h.Class("people")],
    view.members.map((member) => {
      const you = isYou(view, member.player);
      const note = memberNote(view, member.player);

      const content = [
        face(
          avatarFor(member.avatar),
          "Resting",
          { size: LIST_FACE_PX, theme },
          presence.includes(member.player)
            ? "face-frame member-face"
            : "face-frame member-face is-away",
          h
        ),
        h.span(
          [h.Class("person-name")],
          [
            you ? "You" : member.name,
            member.player === view.host
              ? h.span([h.Class("tag")], ["host"])
              : h.empty,
            note.length > 0 ? h.span([h.Class("tag")], [note]) : h.empty,
          ]
        ),
        netView(netOf(view, member.player), h),
      ];

      return h.li(
        [h.Key(`member-${member.player}`)],
        [
          hosting && !you
            ? h.button(
                [
                  h.Type("button"),
                  h.Class("person"),
                  h.OnClick(Messages.ClickedMember({ player: member.player })),
                ],
                [...content, icon("Chevron", h)]
              )
            : h.div([h.Class("person")], content),
        ]
      );
    })
  );
};

export const lockedSettings = (view: OpenView, locked: boolean) => ({
  ...view.settings,
  locked,
  table: Option.getOrElse(view.queued.rules, () => view.settings.table),
});

const doorSwitch = (room: InRoom, view: OpenView, h: H): Html =>
  isYou(view, view.host)
    ? h.div(
        [h.Class("rule-line menu-line door-line")],
        [
          h.span([h.Class("rule-name")], ["Lock the room"]),
          h.button(
            [
              h.Type("button"),
              h.Class(view.settings.locked ? "switch is-on" : "switch"),
              h.Role("switch"),
              h.AriaChecked(view.settings.locked),
              h.AriaLabel("Lock the room"),
              h.Disabled(!isLive(room)),
              h.OnClick(
                Messages.ClickedRoomCommand({
                  command: Commands.ChangeSettings.make({
                    settings: lockedSettings(view, !view.settings.locked),
                  }),
                  label: view.settings.locked
                    ? "Unlocking the room"
                    : "Locking the room",
                })
              ),
            ],
            []
          ),
        ]
      )
    : h.empty;

const confirmLink = (label: string, confirm: Confirm, h: H): Html =>
  h.button(
    [
      h.Type("button"),
      h.Class("text-button"),
      h.OnClick(Messages.ClickedConfirm({ confirm })),
    ],
    [label]
  );

const menuFoot = (model: Model, view: OpenView, h: H): Html => {
  const hosting = isYou(view, view.host) && Option.isNone(view.stalled);

  return h.div(
    [h.Class("menu-foot")],
    [
      deviceToggles(model.sound, model.deck, model.counting, h),
      h.span(
        [h.Class("menu-foot-end")],
        [
          hosting && view.queued.close
            ? h.span([h.Class("muted small")], ["Ending after this hand"])
            : h.empty,
          hosting && !view.queued.close
            ? confirmLink("End the night", Commands.CloseRoom.make({}), h)
            : h.empty,
          confirmLink("Leave", Commands.LeaveRoom.make({}), h),
        ]
      ),
    ]
  );
};

const stuckBlock = (view: OpenView, h: H): Html =>
  Option.isSome(view.stalled)
    ? h.div(
        [h.Class("menu-alert"), h.Role("status")],
        [
          h.span([h.Class("menu-alert-text")], ["The table is stuck."]),
          h.button(
            [
              h.Type("button"),
              h.Class("button small"),
              h.OnClick(
                Messages.ClickedConfirm({
                  confirm: Commands.CloseRoom.make({}),
                })
              ),
            ],
            ["End the night"]
          ),
        ]
      )
    : h.empty;

const takeOverBlock = (
  model: Model,
  room: InRoom,
  view: OpenView,
  h: H
): Html =>
  Option.match(takeOverLine(view, serverNowOf(room.clockSamples, model.now)), {
    onNone: () => h.empty,
    onSome: (text) =>
      h.div(
        [h.Class("menu-alert"), h.Role("status")],
        [
          h.span([h.Class("menu-alert-text")], [text]),
          commandButton(
            h,
            room,
            Commands.ClaimHost.make({}),
            "Take over",
            "Taking over as host",
            "button small"
          ),
        ]
      ),
  });

const codeButton = (room: InRoom, h: H): Html =>
  h.button(
    [
      h.Type("button"),
      h.Class("room-code"),
      h.AriaLabel("Copy the invite link"),
      h.OnClick(Messages.ClickedCopyLink()),
    ],
    [room.copied === "Link" ? "Copied" : room.code, icon("Link", h)]
  );

export const menuSheet = (
  model: Model,
  room: InRoom,
  view: OpenView,
  presence: readonly PlayerId[],
  h: H
): Html =>
  sheetLayer(h, "Menu", "menu-sheet", [
    sheetTop(h, codeButton(room, h)),
    stuckBlock(view, h),
    takeOverBlock(model, room, view, h),
    ...approvals(room, view, h),
    h.div(
      [h.Class("menu-columns")],
      [
        h.div(
          [h.Class("menu-column")],
          [
            ...seatBlock(model, room, view, h),
            hostStrip(room, view, h),
            rulesCard(view, h),
          ]
        ),
        h.div(
          [h.Class("menu-column")],
          [
            peopleList(view, presence, pageTheme(model), h),
            doorSwitch(room, view, h),
            menuFoot(model, view, h),
          ]
        ),
      ]
    ),
  ]);

const holdsUpTheGame = (view: OpenView, player: PlayerId) =>
  view.hand.pipe(
    Option.flatMap(({ toAct, toShow }) => Option.orElse(toAct, () => toShow)),
    Option.flatMap((seat) => Option.fromNullishOr(view.seats[seat])),
    Option.flatMap(({ occupant }) => occupant),
    Option.exists((occupant) => occupant.player === player)
  );

const memberTools = (
  room: InRoom,
  view: OpenView,
  player: PlayerId,
  h: H
): readonly Html[] => [
  holdsUpTheGame(view, player)
    ? commandButton(
        h,
        room,
        Commands.ActForSeat.make({ player }),
        "Act for them",
        "Acting for them",
        "button primary"
      )
    : h.empty,
  commandButton(
    h,
    room,
    Commands.TransferHost.make({ to: player }),
    "Make host",
    "Handing over the host"
  ),
  Option.isSome(occupantOf(view, player))
    ? h.button(
        [
          h.Type("button"),
          h.Class("button quiet"),
          h.OnClick(
            Messages.ClickedConfirm({
              confirm: Commands.RemoveFromSeat.make({ player }),
            })
          ),
        ],
        ["Stand them up"]
      )
    : h.empty,
  h.button(
    [
      h.Type("button"),
      h.Class("button quiet danger-text"),
      h.OnClick(
        Messages.ClickedConfirm({
          confirm: Commands.RemoveMember.make({ player }),
        })
      ),
    ],
    ["Remove from the room"]
  ),
];

export const pickedPlayer = (
  room: InRoom,
  view: OpenView
): Option.Option<PlayerId> =>
  Option.orElse(room.member, () =>
    room.picked.pipe(
      Option.flatMap((seat) => Option.fromNullishOr(view.seats[seat])),
      Option.flatMap(({ occupant }) => occupant),
      Option.map(({ player }) => player)
    )
  ).pipe(
    Option.filter((player) => isYou(view, view.host) && !isYou(view, player))
  );

export const playerSheet = (
  room: InRoom,
  view: OpenView,
  player: PlayerId,
  h: H
): Html => sheet(h, nameOf(view, player), memberTools(room, view, player, h));

const removalText = (view: OpenView, player: PlayerId) => {
  const name = nameOf(view, player);

  const inHand = Option.exists(view.hand, ({ players }) =>
    players.some((seated) => seated.player === player)
  );

  const door = view.settings.locked
    ? ""
    : " Lock the room to keep the link from letting them back in.";

  if (inHand) {
    return `${name}'s pass stops working. Their seat plays out this hand, then their chips are counted for the settle-up.${door}`;
  }

  return Option.isSome(occupantOf(view, player))
    ? `${name}'s pass stops working. Their chips are counted for the settle-up.${door}`
    : `${name}'s pass stops working.${door}`;
};

const ENDINGS: Readonly<Record<OpenView["closing"], string>> = {
  AfterHand:
    "This hand plays out. Then the table closes and everyone sees who pays whom.",
  CancelsHand:
    "This hand is called off and every chip in it goes back. Then everyone sees who pays whom.",
  Now: "The table closes and everyone sees who pays whom.",
};

const confirmText = (view: OpenView, confirm: Confirm) =>
  Match.value(confirm).pipe(
    Match.tagsExhaustive({
      CloseRoom: () => ({
        action: "End the night",
        body: ENDINGS[view.closing],
        pending: "Ending the night",
        title: "End the night?",
      }),
      LeaveRoom: () => ({
        action: "Leave the room",
        body: "Your chips count in the settle-up. To play again, you join as someone new.",
        pending: "Leaving",
        title: "Leave the room?",
      }),
      RemoveFromSeat: ({ player }) => ({
        action: "Stand them up",
        body: `${nameOf(view, player)} stands up with their chips and stays in the room.`,
        pending: "Standing them up",
        title: `Stand ${nameOf(view, player)} up?`,
      }),
      RemoveMember: ({ player }) => ({
        action: "Remove",
        body: removalText(view, player),
        pending: "Removing",
        title: `Remove ${nameOf(view, player)}?`,
      }),
    })
  );

export const confirmSheet = (
  room: InRoom,
  view: OpenView,
  confirm: Confirm,
  h: H
): Html => {
  const text = confirmText(view, confirm);

  return sheet(h, text.title, [
    h.p([h.Class("confirm-text")], [text.body]),
    commandButton(h, room, confirm, text.action, text.pending, "button danger"),
    h.button(
      [
        h.Type("button"),
        h.Class("button quiet"),
        h.OnClick(Messages.ClosedSheet()),
      ],
      ["Cancel"]
    ),
  ]);
};

export const chipsSheet = (room: InRoom, view: OpenView, h: H): Html =>
  sheet(h, "Add chips", [
    h.form(
      [h.Class("sheet-form"), h.OnSubmit(Messages.ClickedRequestChips())],
      [
        h.label(
          [h.Class("field")],
          [
            h.span(
              [h.Class("field-label")],
              [`Up to ${view.settings.buyIn.max} on the table`]
            ),
            h.input([
              h.Type("number"),
              h.Class("text-input"),
              h.InputMode("numeric"),
              h.Min("1"),
              h.Value(room.drafts.chips),
              h.AriaLabel("Chips to add"),
              h.OnInput((value) =>
                Messages.ChangedDraft({ field: "chips", value })
              ),
            ]),
          ]
        ),
        h.button(
          [
            h.Type("submit"),
            h.Class("button primary"),
            h.Disabled(!isLive(room)),
          ],
          ["Add"]
        ),
      ]
    ),
  ]);
