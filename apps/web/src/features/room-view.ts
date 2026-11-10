import {
  Actions,
  Antes,
  RunCountSchema,
  ShownCardsSchema,
} from "@nostakes/engine";
import type { Card, SeatIndex } from "@nostakes/engine";
import type { PlayerId } from "@nostakes/protocol";
import { MemberCommandSchema, RoomViews } from "@nostakes/room";
import type { MemberCommand } from "@nostakes/room";
import { Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import { cardLabel, cardView } from "./cards.js";
import { soundSwitch, themeSwitch } from "./chrome.js";
import { Messages } from "./message.js";
import type { Message } from "./message.js";
import type { InRoom, Model } from "./model.js";
import {
  bettingControls,
  isActing,
  isLive,
  legalOf,
  settlementText,
  viewOf,
} from "./room.js";
import type { ClosedView, OpenView } from "./room.js";
import { settingsPanel } from "./settings-view.js";
import { tableSnapshot } from "./table/from-room.js";
import { tableElement } from "./table/snapshot.js";

type H = HtmlBuilder<Message>;

const Commands = MemberCommandSchema.cases;

interface Seen {
  readonly name: (player: PlayerId) => string;
  readonly avatar: (player: PlayerId) => string;
}

const seenFrom = (members: OpenView["members"]): Seen => ({
  avatar: (player) =>
    members.find((member) => member.player === player)?.avatar ?? "🙂",
  name: (player) =>
    members.find((member) => member.player === player)?.name ?? "Someone",
});

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

const mySeatOf = (view: OpenView, room: InRoom): Option.Option<SeatIndex> =>
  Option.fromNullishOr(
    view.seats.find(({ occupant }) =>
      Option.exists(occupant, ({ player }) => player === room.player)
    )?.seat
  );

const connectionLine = (room: InRoom, h: H): Html =>
  Option.match(room.link, {
    onNone: () => h.span([h.Class("connection is-waiting")], ["Connecting…"]),
    onSome: ({ phase, refusal }) => {
      if (phase === "Live") {
        return h.span(
          [h.Class("connection is-live"), h.AriaLabel("Connected")],
          [""]
        );
      }

      if (phase === "Refused") {
        return h.span(
          [h.Class("connection is-refused"), h.Role("status")],
          [`Refused: ${Option.getOrElse(refusal, () => "closed")}`]
        );
      }

      return h.span(
        [h.Class("connection is-waiting"), h.Role("status")],
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
          h.Class("room-code"),
          h.AriaLabel("Copy the room link"),
          h.OnClick(Messages.ClickedCopyLink()),
        ],
        [room.copied === "Link" ? "Link copied" : room.code]
      ),
      Option.match(view, {
        onNone: () => h.empty,
        onSome: (open) => h.span([h.Class("rules-line")], [rulesText(open)]),
      }),
      h.span(
        [h.Class("bar-end")],
        [
          connectionLine(room, h),
          soundSwitch(model.sound, h),
          themeSwitch(h),
          Option.match(view, {
            onNone: () => h.empty,
            onSome: (open) =>
              open.host === room.player
                ? h.button(
                    [
                      h.Type("button"),
                      h.Class("bar-button"),
                      h.OnClick(Messages.ClickedOpenSettings()),
                    ],
                    ["Settings"]
                  )
                : h.empty,
          }),
        ]
      ),
    ]
  );

const noticeLine = (room: InRoom, h: H): Html =>
  h.div(
    [h.Class("status-line"), h.AriaLive("polite")],
    [
      ...room.pending.map((pending) =>
        h.span(
          [h.Key(`pending-${pending.key}`), h.Class("pending")],
          [`${pending.label}…`]
        )
      ),
      Option.match(room.notice, {
        onNone: () => h.empty,
        onSome: (text) => h.span([h.Class("problem")], [text]),
      }),
    ]
  );

const raiseLabel = (allIn: boolean, opens: boolean) => {
  if (allIn) {
    return "All in";
  }

  return opens ? "Bet" : "Raise to";
};

const raiseControls = (room: InRoom, h: H): readonly Html[] =>
  Option.match(bettingControls(room), {
    onNone: () => [],
    onSome: (controls) => [
      h.button(
        [
          h.Type("button"),
          h.Class("button act"),
          h.OnClick(Messages.ClickedAction({ action: Actions.Fold() })),
        ],
        ["Fold"]
      ),
      controls.check
        ? h.button(
            [
              h.Type("button"),
              h.Class("button act"),
              h.OnClick(Messages.ClickedAction({ action: Actions.Check() })),
            ],
            ["Check"]
          )
        : h.empty,
      Option.match(controls.call, {
        onNone: () => h.empty,
        onSome: (amount) =>
          h.button(
            [
              h.Type("button"),
              h.Class("button act"),
              h.OnClick(Messages.ClickedAction({ action: Actions.Call() })),
            ],
            [`Call ${amount}`]
          ),
      }),
      Option.match(controls.raise, {
        onNone: () => h.empty,
        onSome: ({ maxTo, minTo, opens, to }) =>
          h.div(
            [h.Class("raise")],
            [
              h.input([
                h.Type("range"),
                h.Class("raise-slider"),
                h.Min(String(minTo)),
                h.Max(String(maxTo)),
                h.Step("1"),
                h.Value(String(to)),
                h.AriaLabel("Amount"),
                h.OnInput((value) =>
                  Messages.ChangedDraft({ field: "raiseTo", value })
                ),
              ]),
              h.input([
                h.Type("number"),
                h.Class("text-input raise-amount"),
                h.Min(String(minTo)),
                h.Max(String(maxTo)),
                h.InputMode("numeric"),
                h.Value(
                  room.drafts.raiseTo === "" ? String(to) : room.drafts.raiseTo
                ),
                h.AriaLabel("Amount"),
                h.OnInput((value) =>
                  Messages.ChangedDraft({ field: "raiseTo", value })
                ),
              ]),
              h.button(
                [
                  h.Type("button"),
                  h.Class("button act primary"),
                  h.OnClick(
                    Messages.ClickedAction({ action: Actions.RaiseTo({ to }) })
                  ),
                ],
                [`${raiseLabel(to === maxTo, opens)} ${to}`]
              ),
            ]
          ),
      }),
    ],
  });

const actionBar = (room: InRoom, h: H): Html => {
  if (Option.isNone(legalOf(room))) {
    return h.empty;
  }

  if (isActing(room)) {
    return h.div(
      [h.Class("action-bar")],
      [h.span([h.Class("pending")], ["Sent. Waiting for the table…"])]
    );
  }

  if (!isLive(room)) {
    return h.div(
      [h.Class("action-bar")],
      [
        h.button(
          [h.Type("button"), h.Class("button act"), h.Disabled(true)],
          ["Fold"]
        ),
        h.span([h.Class("pending")], ["Reconnecting. Your turn waits."]),
      ]
    );
  }

  return h.div(
    [h.Class("action-bar"), h.Role("group"), h.AriaLabel("Your turn")],
    raiseControls(room, h)
  );
};

const showButton = (
  h: H,
  room: InRoom,
  cards: readonly Card[],
  label: string,
  pendingLabel: string
): Html =>
  Option.match(ShownCardsSchema.makeOption(cards), {
    onNone: () => h.empty,
    onSome: (shown) =>
      commandButton(
        h,
        room,
        Commands.ShowCards.make({ cards: shown }),
        label,
        pendingLabel
      ),
  });

const handChoices = (
  room: InRoom,
  view: OpenView,
  mySeat: Option.Option<SeatIndex>,
  h: H
): readonly Html[] => {
  const runs = view.hand.pipe(
    Option.flatMap(({ choosingRuns }) => choosingRuns),
    Option.filter(({ seats }) =>
      Option.exists(mySeat, (seat) => seats.includes(seat))
    )
  );

  const runButtons = Option.match(runs, {
    onNone: () => [],
    onSome: ({ maxRuns }) => [
      h.div(
        [h.Class("choice-row"), h.Role("group"), h.AriaLabel("How many runs")],
        [
          h.span([h.Class("muted")], ["Run it"]),
          ...Array.from({ length: maxRuns }, (_, index) =>
            Option.match(RunCountSchema.makeOption(index + 1), {
              onNone: () => h.empty,
              onSome: (count) =>
                commandButton(
                  h,
                  room,
                  Commands.ChooseRuns.make({ runs: count }),
                  index === 0 ? "Once" : `${index + 1} times`,
                  `Choosing ${index + 1} run${index === 0 ? "" : "s"}`
                ),
            })
          ),
        ]
      ),
    ],
  });

  const showdownButtons = Option.match(view.showdown, {
    onNone: () => [],
    onSome: ({ canMuck, canTable }) => [
      h.div(
        [h.Class("choice-row")],
        [
          h.span([h.Class("muted")], ["Showdown"]),
          canTable
            ? commandButton(
                h,
                room,
                Commands.TableHand.make({}),
                "Show my hand",
                "Showing",
                "button primary"
              )
            : h.empty,
          canMuck
            ? commandButton(
                h,
                room,
                Commands.MuckHand.make({}),
                "Muck",
                "Mucking"
              )
            : h.empty,
        ]
      ),
    ],
  });

  const afterHand = Option.match(view.lastHand, {
    onNone: () => [],
    onSome: (last) => {
      const mine =
        last.shown.find((entry) =>
          Option.exists(mySeat, (seat) => seat === entry.seat)
        )?.cards ?? [];

      const hidden = last.yourCards.filter((card) => !mine.includes(card));

      const canRabbit =
        view.settings.table.rabbitHunt &&
        last.rabbit.length === 0 &&
        last.boards.some((board) => board.length < 5);

      return [
        hidden.length > 0 || canRabbit
          ? h.div(
              [h.Class("choice-row")],
              [
                ...hidden.map((card) =>
                  showButton(
                    h,
                    room,
                    [card],
                    `Show ${cardLabel(card)}`,
                    `Showing ${cardLabel(card)}`
                  )
                ),
                hidden.length === 2
                  ? showButton(h, room, hidden, "Show both", "Showing both")
                  : h.empty,
                canRabbit
                  ? commandButton(
                      h,
                      room,
                      Commands.RabbitHunt.make({}),
                      "Rabbit hunt",
                      "Hunting the rabbit"
                    )
                  : h.empty,
              ]
            )
          : h.empty,
      ];
    },
  });

  return [...runButtons, ...showdownButtons, ...afterHand];
};

const sitPanel = (room: InRoom, view: OpenView, h: H): Html =>
  Option.match(room.drafts.seat, {
    onNone: () => h.empty,
    onSome: (seat) =>
      h.form(
        [
          h.Class("sit-panel card-panel"),
          h.OnSubmit(Messages.ClickedSit({ seat })),
        ],
        [
          h.label(
            [h.Class("field")],
            [
              h.span(
                [h.Class("field-label")],
                [
                  `Seat ${seat + 1}: buy in between ${view.settings.buyIn.min} and ${view.settings.buyIn.max}`,
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
          h.div(
            [h.Class("choice-row")],
            [
              h.button(
                [
                  h.Type("submit"),
                  h.Class("button primary"),
                  h.Disabled(!isLive(room)),
                ],
                ["Sit down"]
              ),
              h.button(
                [
                  h.Type("button"),
                  h.Class("button quiet"),
                  h.OnClick(Messages.ClickedCancelSeat()),
                ],
                ["Cancel"]
              ),
            ]
          ),
        ]
      ),
  });

const myArea = (
  model: Model,
  room: InRoom,
  view: OpenView,
  mySeat: Option.Option<SeatIndex>,
  h: H
): Html =>
  h.section(
    [h.Class("my-area")],
    [
      view.holeCards.length > 0
        ? h.div(
            [h.Class("my-cards")],
            view.holeCards.map((card) => cardView(card, h, "is-large"))
          )
        : Option.match(view.lastHand, {
            onNone: () => h.empty,
            onSome: ({ yourCards }) =>
              yourCards.length > 0
                ? h.div(
                    [h.Class("my-cards is-past")],
                    yourCards.map((card) => cardView(card, h, "is-large"))
                  )
                : h.empty,
          }),
      actionBar(room, h),
      ...handChoices(room, view, mySeat, h),
      sitPanel(room, view, h),
    ]
  );

const balanceOf = (view: OpenView, player: PlayerId) =>
  view.balances.find((balance) => balance.player === player);

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
  seated: boolean,
  h: H
): readonly Html[] => {
  if (view.host !== room.player || player === room.player) {
    return [];
  }

  return [
    holdsUpTheGame(view, player)
      ? commandButton(
          h,
          room,
          Commands.ActForSeat.make({ player }),
          "Act for them",
          "Acting for them",
          "button chip"
        )
      : h.empty,
    seated
      ? commandButton(
          h,
          room,
          Commands.RemoveFromSeat.make({ player }),
          "Remove from seat",
          "Removing from seat",
          "button chip"
        )
      : h.empty,
    commandButton(
      h,
      room,
      Commands.TransferHost.make({ to: player }),
      "Make host",
      "Handing over the host",
      "button chip"
    ),
  ];
};

const membersPanel = (
  room: InRoom,
  view: OpenView,
  seen: Seen,
  presence: readonly PlayerId[],
  h: H
): Html =>
  h.section(
    [h.Class("card-panel members")],
    [
      h.h2([h.Class("panel-title")], [`In the room (${view.members.length})`]),
      h.ul(
        [h.Class("member-list")],
        view.members.map((member) => {
          const seat = view.seats.find(({ occupant }) =>
            Option.exists(occupant, ({ player }) => player === member.player)
          );

          const net = balanceOf(view, member.player)?.net ?? 0;

          return h.li(
            [h.Key(`member-${member.player}`), h.Class("member")],
            [
              h.span(
                [
                  h.Class(
                    presence.includes(member.player)
                      ? "presence is-here"
                      : "presence"
                  ),
                ],
                [""]
              ),
              h.span([h.Class("member-avatar")], [member.avatar]),
              h.span(
                [h.Class("member-name")],
                [
                  member.player === room.player
                    ? `${member.name} (you)`
                    : member.name,
                ]
              ),
              member.player === view.host
                ? h.span([h.Class("tag")], ["host"])
                : h.empty,
              h.span(
                [h.Class("muted")],
                [
                  seat === undefined ? "watching" : `seat ${seat.seat + 1}`,
                  net === 0 ? "" : ` · ${net > 0 ? "+" : ""}${net}`,
                ]
              ),
              ...hostTools(room, view, member.player, seat !== undefined, h),
            ]
          );
        })
      ),
    ]
  );

const hostPanel = (room: InRoom, view: OpenView, seen: Seen, h: H): Html => {
  if (view.host !== room.player) {
    return h.empty;
  }

  return h.section(
    [h.Class("card-panel")],
    [
      h.h2([h.Class("panel-title")], ["Host"]),
      h.div(
        [h.Class("choice-row")],
        [
          view.game === "Waiting"
            ? commandButton(
                h,
                room,
                Commands.StartGame.make({}),
                "Start the game",
                "Starting",
                "button primary"
              )
            : commandButton(
                h,
                room,
                Commands.PauseGame.make({}),
                "Pause after this hand",
                "Pausing"
              ),
          view.queued.close
            ? h.span([h.Class("muted")], ["Closing after this hand."])
            : commandButton(
                h,
                room,
                Commands.CloseRoom.make({}),
                "Close the room and settle up",
                "Closing the room"
              ),
        ]
      ),
      ...view.requests.seats.map((request) =>
        h.div(
          [h.Key(`seat-request-${request.player}`), h.Class("choice-row")],
          [
            h.span(
              [],
              [
                `${seen.name(request.player)} asks for seat ${request.seat + 1} with ${request.buyIn}`,
              ]
            ),
            commandButton(
              h,
              room,
              Commands.ApproveSeat.make({ player: request.player }),
              "Approve",
              "Approving"
            ),
            commandButton(
              h,
              room,
              Commands.DenySeat.make({ player: request.player }),
              "Deny",
              "Denying",
              "button quiet"
            ),
          ]
        )
      ),
      ...view.requests.chips.map((request) =>
        h.div(
          [h.Key(`chip-request-${request.player}`), h.Class("choice-row")],
          [
            h.span(
              [],
              [
                `${seen.name(request.player)} asks for ${request.amount} more chips`,
              ]
            ),
            commandButton(
              h,
              room,
              Commands.ApproveChips.make({ player: request.player }),
              "Approve",
              "Approving"
            ),
            commandButton(
              h,
              room,
              Commands.DenyChips.make({ player: request.player }),
              "Deny",
              "Denying",
              "button quiet"
            ),
          ]
        )
      ),
    ]
  );
};

const youPanel = (
  room: InRoom,
  view: OpenView,
  mySeat: Option.Option<SeatIndex>,
  h: H
): Html => {
  const occupant = mySeat.pipe(
    Option.flatMap((seat) => Option.fromNullishOr(view.seats[seat])),
    Option.flatMap(({ occupant: who }) => who)
  );

  const waitingSeat = view.requests.seats.find(
    (request) => request.player === room.player
  );

  const waitingChips = [...view.requests.chips, ...view.queued.chips].find(
    (request) => request.player === room.player
  );

  const straddles =
    view.settings.table.straddle.underTheGun > 0 ||
    view.settings.table.straddle.button;

  return h.section(
    [h.Class("card-panel")],
    [
      h.h2([h.Class("panel-title")], ["You"]),
      waitingSeat === undefined
        ? h.empty
        : h.p(
            [h.Class("muted")],
            [`Waiting for the host to approve seat ${waitingSeat.seat + 1}.`]
          ),
      waitingChips === undefined
        ? h.empty
        : h.p(
            [h.Class("muted")],
            [`${waitingChips.amount} more chips are on the way.`]
          ),
      Option.match(occupant, {
        onNone: () =>
          h.p(
            [h.Class("muted")],
            [waitingSeat === undefined ? "Pick an empty seat to sit down." : ""]
          ),
        onSome: (seated) =>
          h.div(
            [h.Class("stack-tools")],
            [
              h.div(
                [h.Class("choice-row")],
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
                  straddles
                    ? commandButton(
                        h,
                        room,
                        Commands.DeclareStraddle.make({
                          on: !seated.straddling,
                        }),
                        seated.straddling ? "Stop straddling" : "Straddle",
                        seated.straddling
                          ? "Stopping the straddle"
                          : "Declaring a straddle"
                      )
                    : h.empty,
                  seated.leaving
                    ? h.span(
                        [h.Class("muted")],
                        ["Standing up after this hand."]
                      )
                    : commandButton(
                        h,
                        room,
                        Commands.LeaveSeat.make({}),
                        "Stand up",
                        "Standing up",
                        "button quiet"
                      ),
                ]
              ),
              h.form(
                [
                  h.Class("choice-row"),
                  h.OnSubmit(Messages.ClickedRequestChips()),
                ],
                [
                  h.input([
                    h.Type("number"),
                    h.Class("text-input chips-input"),
                    h.InputMode("numeric"),
                    h.Placeholder("Chips"),
                    h.Value(room.drafts.chips),
                    h.AriaLabel("Chips to add"),
                    h.OnInput((value) =>
                      Messages.ChangedDraft({ field: "chips", value })
                    ),
                  ]),
                  h.button(
                    [
                      h.Type("submit"),
                      h.Class("button"),
                      h.Disabled(!isLive(room)),
                    ],
                    ["Add chips"]
                  ),
                ]
              ),
            ]
          ),
      }),
      commandButton(
        h,
        room,
        Commands.LeaveRoom.make({}),
        "Leave the room",
        "Leaving",
        "button quiet"
      ),
    ]
  );
};

const tableView = (
  model: Model,
  room: InRoom,
  view: OpenView,
  presence: readonly PlayerId[],
  h: H
): Html => {
  const table = tableElement.withMessage(h);

  return table(
    [
      h.Class("table-host"),
      h.AriaLabel("Table"),
      table.Snapshot(tableSnapshot(room, view, presence, model.learned)),
      table.Sound(model.sound),
      table.OnIntent((intent) => Messages.GotTableIntent({ intent })),
    ],
    []
  );
};

const openRoomView = (
  model: Model,
  room: InRoom,
  view: OpenView,
  presence: readonly PlayerId[],
  h: H
): Html => {
  const seen = seenFrom(view.members);
  const mySeat = mySeatOf(view, room);

  return h.div(
    [h.Class("room-body")],
    [
      Option.match(room.settings, {
        onNone: () => h.empty,
        onSome: (draft) => settingsPanel(room, view, draft, h),
      }),
      tableView(model, room, view, presence, h),
      myArea(model, room, view, mySeat, h),
      h.div(
        [h.Class("panels")],
        [
          youPanel(room, view, mySeat, h),
          hostPanel(room, view, seen, h),
          membersPanel(room, view, seen, presence, h),
        ]
      ),
    ]
  );
};

const closedRoomView = (room: InRoom, view: ClosedView, h: H): Html => {
  const name = (player: PlayerId) =>
    view.members.find((member) => member.player === player)?.name ?? "Someone";

  return h.section(
    [h.Class("card-panel settlement")],
    [
      h.h2([h.Class("panel-title")], ["The night is over"]),
      h.ul(
        [h.Class("member-list")],
        [...view.settlement.balances]
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
                h.span(
                  [h.Class("muted")],
                  [
                    `bought in ${balance.boughtIn}, left with ${balance.cashedOut}`,
                  ]
                ),
              ]
            )
          )
      ),
      h.h3([h.Class("panel-title")], ["Settle up"]),
      h.pre([h.Class("transfers")], [settlementText(view)]),
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
      h.span([h.Class("muted")], [room.code]),
    ]
  );
};

const leftRoomView = (h: H): Html =>
  h.section(
    [h.Class("card-panel")],
    [
      h.h2([h.Class("panel-title")], ["You left this room"]),
      h.p(
        [h.Class("muted")],
        [
          "Go back home. To play again, open the room link and join as a new player.",
        ]
      ),
      h.button(
        [
          h.Type("button"),
          h.Class("button"),
          h.OnClick(Messages.ClickedHome()),
        ],
        ["Back home"]
      ),
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
            ? h.div(
                [h.Class("card-panel")],
                [
                  h.p([], ["This room is no longer open to you."]),
                  h.button(
                    [
                      h.Type("button"),
                      h.Class("button"),
                      h.OnClick(Messages.ClickedHome()),
                    ],
                    ["Back home"]
                  ),
                ]
              )
            : h.p([h.Class("muted")], ["Opening the room…"]),
        onSome: (current) =>
          RoomViews.$match(current, {
            Closed: (closed) => closedRoomView(room, closed, h),
            Open: (live) =>
              live.members.some(({ player }) => player === room.player)
                ? openRoomView(model, room, live, presence, h)
                : leftRoomView(h),
          }),
      }),
    ]
  );
};
