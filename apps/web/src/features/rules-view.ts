import { Option, Result } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import { Messages } from "./message.js";
import type { Message } from "./message.js";
import type { InRoom, RulesSheet, SettingsDraft } from "./model.js";
import type { OpenView } from "./room.js";
import { isLive, isYou } from "./room.js";
import { GROUP_TITLES, PRESET_LABELS } from "./rules-copy.js";
import type { RuleGroup } from "./rules-copy.js";
import {
  groupsWithRules,
  groupSummary,
  isRelevant,
  linesIn,
  openDraft,
  presetOf,
  presetsInOrder,
  pressed,
  rulesCardOf,
  valueText,
} from "./rules.js";
import type { CardPart, RuleLine } from "./rules.js";
import { optionLabel, savesAs, settingsFrom } from "./settings.js";
import { icon, sheetLayer, sheetTop } from "./sheet.js";

type H = HtmlBuilder<Message>;

const partsView = (parts: readonly CardPart[], h: H): readonly Html[] =>
  parts.flatMap(({ changed, text }, index) => [
    index === 0 ? h.empty : h.span([h.Class("rule-dot")], [" · "]),
    changed
      ? h.b([h.Key(`part-${index}`)], [text])
      : h.span([h.Key(`part-${index}`)], [text]),
  ]);

export const rulesCard = (view: OpenView, h: H): Html => {
  const { headline, rest } = rulesCardOf(openDraft(view.settings));

  return h.button(
    [
      h.Type("button"),
      h.Class("rules-card"),
      h.OnClick(Messages.ClickedHouseRules()),
    ],
    [
      h.span(
        [h.Class("rules-card-label")],
        [
          "House rules",
          isYou(view, view.host)
            ? h.span([h.Class("rules-card-edit")], ["Edit"])
            : icon("Chevron", h),
        ]
      ),
      h.span([h.Class("rules-card-headline")], partsView(headline, h)),
      rest.length === 0
        ? h.empty
        : h.span([h.Class("rules-card-rest")], partsView(rest, h)),
    ]
  );
};

const optionsOf = (line: RuleLine): readonly string[] => {
  const { field } = line;

  if (field.kind === "Choice") {
    return field.options;
  }

  if (field.kind === "Variant") {
    return field.variants.map(({ tag }) => tag);
  }

  return [];
};

const change = (path: string, value: string) =>
  Messages.ChangedSetting({ path, value });

const controlView = (line: RuleLine, draft: SettingsDraft, h: H): Html => {
  const { control, label, path } = line.copy;
  const current = draft[path] ?? "";

  if (control.kind === "Switch") {
    const on = current === control.on;

    return h.button(
      [
        h.Type("button"),
        h.Class(on ? "switch is-on" : "switch"),
        h.Role("switch"),
        h.AriaChecked(on),
        h.AriaLabel(label),
        h.OnClick(change(path, pressed(control, draft, path, "Toggle"))),
      ],
      []
    );
  }

  if (control.kind === "Segments") {
    return h.div(
      [h.Class("segments"), h.Role("radiogroup"), h.AriaLabel(label)],
      optionsOf(line).map((option) =>
        h.button(
          [
            h.Type("button"),
            h.Key(`${path}-${option}`),
            h.Class(option === current ? "segment is-on" : "segment"),
            h.Role("radio"),
            h.AriaChecked(option === current),
            h.OnClick(change(path, option)),
          ],
          [control.labels[option] ?? optionLabel(option)]
        )
      )
    );
  }

  return h.div(
    [h.Class("stepper")],
    [
      h.button(
        [
          h.Type("button"),
          h.Class("step"),
          h.AriaLabel(`Less ${label.toLowerCase()}`),
          h.OnClick(change(path, pressed(control, draft, path, "Less"))),
        ],
        ["−"]
      ),
      h.input([
        h.Type("number"),
        h.Class("step-value"),
        h.InputMode("numeric"),
        h.AriaLabel(label),
        h.Min(String(control.min)),
        h.Value(current),
        h.OnInput((value) => change(path, value)),
      ]),
      control.unit.length > 0
        ? h.span([h.Class("step-unit")], [control.unit])
        : h.empty,
      h.button(
        [
          h.Type("button"),
          h.Class("step"),
          h.AriaLabel(`More ${label.toLowerCase()}`),
          h.OnClick(change(path, pressed(control, draft, path, "More"))),
        ],
        ["+"]
      ),
    ]
  );
};

