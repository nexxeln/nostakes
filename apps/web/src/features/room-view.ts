import { avatarFor } from "@nostakes/avatar";
import { Antes } from "@nostakes/engine";
import type { PlayerId } from "@nostakes/protocol";
import { MemberCommandSchema, RoomViews } from "@nostakes/room";
import type { MemberCommand } from "@nostakes/room";
import { Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import { faceButton, soundSwitch, themeSwitch } from "./chrome.js";
import { face } from "./face-builder.js";
import { Messages } from "./message.js";
import type { Message } from "./message.js";
import type { InRoom, Model } from "./model.js";
import { updateLine } from "./page-update.js";
import { hasLeft, isLive, isYou, nameOf, viewOf } from "./room.js";
import type { ClosedView, OpenView } from "./room.js";
import { settingsPanel } from "./settings-view.js";
import { heroSeatOf, tableSnapshot } from "./table/from-room.js";
import { tableElement } from "./table/snapshot.js";

type H = HtmlBuilder<Message>;

type Occupant = Option.Option.Value<OpenView["seats"][number]["occupant"]>;

const Commands = MemberCommandSchema.cases;

const LIST_FACE_PX = 28;

const commandButton = (
  h: H,
  room: InRoom,
  command: MemberCommand,
  label: string,
  pendingLabel: string,
  style = "button"
): Html =>
  h.button(
    [
      h.Type("button"),
      h.Class(style),
      h.Disabled(!isLive(room)),
      h.OnClick(Messages.ClickedRoomCommand({ command, label: pendingLabel })),
    ],
    [label]
  );

const connectionLine = (room: InRoom, h: H): Html =>
  Option.match(room.link, {
    onNone: () => h.span([h.Class("connection")], ["Connecting…"]),
    onSome: ({ phase, refusal }) => {
      if (phase === "Live") {
        return h.empty;
      }

      if (phase === "Outdated") {
        return h.span(
          [h.Class("connection"), h.Role("status")],
          ["Out of date"]
        );
      }

      if (phase === "Refused") {
        return h.span(
          [h.Class("connection is-refused"), h.Role("status")],
          [`Refused: ${Option.getOrElse(refusal, () => "closed")}`]
        );
      }

      return h.span(
        [h.Class("connection"), h.Role("status")],
        ["Reconnecting…"]
      );
    },
  });

const rulesText = (view: OpenView) => {
  const { buyIn, table } = view.settings;

  const ante = Antes.$match(table.ante, {
    BigBlindPays: ({ amount }) => ` · big blind antes ${amount}`,
    EveryPlayer: ({ amount }) => ` · ante ${amount}`,
    NoAnte: () => "",
  });

  return `Blinds ${table.smallBlind}/${table.bigBlind}${ante} · buy-in ${buyIn.min}–${buyIn.max}`;
};

const header = (
  model: Model,
  room: InRoom,
  view: Option.Option<OpenView>,
  h: H
): Html =>
  h.header(
    [h.Class("room-header")],
    [
      h.span([h.Class("brand small")], ["nostakes"]),
      h.button(
        [
          h.Type("button"),
          h.Class("bar-button"),
          h.OnClick(Messages.ClickedCopyLink()),
        ],
        [room.copied === "Link" ? "Link copied" : "Invite"]
      ),
      h.span(
        [h.Class("bar-end")],
        [
          connectionLine(room, h),
          Option.match(view, {
            onNone: () => h.empty,
            onSome: (open) =>
              faceButton(
                open.members.find(({ player }) => isYou(open, player))
                  ?.avatar ?? model.profile.avatar,
                h
              ),
          }),
          Option.isSome(view)
            ? h.button(
                [
                  h.Type("button"),
                  h.Class("bar-button"),
                  h.OnClick(Messages.ClickedMenu()),
                ],
                ["Menu"]
              )
            : h.empty,
        ]
      ),
    ]
  );

const noticeLine = (room: InRoom, h: H): Html =>
  h.div(
    [h.Class("status-line"), h.AriaLive("polite")],
    [
      Option.match(room.update, {
        onNone: () => h.empty,
        onSome: (update) =>
          h.span(
            [h.Class(update.stage === "Stuck" ? "problem" : "update-line")],
            [updateLine(update)]
          ),
      }),
      Option.match(room.notice, {
        onNone: () => h.empty,
        onSome: (text) => h.span([h.Class("problem")], [text]),
      }),
    ]
  );

const sheet = (h: H, title: string, body: readonly Html[]): Html =>
  h.div(
    [h.Class("sheet-layer")],
    [
      h.button(
        [
          h.Type("button"),
          h.Class("sheet-scrim"),
          h.AriaLabel("Dismiss"),
          h.OnClick(Messages.ClosedSheet()),
        ],
        []
      ),
      h.section(
        [h.Class("sheet"), h.Role("dialog"), h.AriaLabel(title)],
        [
          h.h2([h.Class("sheet-title")], [title]),
          ...body,
          h.button(
            [
              h.Type("button"),
              h.Class("button quiet"),
              h.OnClick(Messages.ClosedSheet()),
            ],
            ["Close"]
          ),
        ]
      ),
    ]
  );

const sitSheet = (room: InRoom, view: OpenView, seat: number, h: H): Html =>
  sheet(h, `Sit in seat ${seat + 1}`, [
    h.form(
      [h.Class("sheet-form"), h.OnSubmit(Messages.ClickedSit({ seat }))],
      [
        h.label(
          [h.Class("field")],
          [
            h.span(
              [h.Class("field-label")],
              [
                `Chips to bring, ${view.settings.buyIn.min} to ${view.settings.buyIn.max}`,
              ]
            ),
            h.input([
              h.Type("number"),
              h.Class("text-input"),
              h.InputMode("numeric"),
              h.Min(String(view.settings.buyIn.min)),
              h.Max(String(view.settings.buyIn.max)),
              h.Value(room.drafts.buyIn),
              h.OnInput((value) =>
                Messages.ChangedDraft({ field: "buyIn", value })
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
          ["Sit down"]
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

const hostTools = (
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
    Commands.RemoveFromSeat.make({ player }),
    "Remove from seat",
    "Removing from seat"
  ),
  commandButton(
    h,
    room,
    Commands.TransferHost.make({ to: player }),
    "Make host",
    "Handing over the host"
  ),
];

const playerSheet = (room: InRoom, view: OpenView, h: H): Html =>
  Option.match(
    room.picked.pipe(
      Option.flatMap((seat) => Option.fromNullishOr(view.seats[seat])),
      Option.flatMap(({ occupant }) => occupant),
      Option.filter(
        ({ player }) => isYou(view, view.host) && !isYou(view, player)
      )
    ),
    {
      onNone: () => h.empty,
      onSome: ({ player }) =>
        sheet(h, nameOf(view, player), hostTools(room, view, player, h)),
    }
  );

const seatedTools = (room: InRoom, view: OpenView, seated: Occupant, h: H) => {
  const straddles =
    view.settings.table.straddle.underTheGun > 0 ||
    view.settings.table.straddle.button;

  return [
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
    straddles
      ? commandButton(
          h,
          room,
          Commands.DeclareStraddle.make({ on: !seated.straddling }),
          seated.straddling ? "Stop straddling" : "Straddle",
          seated.straddling ? "Stopping the straddle" : "Declaring a straddle"
        )
      : h.empty,
    h.form(
      [h.Class("inline-form"), h.OnSubmit(Messages.ClickedRequestChips())],
      [
        h.input([
          h.Type("number"),
          h.Class("text-input"),
          h.InputMode("numeric"),
          h.Placeholder("Chips"),
          h.Value(room.drafts.chips),
          h.AriaLabel("Chips to add"),
          h.OnInput((value) =>
            Messages.ChangedDraft({ field: "chips", value })
          ),
        ]),
        h.button(
          [h.Type("submit"), h.Class("button"), h.Disabled(!isLive(room))],
          ["Add chips"]
        ),
      ]
    ),
    seated.leaving
      ? h.p([h.Class("muted")], ["Standing up after this hand."])
      : commandButton(
          h,
          room,
          Commands.LeaveSeat.make({}),
          "Stand up",
          "Standing up"
        ),
  ];
};

const youSection = (room: InRoom, view: OpenView, h: H): readonly Html[] => {
  const seated = heroSeatOf(view).pipe(
    Option.flatMap((seat) => Option.fromNullishOr(view.seats[seat])),
    Option.flatMap(({ occupant }) => occupant)
  );

  const waitingSeat = view.requests.seats.find(({ player }) =>
    isYou(view, player)
  );

  const waitingChips = [...view.requests.chips, ...view.queued.chips].find(
    ({ player }) => isYou(view, player)
  );

  return [
    waitingSeat === undefined
      ? h.empty
      : h.p(
          [h.Class("muted")],
          [`Waiting for the host to let you into seat ${waitingSeat.seat + 1}.`]
        ),
    waitingChips === undefined
      ? h.empty
      : h.p(
          [h.Class("muted")],
          [`${waitingChips.amount} more chips are on the way.`]
        ),
    ...Option.match(seated, {
      onNone: () => [],
      onSome: (occupant) => seatedTools(room, view, occupant, h),
    }),
  ];
};

const hostSection = (room: InRoom, view: OpenView, h: H): readonly Html[] =>
  isYou(view, view.host)
    ? [
        h.h3([h.Class("sheet-heading")], ["Host"]),
        view.game === "Waiting"
          ? h.empty
          : commandButton(
              h,
              room,
              Commands.PauseGame.make({}),
              "Pause after this hand",
              "Pausing"
            ),
        h.button(
          [
            h.Type("button"),
            h.Class("button"),
            h.OnClick(Messages.ClickedOpenSettings()),
          ],
          ["Room settings"]
        ),
        view.queued.close
          ? h.p([h.Class("muted")], ["Closing after this hand."])
          : commandButton(
              h,
              room,
              Commands.CloseRoom.make({}),
              "Close the room and settle up",
              "Closing the room"
            ),
      ]
    : [];

const peopleSection = (
  room: InRoom,
  view: OpenView,
  presence: readonly PlayerId[],
  h: H
): readonly Html[] => [
  h.h3([h.Class("sheet-heading")], ["At the table"]),
  h.ul(
    [h.Class("member-list")],
    view.members.map((member) =>
      h.li(
        [h.Key(`member-${member.player}`), h.Class("member")],
        [
          face(
            avatarFor(member.avatar),
            "Resting",
            LIST_FACE_PX,
            presence.includes(member.player)
              ? "face-frame member-face"
              : "face-frame member-face is-away",
            h
          ),
          h.span(
            [h.Class("member-name")],
            [isYou(view, member.player) ? "You" : member.name]
          ),
          member.player === view.host
            ? h.span([h.Class("tag")], ["host"])
            : h.empty,
        ]
      )
    )
  ),
];

const menuSheet = (
  model: Model,
  room: InRoom,
  view: OpenView,
  presence: readonly PlayerId[],
  h: H
): Html =>
  sheet(h, `Room ${room.code}`, [
    h.p([h.Class("muted")], [rulesText(view)]),
    ...youSection(room, view, h),
    ...hostSection(room, view, h),
    ...peopleSection(room, view, presence, h),
    h.div(
      [h.Class("sheet-row")],
      [soundSwitch(model.sound, h), themeSwitch(h)]
    ),
    commandButton(
      h,
      room,
      Commands.LeaveRoom.make({}),
      "Leave the room",
      "Leaving",
      "button quiet"
    ),
  ]);

const activeSheet = (
  model: Model,
  room: InRoom,
  view: OpenView,
  presence: readonly PlayerId[],
  h: H
): Html => {
  if (Option.isSome(room.settings)) {
    return settingsPanel(room, view, room.settings.value, h);
  }

  if (Option.isSome(room.drafts.seat)) {
    return sitSheet(room, view, room.drafts.seat.value, h);
  }

  if (Option.isSome(room.picked)) {
    return playerSheet(room, view, h);
  }

  return room.menu ? menuSheet(model, room, view, presence, h) : h.empty;
};

const requestPill = (
  key: string,
  text: string,
  buttons: readonly Html[],
  h: H
): Html =>
  h.div(
    [h.Key(key), h.Class("request")],
    [h.span([h.Class("request-text")], [text]), ...buttons]
  );

const hostRequests = (room: InRoom, view: OpenView, h: H): Html => {
  if (!isYou(view, view.host)) {
    return h.empty;
  }

  const seats = view.requests.seats.map((request) =>
    requestPill(
      `seat-${request.player}`,
      `${nameOf(view, request.player)} wants to sit with ${request.buyIn}`,
      [
        commandButton(
          h,
          room,
          Commands.ApproveSeat.make({ player: request.player }),
          "Let in",
          "Letting them sit",
          "button primary small"
        ),
        commandButton(
          h,
          room,
          Commands.DenySeat.make({ player: request.player }),
          "No",
          "Saying no",
          "button quiet small"
        ),
      ],
      h
    )
  );

  const chips = view.requests.chips.map((request) =>
    requestPill(
      `chips-${request.player}`,
      `${nameOf(view, request.player)} wants ${request.amount} more chips`,
      [
        commandButton(
          h,
          room,
          Commands.ApproveChips.make({ player: request.player }),
          "Give",
          "Giving chips",
          "button primary small"
        ),
        commandButton(
          h,
          room,
          Commands.DenyChips.make({ player: request.player }),
          "No",
          "Saying no",
          "button quiet small"
        ),
      ],
      h
    )
  );

  return seats.length + chips.length === 0
    ? h.empty
    : h.div([h.Class("requests")], [...seats, ...chips]);
};

const waitingCall = (room: InRoom, view: OpenView, h: H): Html => {
  if (Option.isNone(heroSeatOf(view))) {
    return h.p([h.Class("muted")], ["Tap a seat to sit."]);
  }

  return isYou(view, view.host)
    ? commandButton(
        h,
        room,
        Commands.StartGame.make({}),
        "Start the game",
        "Starting",
        "button primary"
      )
    : h.p([h.Class("muted")], ["Waiting for the host to start."]);
};

const tableCall = (room: InRoom, view: OpenView, h: H): Html => {
  if (view.game !== "Waiting") {
    return h.empty;
  }

  return h.div([h.Class("table-call")], [waitingCall(room, view, h)]);
};

const tableView = (
  model: Model,
  room: InRoom,
  view: OpenView,
  presence: readonly PlayerId[],
  h: H
): Html => {
  const table = tableElement.withMessage(h);

  return h.div(
    [h.Class("table-stage")],
    [
      table(
        [
          h.Class("table-host"),
          h.AriaLabel("Table"),
          table.Snapshot(tableSnapshot(room, view, presence, model.learned)),
          table.Sound(model.sound),
          table.OnIntent((intent) => Messages.GotTableIntent({ intent })),
        ],
        []
      ),
      tableCall(room, view, h),
    ]
  );
};

const openRoomView = (
  model: Model,
  room: InRoom,
  view: OpenView,
  presence: readonly PlayerId[],
  h: H
): Html =>
  h.div(
    [h.Class("room-body")],
    [
      tableView(model, room, view, presence, h),
      hostRequests(room, view, h),
      activeSheet(model, room, view, presence, h),
    ]
  );

const closedRoomView = (room: InRoom, view: ClosedView, h: H): Html => {
  const name = (player: PlayerId) => nameOf(view, player);

  return h.section(
    [h.Class("card-panel settlement")],
    [
      h.h2([h.Class("sheet-title")], ["The night is over"]),
      h.ul(
        [h.Class("member-list")],
        view.settlement.balances
          .toSorted((left, right) => right.net - left.net)
          .map((balance) =>
            h.li(
              [h.Key(`balance-${balance.player}`), h.Class("member")],
              [
                h.span([h.Class("member-name")], [name(balance.player)]),
                h.span(
                  [h.Class(balance.net >= 0 ? "net is-up" : "net is-down")],
                  [`${balance.net > 0 ? "+" : ""}${balance.net}`]
                ),
              ]
            )
          )
      ),
      h.h3([h.Class("sheet-heading")], ["Settle up"]),
      h.ul(
        [h.Class("transfers")],
        view.settlement.transfers.length === 0
          ? [h.li([], ["Everyone is square."])]
          : view.settlement.transfers.map(({ amount, from, to }) =>
              h.li(
                [h.Key(`pay-${from}-${to}`)],
                [`${name(from)} pays ${name(to)} ${amount}`]
              )
            )
      ),
      h.button(
        [
          h.Type("button"),
          h.Class("button primary"),
          h.OnClick(Messages.ClickedCopySettlement()),
        ],
        [room.copied === "Settlement" ? "Copied" : "Copy for the group chat"]
      ),
      h.button(
        [
          h.Type("button"),
          h.Class("button quiet"),
          h.OnClick(Messages.ClickedHome()),
        ],
        ["Back home"]
      ),
    ]
  );
};

const homeButton = (label: string, h: H): Html =>
  h.button(
    [h.Type("button"), h.Class("button"), h.OnClick(Messages.ClickedHome())],
    [label]
  );

const stillPlayingOut = (view: OpenView) =>
  view.seats.some(({ occupant }) =>
    Option.exists(occupant, ({ player }) => isYou(view, player))
  );

const leftRoomView = (view: OpenView, h: H): Html =>
  h.section(
    [h.Class("card-panel settlement")],
    [
      h.h2([h.Class("sheet-title")], ["You left this room"]),
      ...(stillPlayingOut(view)
        ? [
            h.p(
              [h.Class("muted")],
              [
                "Your seat plays out this hand, then your chips are counted for the settle-up.",
              ]
            ),
          ]
        : []),
      h.p(
        [h.Class("muted")],
        ["To play again, open the room link and join as a new player."]
      ),
      homeButton("Back home", h),
    ]
  );

const refusedView = (h: H): Html =>
  h.section(
    [h.Class("card-panel settlement")],
    [
      h.p([], ["This room is no longer open to you."]),
      homeButton("Back home", h),
    ]
  );

export const roomView = (model: Model, room: InRoom, h: H): Html => {
  const view = viewOf(room);
  const open = view.pipe(Option.filter(RoomViews.$is("Open")));

  const presence = Option.match(room.link, {
    onNone: () => [],
    onSome: (link) => link.presence,
  });

  const refused = Option.exists(room.link, ({ phase }) => phase === "Refused");

  return h.main(
    [h.Class("page room")],
    [
      header(model, room, open, h),
      noticeLine(room, h),
      Option.match(view, {
        onNone: () =>
          refused
            ? refusedView(h)
            : h.p([h.Class("muted opening")], ["Opening the room…"]),
        onSome: (current) =>
          RoomViews.$match(current, {
            Closed: (closed) => closedRoomView(room, closed, h),
            Open: (live) =>
              hasLeft(live)
                ? leftRoomView(live, h)
                : openRoomView(model, room, live, presence, h),
          }),
      }),
    ]
  );
};
