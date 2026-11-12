import { Option, Result } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import { modalElement } from "./face/stage.js";
import { Messages } from "./message.js";
import type { Message } from "./message.js";
import type { InRoom, Model, SetupSheet, SettingsDraft } from "./model.js";
import type { OpenView } from "./room.js";
import { isLive } from "./room.js";
import { PRESET_LABELS } from "./rules-copy.js";
import { controlView } from "./rules-view.js";
import { presetOf, presetsInOrder } from "./rules.js";
import type { RuleLine } from "./rules.js";
import { settingsFrom } from "./settings.js";
import {
  BLIND_LINES,
  BUY_IN_LINES,
  EXTRAS,
  extraFlipped,
  extraLabel,
  roomDraft,
  shownAmounts,
} from "./setup.js";
import type { Extra } from "./setup.js";
import { sheetLayer, sheetTop } from "./sheet.js";
import { roomPath } from "./wire.js";

type H = HtmlBuilder<Message>;

const setupChange = (path: string, value: string) =>
  Messages.ChangedSetupSetting({ path, value });

const draftOf = (view: OpenView, setup: SetupSheet) =>
  Option.getOrElse(setup.edits, () => roomDraft(view));

const linkText = (model: Model, room: InRoom) =>
  `${model.origin.replace(/^https?:\/\//u, "")}${roomPath(room.code)}`;

const invitePart = (model: Model, room: InRoom, h: H): Html =>
  h.section(
    [h.Class("setup-part")],
    [
      h.h3([h.Class("setup-heading")], ["Invite your friends"]),
      h.p([h.Class("setup-link")], [linkText(model, room)]),
      h.div(
        [h.Class("setup-invite")],
        [
          h.button(
            [
              h.Type("button"),
              h.Class("button primary"),
              h.OnClick(Messages.ClickedShareLink()),
            ],
            [room.copied === "Shared" ? "Shared" : "Share the link"]
          ),
          h.button(
            [
              h.Type("button"),
              h.Class("button"),
              h.OnClick(Messages.ClickedCopyLink()),
            ],
            [room.copied === "Link" ? "Copied" : "Copy"]
          ),
        ]
      ),
    ]
  );

const amountCell = (line: RuleLine, draft: SettingsDraft, h: H): Html =>
  h.div(
    [h.Key(`cell-${line.copy.path}`), h.Class("setup-cell")],
    [
      h.span([h.Class("setup-cell-name")], [line.copy.label]),
      controlView(line, draft, h, setupChange),
    ]
  );

const pairRow = (
  lines: readonly RuleLine[],
  draft: SettingsDraft,
  h: H
): Html =>
  h.div(
    [h.Class("setup-pair")],
    lines.map((line) => amountCell(line, draft, h))
  );

const styleRow = (draft: SettingsDraft, h: H): Html => {
  const current = presetOf(draft);

  return h.div(
    [
      h.Class("segments presets setup-styles"),
      h.Role("radiogroup"),
      h.AriaLabel("Game"),
    ],
    presetsInOrder.map((preset) =>
      h.button(
        [
          h.Type("button"),
          h.Key(`setup-preset-${preset}`),
          h.Class(
            Option.contains(current, preset) ? "segment is-on" : "segment"
          ),
          h.Role("radio"),
          h.AriaChecked(Option.contains(current, preset)),
          h.OnClick(Messages.ChoseSetupPreset({ preset })),
        ],
        [PRESET_LABELS[preset]]
      )
    )
  );
};

const amountLine = (line: RuleLine, draft: SettingsDraft, h: H): Html =>
  h.div(
    [h.Key(`amount-${line.copy.path}`), h.Class("rule-line setup-amount")],
    [
      h.span([h.Class("rule-name")], [line.copy.label]),
      controlView(line, draft, h, setupChange),
    ]
  );

const extraView = (extra: Extra, draft: SettingsDraft, h: H): Html => {
  const on = extra.isOn(draft);
  const label = extraLabel(extra, draft);
  const amounts = shownAmounts(extra, draft);

  return h.div(
    [
      h.Key(`extra-${extra.kind}`),
      h.Class(on ? "setup-extra is-on" : "setup-extra"),
    ],
    [
      h.button(
        [
          h.Type("button"),
          h.Class("setup-switch"),
          h.Role("switch"),
          h.AriaChecked(on),
          h.AriaLabel(label),
          h.OnClick(
            setupChange(extra.line.field.path, extraFlipped(extra, draft))
          ),
        ],
        [
          h.span([h.Class("rule-name")], [label]),
          h.span(
            [h.Class(on ? "switch is-on" : "switch"), h.AriaHidden(true)],
            []
          ),
        ]
      ),
      ...amounts.map((line) => amountLine(line, draft, h)),
      on
        ? Option.match(extra.line.copy.help, {
            onNone: () => h.empty,
            onSome: (help) => h.p([h.Class("rule-help")], [help]),
          })
        : h.empty,
    ]
  );
};

const gamePart = (room: InRoom, draft: SettingsDraft, h: H): Html => {
  const fits = Result.isSuccess(settingsFrom(draft));

  return h.section(
    [h.Class("setup-part")],
    [
      h.div(
        [h.Class("setup-heading-row")],
        [
          h.h3([h.Class("setup-heading")], ["The game"]),
          h.button(
            [
              h.Type("button"),
              h.Class("setup-all"),
              h.OnClick(Messages.ClickedHouseRules()),
            ],
            ["All rules"]
          ),
        ]
      ),
      pairRow(BLIND_LINES, draft, h),
      pairRow(BUY_IN_LINES, draft, h),
      styleRow(draft, h),
      h.div(
        [h.Class("setup-extras")],
        EXTRAS.map((extra) => extraView(extra, draft, h))
      ),
      fits ? h.empty : h.p([h.Class("problem")], ["Check the numbers."]),
      Option.match(room.notice, {
        onNone: () => h.empty,
        onSome: (text) => h.p([h.Class("problem")], [text]),
      }),
      isLive(room)
        ? h.empty
        : h.p(
            [h.Class("muted")],
            ["Reconnecting. Changes wait until the room answers."]
          ),
    ]
  );
};

export const setupSheet = (
  model: Model,
  room: InRoom,
  view: OpenView,
  setup: SetupSheet,
  h: H
): Html => {
  const modal = modalElement.withMessage(h);
  const draft = draftOf(view, setup);

  return modal(
    [
      h.Class("setup-modal"),
      modal.Opener(".invite-button"),
      modal.OnCancel(() => Messages.ClosedSheet()),
    ],
    [
      sheetLayer(h, "Set up the game", "setup-sheet", [
        sheetTop(
          h,
          h.h2(
            [
              h.Class("sheet-title"),
              h.Tabindex(-1),
              h.DataAttribute("modal-focus", "sheet"),
            ],
            ["Your room is open"]
          )
        ),
        invitePart(model, room, h),
        gamePart(room, draft, h),
        h.div(
          [h.Class("setup-done")],
          [
            h.button(
              [
                h.Type("button"),
                h.Class("button"),
                h.OnClick(Messages.ClosedSheet()),
              ],
              ["Go to the table"]
            ),
          ]
        ),
      ]),
    ]
  );
};