const lineView = (
  line: RuleLine,
  draft: SettingsDraft,
  sheet: RulesSheet,
  editing: boolean,
  h: H
): Html => {
  const { help, label, path } = line.copy;
  const helpOpen = Option.contains(sheet.help, path);

  const name = Option.match(help, {
    onNone: () => h.span([h.Class("rule-name")], [label]),
    onSome: () =>
      h.button(
        [
          h.Type("button"),
          h.Class("rule-name has-help"),
          h.AriaExpanded(helpOpen),
          h.OnClick(Messages.ClickedRuleHelp({ path })),
        ],
        [label]
      ),
  });

  const value = editing
    ? controlView(line, draft, h)
    : h.span([h.Class("rule-value")], [valueText(line, draft)]);

  return h.div(
    [h.Key(`rule-${path}`), h.Class("rule-line")],
    [
      name,
      line.field.kind === "Unsupported"
        ? h.span([h.Class("rule-value")], ["Fixed"])
        : value,
      helpOpen
        ? h.p([h.Class("rule-help")], [Option.getOrElse(help, () => "")])
        : h.empty,
    ]
  );
};

const groupView = (
  group: RuleGroup,
  draft: SettingsDraft,
  sheet: RulesSheet,
  editing: boolean,
  h: H
): Html => {
  const open = Option.contains(sheet.open, group);
  const summary = groupSummary(group, draft);

  return h.div(
    [
      h.Key(`group-${group}`),
      h.Class(open ? "rule-group is-open" : "rule-group"),
    ],
    [
      h.button(
        [
          h.Type("button"),
          h.Class("rule-group-row"),
          h.AriaExpanded(open),
          h.OnClick(Messages.ClickedRuleGroup({ group })),
        ],
        [
          h.span([h.Class("rule-group-name")], [GROUP_TITLES[group]]),
          h.span(
            [h.Class("rule-group-summary")],
            summary.length === 0 ? ["Standard"] : partsView(summary, h)
          ),
          icon("Chevron", h),
        ]
      ),
      open
        ? h.div(
            [h.Class("rule-lines")],
            linesIn(group)
              .filter((line) => isRelevant(line, draft))
              .map((line) => lineView(line, draft, sheet, editing, h))
          )
        : h.empty,
    ]
  );
};

const presetRow = (draft: SettingsDraft, h: H): Html => {
  const current = presetOf(draft);

  return h.div(
    [h.Class("segments presets"), h.Role("radiogroup"), h.AriaLabel("Game")],
    presetsInOrder.map((preset) =>
      h.button(
        [
          h.Type("button"),
          h.Key(`preset-${preset}`),
          h.Class(
            Option.contains(current, preset) ? "segment is-on" : "segment"
          ),
          h.Role("radio"),
          h.AriaChecked(Option.contains(current, preset)),
          h.OnClick(Messages.ChosePreset({ preset })),
        ],
        [PRESET_LABELS[preset]]
      )
    )
  );
};

const saveRow = (
  room: InRoom,
  view: OpenView,
  draft: SettingsDraft,
  h: H
): Html => {
  const fits = Result.isSuccess(settingsFrom(draft));
  const unchanged = savesAs(draft, view.settings);

  return h.div(
    [h.Class("rules-save")],
    [
      h.button(
        [
          h.Type("submit"),
          h.Class("button primary"),
          h.Disabled(!isLive(room) || !fits || unchanged),
        ],
        ["Save"]
      ),
      fits
        ? h.span(
            [h.Class("rules-when")],
            [Option.isSome(view.hand) ? "From the next hand" : ""]
          )
        : h.span([h.Class("rules-when is-wrong")], ["Check the numbers"]),
    ]
  );
};

export const rulesSheet = (
  room: InRoom,
  view: OpenView,
  sheet: RulesSheet,
  h: H
): Html => {
  const editing = isYou(view, view.host);
  const draft = editing ? sheet.draft : openDraft(view.settings);

  return sheetLayer(h, "House rules", "rules-sheet", [
    sheetTop(h, h.h2([h.Class("sheet-title")], ["House rules"])),
    h.form(
      [h.Class("rules-form"), h.OnSubmit(Messages.ClickedSaveSettings())],
      [
        editing ? presetRow(draft, h) : h.empty,
        h.div(
          [h.Class("rule-groups")],
          groupsWithRules.map((group) =>
            groupView(group, draft, sheet, editing, h)
          )
        ),
        editing ? saveRow(room, view, draft, h) : h.empty,
      ]
    ),
  ]);
};
