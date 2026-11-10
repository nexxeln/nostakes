import { Match, Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import { Messages } from "./message.js";
import type { Message } from "./message.js";
import type { InRoom, SettingsDraft } from "./model.js";
import type { OpenView } from "./room.js";
import { isLive } from "./room.js";
import { optionLabel, SETTINGS_FORM } from "./settings.js";
import type { FieldText, SettingField } from "./settings.js";

type H = HtmlBuilder<Message>;

const describe = (field: FieldText, h: H): Html =>
  field.description.length > 0
    ? h.span([h.Class("field-help")], [field.description])
    : h.empty;

const choiceRow = (
  field: FieldText,
  options: readonly string[],
  current: string,
  h: H
): Html =>
  h.div(
    [h.Class("choice-row"), h.Role("radiogroup"), h.AriaLabel(field.title)],
    options.map((option) =>
      h.button(
        [
          h.Type("button"),
          h.Key(`${field.path}-${option}`),
          h.Class(option === current ? "button chip is-picked" : "button chip"),
          h.Role("radio"),
          h.AriaChecked(option === current),
          h.OnClick(
            Messages.ChangedSetting({ path: field.path, value: option })
          ),
        ],
        [optionLabel(option)]
      )
    )
  );

const labelled = (field: FieldText, body: readonly Html[], h: H): Html =>
  h.div(
    [h.Key(field.path), h.Class("field")],
    [
      h.span([h.Class("field-label")], [field.title]),
      ...body,
      describe(field, h),
    ]
  );

const fieldView = (field: SettingField, draft: SettingsDraft, h: H): Html => {
  const current = draft[field.path] ?? "";

  return Match.value(field).pipe(
    Match.discriminatorsExhaustive("kind")({
      Choice: (choice) =>
        labelled(choice, [choiceRow(choice, choice.options, current, h)], h),
      Group: (group) =>
        h.fieldset(
          [h.Key(group.path), h.Class("settings-group")],
          [
            h.legend([h.Class("panel-title")], [group.title]),
            describe(group, h),
            h.div(
              [h.Class("settings-grid")],
              group.fields.map((inner) => fieldView(inner, draft, h))
            ),
          ]
        ),
      Number: (number) =>
        labelled(
          number,
          [
            h.input([
              h.Type("number"),
              h.Class("text-input"),
              h.InputMode("numeric"),
              h.AriaLabel(number.title),
              h.Value(current),
              h.OnInput((value) =>
                Messages.ChangedSetting({ path: number.path, value })
              ),
            ]),
          ],
          h
        ),
      Toggle: (toggle) =>
        labelled(toggle, [choiceRow(toggle, ["true", "false"], current, h)], h),
      Unsupported: (unsupported) =>
        h.p(
          [h.Key(unsupported.path), h.Class("problem")],
          [`${unsupported.title} cannot be edited here yet.`]
        ),
      Variant: (variant) => {
        const chosen = variant.variants.find(({ tag }) => tag === current);

        return labelled(
          variant,
          [
            choiceRow(
              variant,
              variant.variants.map(({ tag }) => tag),
              current,
              h
            ),
            ...(chosen?.fields ?? []).map((inner) =>
              fieldView(inner, draft, h)
            ),
          ],
          h
        );
      },
    })
  );
};

export const settingsPanel = (
  room: InRoom,
  view: OpenView,
  draft: SettingsDraft,
  h: H
): Html =>
  h.div(
    [h.Class("sheet-layer")],
    [
      h.button(
        [
          h.Type("button"),
          h.Class("sheet-scrim"),
          h.AriaLabel("Dismiss"),
          h.OnClick(Messages.ClickedCloseSettings()),
        ],
        []
      ),
      h.form(
        [
          h.Class("sheet settings"),
          h.Role("dialog"),
          h.AriaLabel("Room settings"),
          h.OnSubmit(Messages.ClickedSaveSettings()),
        ],
        [
          h.h2([h.Class("sheet-title")], ["Room settings"]),
          Option.isSome(view.hand)
            ? h.p(
                [h.Class("muted")],
                ["A hand is running. Table rules change from the next hand."]
              )
            : h.empty,
          h.div(
            [h.Class("settings-grid")],
            SETTINGS_FORM.map((field) => fieldView(field, draft, h))
          ),
          h.div(
            [h.Class("sheet-actions")],
            [
              h.button(
                [
                  h.Type("submit"),
                  h.Class("button primary"),
                  h.Disabled(!isLive(room)),
                ],
                ["Save settings"]
              ),
              h.button(
                [
                  h.Type("button"),
                  h.Class("button quiet"),
                  h.OnClick(Messages.ClickedCloseSettings()),
                ],
                ["Close"]
              ),
            ]
          ),
        ]
      ),
    ]
  );
