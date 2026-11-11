import {
  choicesOf,
  closeUpOf,
  EXPRESSIONS,
  PAIRS,
  PLACELESS_PARTS,
} from "@nostakes/avatar";
import type { Avatar, Expression, Part, PlacedPart } from "@nostakes/avatar";
import { Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import {
  choiceName,
  PART_LABELS,
  shortName,
  sidesOf,
  toldOf,
  wearing,
} from "./face/parts.js";
import type { Side } from "./face/parts.js";
import { faceElement, modalElement } from "./face/stage.js";
import { faceMarkup, iconMarkup, suitMarkup } from "./markup.js";
import { Messages } from "./message.js";
import type { Message } from "./message.js";
import { pageTheme, Screens } from "./model.js";
import type { Model, Theme } from "./model.js";

type H = HtmlBuilder<Message>;

const TILE_ASPECT = 1.5;

const CLOSE_UP_PX = 200;

const WHOLE_FACE_PX = 56;

const CALLOUT_PX = 150;

const TOKEN_PX = 32;

const MOOD_PX = 44;

const UNDO_PX = 36;

const MOODS: readonly { readonly mood: Expression; readonly label: string }[] =
  EXPRESSIONS.map((mood) => ({
    label: {
      Folded: "Folded",
      Gutted: "Lost",
      Happy: "Won",
      LookingDown: "Peeking",
      Resting: "Waiting",
      Thinking: "Thinking",
    }[mood],
    mood,
  }));

export const face = (
  avatar: Avatar,
  expression: Expression,
  look: { readonly size: number; readonly theme: Theme },
  className: string,
  h: H
): Html =>
  h.span(
    [
      h.Class(className),
      h.AriaHidden(true),
      faceMarkup(h, avatar, {
        expression,
        size: look.size,
        theme: look.theme,
      }),
    ],
    []
  );

const isPlaceless = (part: Part) =>
  PLACELESS_PARTS.some((placeless) => placeless === part);

export const choiceId = (part: Part, choice: string) =>
  `face-choice-${part}-${choice}`;

const FLIP_KEYS = new Map([
  ["ArrowLeft", -1],
  ["ArrowRight", 1],
]);

const flipOn = (part: Part) => (key: string) =>
  Option.fromNullishOr(FLIP_KEYS.get(key)).pipe(
    Option.map((by) => Messages.FlippedFacePart({ by, part }))
  );

type Rove = (at: number, count: number) => number;

const onward: Rove = (at, count) => (at + 1) % count;

const back: Rove = (at, count) => (at - 1 + count) % count;

const ROVE_KEYS = new Map<string, Rove>([
  ["ArrowDown", onward],
  ["ArrowLeft", back],
  ["ArrowRight", onward],
  ["ArrowUp", back],
  ["End", (_at, count) => count - 1],
  ["Home", () => 0],
]);

export const rovedTo = (
  part: Part,
  choice: string,
  key: string
): Option.Option<string> =>
  Option.fromNullishOr(ROVE_KEYS.get(key)).pipe(
    Option.flatMap((step) => {
      const choices = choicesOf(part);

      return Option.fromNullishOr(
        choices[step(choices.indexOf(choice), choices.length)]
      );
    })
  );

const roveFrom = (draft: Avatar, part: Part, choice: string) => (key: string) =>
  rovedTo(part, choice, key).pipe(
    Option.map((next) => ({
      focusSelector: `#${choiceId(part, next)}`,
      message: Messages.PickedAvatar({ avatar: wearing(draft, part, next) }),
    }))
  );

const choiceTile = (
  draft: Avatar,
  part: Part,
  choice: string,
  theme: Theme,
  h: H
): Html => {
  const worn = wearing(draft, part, choice);
  const picked = draft[part] === choice;
  const name = choiceName(part, choice);

  return h.button(
    [
      h.Type("button"),
      h.Key(choiceId(part, choice)),
      h.Id(choiceId(part, choice)),
      h.Role("radio"),
      h.AriaChecked(picked),
      h.AriaLabel(name),
      h.Title(name),
      h.Tabindex(picked ? 0 : -1),
      h.Class(picked ? "face-choice is-picked" : "face-choice"),
      h.OnClick(Messages.PickedAvatar({ avatar: worn })),
      h.OnKeyDownFocus(roveFrom(draft, part, choice)),
    ],
    [
      h.span(
        [
          h.Class("face-choice-art"),
          h.AriaHidden(true),
          faceMarkup(h, worn, {
            expression: "Resting",
            parts: true,
            size:
              isPlaceless(part) && part !== "suit"
                ? WHOLE_FACE_PX
                : CLOSE_UP_PX,
            theme,
            uncovered: part,
            window: closeUpOf(worn, part, TILE_ASPECT),
          }),
        ],
        []
      ),
    ]
  );
};

const tray = (draft: Avatar, part: Part, theme: Theme, h: H): Html =>
  h.section(
    [h.Class("face-tray"), h.Key(part)],
    [
      h.h3(
        [h.Class("face-tray-title")],
        [
          PART_LABELS[part],
          h.span(
            [h.Class("face-tray-picked")],
            [choiceName(part, draft[part])]
          ),
        ]
      ),
      h.div(
        [
          h.Class("face-choices"),
          h.Role("radiogroup"),
          h.AriaLabel(PART_LABELS[part]),
          h.DataAttribute("part", part),
        ],
        choicesOf(part).map((choice) =>
          choiceTile(draft, part, choice, theme, h)
        )
      ),
    ]
  );

const calloutText = (draft: Avatar, part: Part, h: H): Html =>
  h.span(
    [h.Class("face-callout-text")],
    [
      h.span([h.Class("face-callout-label")], [PART_LABELS[part]]),
      h.span([h.Class("face-callout-name")], [shortName(part, draft[part])]),
    ]
  );

const callout = (
  draft: Avatar,
  part: PlacedPart,
  side: Side,
  held: Part,
  theme: Theme,
  h: H
): Html =>
  h.button(
    [
      h.Type("button"),
      h.Key(part),
      h.Attribute("slot", side),
      h.DataAttribute("part", part),
      h.Class(held === part ? "face-callout is-held" : "face-callout"),
      h.AriaPressed(String(held === part)),
      h.AriaLabel(toldOf(draft, part)),
      h.OnClick(Messages.ChoseFacePart({ part })),
      h.OnKeyDownPreventDefault(flipOn(part)),
    ],
    [
      h.span(
        [
          h.Class("face-callout-art"),
          h.AriaHidden(true),
          faceMarkup(h, draft, {
            expression: "Resting",
            parts: true,
            size: CALLOUT_PX,
            theme,
            uncovered: part,
            window: closeUpOf(draft, part, 1),
          }),
        ],
        []
      ),
      calloutText(draft, part, h),
    ]
  );

const token = (draft: Avatar, part: Part, theme: Theme, h: H): Html => {
  if (part === "colour") {
    return h.span(
      [h.Class("face-token is-colour"), h.AriaHidden(true)],
      [
        h.span([h.Style({ background: PAIRS[draft.colour].body })], []),
        h.span([h.Style({ background: PAIRS[draft.colour].fin })], []),
      ]
    );
  }

  return part === "suit"
    ? h.span(
        [
          h.Class("face-token is-suit"),
          h.AriaHidden(true),
          suitMarkup(h, draft.suit),
        ],
        []
      )
    : face(
        draft,
        "Resting",
        { size: TOKEN_PX, theme },
        "face-token is-fish",
        h
      );
};

const plate = (draft: Avatar, held: Part, theme: Theme, h: H): Html =>
  h.div(
    [h.Class("face-plate"), h.Role("group"), h.AriaLabel("The fish itself")],
    PLACELESS_PARTS.map((part) =>
      h.button(
        [
          h.Type("button"),
          h.Key(part),
          h.DataAttribute("part", part),
          h.Class(held === part ? "face-callout is-held" : "face-callout"),
          h.AriaPressed(String(held === part)),
          h.AriaLabel(toldOf(draft, part)),
          h.OnClick(Messages.ChoseFacePart({ part })),
          h.OnKeyDownPreventDefault(flipOn(part)),
        ],
        [token(draft, part, theme, h), calloutText(draft, part, h)]
      )
    )
  );

const stage = (model: Model, draft: Avatar, theme: Theme, h: H): Html => {
  const element = faceElement.withMessage(h);
  const sides = sidesOf(draft);

  return element(
    [
      h.Class("face-stage"),
      element.Face(draft),
      element.Held(model.facePart),
      element.Hint(!model.faceLearned),
      element.Mood(model.faceMood),
      element.Shuffles(model.faceShuffles),
      element.Theme(theme),
      element.OnHold(({ part }) => Messages.ChoseFacePart({ part })),
      element.OnFlip(({ by, part }) => Messages.FlippedFacePart({ by, part })),
    ],
    [
      ...sides.left.map((part) =>
        callout(draft, part, "left", model.facePart, theme, h)
      ),
      ...sides.right.map((part) =>
        callout(draft, part, "right", model.facePart, theme, h)
      ),
    ]
  );
};

const mirror = (draft: Avatar, shown: Expression, theme: Theme, h: H): Html =>
  h.div(
    [h.Class("face-mirror")],
    [
      h.p(
        [h.Class("face-tray-title")],
        [
          "At the table",
          h.span(
            [h.Class("face-tray-picked")],
            [MOODS.find(({ mood }) => mood === shown)?.label ?? ""]
          ),
        ]
      ),
      h.div(
        [h.Class("face-moods"), h.Role("group"), h.AriaLabel("At the table")],
        MOODS.map(({ label, mood }) =>
          h.button(
            [
              h.Type("button"),
              h.Key(mood),
              h.Class(mood === shown ? "face-mood is-shown" : "face-mood"),
              h.AriaPressed(String(mood === shown)),
              h.AriaLabel(label),
              h.Title(label),
              h.OnClick(
                Messages.ChoseFaceMood({
                  mood: mood === shown ? "Resting" : mood,
                })
              ),
            ],
            [face(draft, mood, { size: MOOD_PX, theme }, "face-mood-art", h)]
          )
        )
      ),
    ]
  );

const undoButton = (past: readonly Avatar[], theme: Theme, h: H): Html =>
  h.button(
    [
      h.Type("button"),
      h.Class("button face-undo"),
      h.AriaLabel("Back to the face before"),
      h.Title("Back to the face before"),
      h.Disabled(past.length === 0),
      h.OnClick(Messages.ClickedUndoFace()),
    ],
    [
      Option.match(Option.fromNullishOr(past.at(-1)), {
        onNone: () => h.span([h.Class("face-undo-art")], []),
        onSome: (before) =>
          face(before, "Resting", { size: UNDO_PX, theme }, "face-undo-art", h),
      }),
      h.span([h.Class("icon"), h.AriaHidden(true), iconMarkup(h, "Undo")], []),
    ]
  );

const bar = (model: Model, theme: Theme, h: H): Html =>
  h.div(
    [h.Class("face-bar")],
    [
      undoButton(model.facePast, theme, h),
      h.button(
        [
          h.Type("button"),
          h.Class("button face-shuffle"),
          h.OnClick(Messages.ClickedShuffleFace()),
        ],
        ["Shuffle"]
      ),
      h.button(
        [
          h.Type("button"),
          h.Class("face-close"),
          h.AriaLabel("Close without saving"),
          h.Title("Close without saving"),
          h.OnClick(Messages.ClickedCancelFace()),
        ],
        [
          h.span(
            [h.Class("icon"), h.AriaHidden(true), iconMarkup(h, "Close")],
            []
          ),
        ]
      ),
      h.button(
        [
          h.Type("button"),
          h.Class("button primary face-done"),
          h.OnClick(Messages.ClickedSaveFace()),
        ],
        ["Done"]
      ),
    ]
  );

const OPENERS = {
  Home: () => ".face-row",
  Invited: () => ".face-row",
  Room: () => ".face-button",
  Welcome: () => "body",
};

export const faceSheet = (model: Model, draft: Avatar, h: H): Html => {
  const modal = modalElement.withMessage(h);
  const theme = pageTheme(model);

  return modal(
    [
      h.Class("face-sheet"),
      modal.Opener(Screens.match(model.screen, OPENERS)),
      modal.OnCancel(() => Messages.ClickedCancelFace()),
    ],
    [
      h.section(
        [
          h.Class("face-builder"),
          h.Role("dialog"),
          h.AriaModal(true),
          h.AriaLabel("Your face"),
          h.Tabindex(-1),
          h.DataAttribute("modal-focus", "sheet"),
        ],
        [
          h.div(
            [h.Class("face-main")],
            [
              stage(model, draft, theme, h),
              plate(draft, model.facePart, theme, h),
            ]
          ),
          h.div(
            [h.Class("face-side")],
            [
              tray(draft, model.facePart, theme, h),
              mirror(draft, model.faceMood, theme, h),
              bar(model, theme, h),
            ]
          ),
          h.p([h.Class("face-told"), h.AriaLive("polite")], [model.faceTold]),
        ]
      ),
    ]
  );
};
