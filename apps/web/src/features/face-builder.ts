import {
  codeFor,
  COLOURS,
  EXTRAS,
  EYES,
  EYEWEAR,
  HEADWEAR,
  MARKS,
  MOUTHS,
  NECKWEAR,
  RANKS,
  render,
  SPECIES,
  SUITS,
} from "@nostakes/avatar";
import type { Avatar, Expression } from "@nostakes/avatar";
import type { Html, HtmlBuilder } from "foldkit/html";

import { Messages } from "./message.js";
import type { Message } from "./message.js";
import type { FacePart } from "./model.js";

type H = HtmlBuilder<Message>;

const PREVIEW_PX = 168;

const OPTION_PX = 60;

const STRIP_PX = 44;

interface Choice {
  readonly key: string;
  readonly label: string;
  readonly avatar: Avatar;
  readonly picked: boolean;
}

interface PartPicker {
  readonly label: string;
  readonly closeUp: boolean;
  readonly choices: (avatar: Avatar) => readonly Choice[];
}

const spaced = (name: string) => name.replaceAll(/(?<=[a-z])(?=[A-Z])/gu, " ");

const choicesOf =
  <K extends keyof Avatar>(key: K, options: readonly Avatar[K][]) =>
  (avatar: Avatar): readonly Choice[] =>
    options.map((option) => ({
      avatar: { ...avatar, [key]: option },
      key: `${key}-${option}`,
      label: spaced(option),
      picked: avatar[key] === option,
    }));

const PICKERS: Readonly<Record<FacePart, PartPicker>> = {
  Card: { choices: choicesOf("rank", RANKS), closeUp: false, label: "Card" },
  Colour: {
    choices: choicesOf("colour", COLOURS),
    closeUp: false,
    label: "Colour",
  },
  Extra: {
    choices: choicesOf("extra", EXTRAS),
    closeUp: false,
    label: "Extra",
  },
  Eyes: { choices: choicesOf("eyes", EYES), closeUp: true, label: "Eyes" },
  Eyewear: {
    choices: choicesOf("eyewear", EYEWEAR),
    closeUp: true,
    label: "Glasses",
  },
  Headwear: {
    choices: choicesOf("headwear", HEADWEAR),
    closeUp: false,
    label: "Hat",
  },
  Mark: { choices: choicesOf("mark", MARKS), closeUp: true, label: "Mark" },
  Mouth: { choices: choicesOf("mouth", MOUTHS), closeUp: true, label: "Mouth" },
  Neck: { choices: choicesOf("neck", NECKWEAR), closeUp: false, label: "Neck" },
  Species: {
    choices: choicesOf("species", SPECIES),
    closeUp: false,
    label: "Species",
  },
  Suit: { choices: choicesOf("suit", SUITS), closeUp: false, label: "Suit" },
};

const PART_ORDER: readonly FacePart[] = [
  "Species",
  "Colour",
  "Suit",
  "Card",
  "Eyes",
  "Mouth",
  "Headwear",
  "Eyewear",
  "Neck",
  "Mark",
  "Extra",
];

const STRIP: readonly { expression: Expression; label: string }[] = [
  { expression: "Resting", label: "Waiting" },
  { expression: "LookingDown", label: "Looking at cards" },
  { expression: "Thinking", label: "Thinking" },
  { expression: "Happy", label: "Won a pot" },
  { expression: "Gutted", label: "Lost a pot" },
  { expression: "Folded", label: "Folded" },
];

export const face = (
  avatar: Avatar,
  expression: Expression,
  size: number,
  className: string,
  h: H
): Html =>
  h.span(
    [
      h.Class(className),
      h.AriaHidden(true),
      h.InnerHTML(render(avatar, { expression, size })),
    ],
    []
  );

const stackedFace = (
  avatar: Avatar,
  expression: Expression,
  className: string,
  h: H
): Html =>
  h.span(
    [
      h.Class(className),
      h.AriaHidden(true),
      h.InnerHTML(
        render(avatar, { expression, layers: true, size: PREVIEW_PX })
      ),
    ],
    []
  );

const preview = (avatar: Avatar, shuffled: boolean, h: H): Html =>
  h.div(
    [h.Class("face-stage")],
    [
      h.div(
        [
          h.Key(codeFor(avatar)),
          h.Class(shuffled ? "face-preview is-shuffled" : "face-preview"),
        ],
        [
          stackedFace(avatar, "Resting", "face-frame is-resting", h),
          stackedFace(avatar, "Happy", "face-frame is-happy", h),
        ]
      ),
      h.button(
        [
          h.Type("button"),
          h.Class("button face-shuffle"),
          h.OnClick(Messages.ClickedShuffleFace()),
        ],
        ["Shuffle"]
      ),
      h.ul(
        [
          h.Class("face-strip"),
          h.AriaLabel("How your face reacts at the table"),
        ],
        STRIP.map(({ expression, label }) =>
          h.li(
            [h.Key(expression), h.Title(label)],
            [face(avatar, expression, STRIP_PX, "face-frame", h)]
          )
        )
      ),
    ]
  );

const tabs = (part: FacePart, h: H): Html =>
  h.div(
    [h.Class("face-tabs"), h.Role("tablist"), h.AriaLabel("Parts")],
    PART_ORDER.map((each) =>
      h.button(
        [
          h.Type("button"),
          h.Key(each),
          h.Role("tab"),
          h.AriaSelected(each === part),
          h.Class(each === part ? "face-tab is-picked" : "face-tab"),
          h.OnClick(Messages.ChoseFacePart({ part: each })),
        ],
        [PICKERS[each].label]
      )
    )
  );

const optionGrid = (
  label: string,
  choices: readonly Choice[],
  closeUp: boolean,
  h: H
): Html =>
  h.div(
    [h.Class("face-options"), h.Role("radiogroup"), h.AriaLabel(label)],
    choices.map((choice) =>
      h.button(
        [
          h.Type("button"),
          h.Key(choice.key),
          h.Role("radio"),
          h.AriaChecked(choice.picked),
          h.AriaLabel(choice.label),
          h.Title(choice.label),
          h.Class(choice.picked ? "face-option is-picked" : "face-option"),
          h.OnClick(Messages.PickedAvatar({ avatar: choice.avatar })),
        ],
        [
          face(
            choice.avatar,
            "Resting",
            OPTION_PX,
            closeUp ? "face-frame is-close-up" : "face-frame",
            h
          ),
        ]
      )
    )
  );

export const faceBuilder = (
  avatar: Avatar,
  part: FacePart,
  shuffled: boolean,
  h: H
): Html => {
  const picker = PICKERS[part];

  return h.div(
    [h.Class("face-builder")],
    [
      preview(avatar, shuffled, h),
      tabs(part, h),
      optionGrid(picker.label, picker.choices(avatar), picker.closeUp, h),
    ]
  );
};

export const faceSheet = (
  draft: Avatar,
  part: FacePart,
  shuffled: boolean,
  h: H
): Html =>
  h.div(
    [h.Class("face-sheet")],
    [
      h.section(
        [
          h.Class("card-panel face-sheet-panel"),
          h.Role("dialog"),
          h.AriaModal(true),
          h.AriaLabel("Your face"),
        ],
        [
          h.h2([h.Class("panel-title")], ["Your face"]),
          faceBuilder(draft, part, shuffled, h),
          h.div(
            [h.Class("choice-row")],
            [
              h.button(
                [
                  h.Type("button"),
                  h.Class("button primary"),
                  h.OnClick(Messages.ClickedSaveFace()),
                ],
                ["Save my face"]
              ),
              h.button(
                [
                  h.Type("button"),
                  h.Class("button quiet"),
                  h.OnClick(Messages.ClickedCancelFace()),
                ],
                ["Cancel"]
              ),
            ]
          ),
        ]
      ),
    ]
  );
