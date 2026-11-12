import type { RoomSettings } from "@nostakes/room";
import { Match, Option } from "effect";

import type { SettingsDraft } from "./model.js";
import { GROUP_ORDER, PRESETS, RULES, STANDARD } from "./rules-copy.js";
import type { Preset, RuleControl, RuleCopy, RuleGroup } from "./rules-copy.js";
import { draftOf, optionLabel, SETTINGS_FORM } from "./settings.js";
import type { SettingField } from "./settings.js";

export interface VariantPlace {
  readonly path: string;
  readonly tags: readonly string[];
}

export interface RuleLine {
  readonly copy: RuleCopy;
  readonly field: SettingField;
  readonly within: Option.Option<VariantPlace>;
}

export interface Leaf {
  readonly field: SettingField;
  readonly within: Option.Option<VariantPlace>;
}

const leavesOf = (
  fields: readonly SettingField[],
  within: Option.Option<VariantPlace>
): readonly Leaf[] =>
  fields.flatMap((field): readonly Leaf[] => {
    const leaf = [{ field, within }];

    return Match.value(field).pipe(
      Match.discriminatorsExhaustive("kind")({
        Choice: () => leaf,
        Group: (group) => leavesOf(group.fields, within),
        Number: () => leaf,
        Toggle: () => leaf,
        Unsupported: () => leaf,
        Variant: (variant) => [
          ...leaf,
          ...variant.variants.flatMap(({ fields: inner, tag }) =>
            leavesOf(inner, Option.some({ path: variant.path, tags: [tag] }))
          ),
        ],
      })
    );
  });

const mergedLeaves = (leaves: readonly Leaf[]): readonly Leaf[] => {
  const byPath = new Map<string, Leaf>();

  for (const leaf of leaves) {
    const earlier = byPath.get(leaf.field.path);

    byPath.set(
      leaf.field.path,
      earlier === undefined
        ? leaf
        : {
            ...earlier,
            within: Option.zipWith(
              earlier.within,
              leaf.within,
              (first, second) => ({
                path: first.path,
                tags: [...first.tags, ...second.tags],
              })
            ),
          }
    );
  }

  return [...byPath.values()];
};

export const SETTING_LEAVES: readonly Leaf[] = mergedLeaves(
  leavesOf(SETTINGS_FORM, Option.none())
);

const fallbackControl = (field: SettingField): RuleControl =>
  Match.value(field).pipe(
    Match.discriminatorsExhaustive("kind")({
      Choice: ({ options }) => ({
        kind: "Segments" as const,
        labels: Object.fromEntries(
          options.map((option) => [option, optionLabel(option)])
        ),
      }),
      Group: () => ({ kind: "Switch" as const, off: "false", on: "true" }),
      Number: () => ({
        kind: "Stepper" as const,
        min: 0,
        start: 0,
        step: () => 1,
        unit: "",
        zero: Option.none(),
      }),
      Toggle: () => ({ kind: "Switch" as const, off: "false", on: "true" }),
      Unsupported: () => ({
        kind: "Segments" as const,
        labels: {},
      }),
      Variant: ({ variants }) => ({
        kind: "Segments" as const,
        labels: Object.fromEntries(
          variants.map(({ tag }) => [tag, optionLabel(tag)])
        ),
      }),
    })
  );

const otherCopy = (field: SettingField): RuleCopy => ({
  brief: () => Option.none(),
  card: "WhenChanged",
  control: fallbackControl(field),
  group: "Other",
  help:
    field.description.length > 0
      ? Option.some(field.description)
      : Option.none(),
  label: field.title,
  path: field.path,
  relevant: () => true,
});

export const ruleLinesFor = (
  leaves: readonly Leaf[],
  rules: readonly RuleCopy[]
): readonly RuleLine[] => [
  ...rules.flatMap((copy) =>
    leaves.flatMap(({ field, within }) =>
      field.path === copy.path ? [{ copy, field, within }] : []
    )
  ),
  ...leaves.flatMap(({ field, within }) =>
    rules.some(({ path }) => path === field.path)
      ? []
      : [{ copy: otherCopy(field), field, within }]
  ),
];

export const RULE_LINES: readonly RuleLine[] = ruleLinesFor(
  SETTING_LEAVES,
  RULES
);

export const groupsWithRules: readonly RuleGroup[] = GROUP_ORDER.filter(
  (group) => RULE_LINES.some(({ copy }) => copy.group === group)
);

export const linesIn = (group: RuleGroup) =>
  RULE_LINES.filter(({ copy }) => copy.group === group);

export const isRelevant = (line: RuleLine, draft: SettingsDraft) =>
  line.copy.relevant(draft) &&
  Option.match(line.within, {
    onNone: () => true,
    onSome: ({ path, tags }) => tags.includes(draft[path] ?? ""),
  });

const starts: SettingsDraft = Object.fromEntries(
  RULES.flatMap(({ control, path }) =>
    control.kind === "Stepper" ? [[path, String(control.start)]] : []
  )
);

export const openDraft = (settings: RoomSettings): SettingsDraft => ({
  ...starts,
  ...draftOf(settings),
});

const PRESET_ORDER: readonly Preset[] = ["Standard", "Home", "Casino", "Fast"];

export const presetsInOrder = PRESET_ORDER;

export const presetOf = (draft: SettingsDraft): Option.Option<Preset> =>
  Option.fromNullishOr(
    PRESET_ORDER.find((preset) =>
      Object.entries(PRESETS[preset]).every(
        ([path, value]) => draft[path] === value
      )
    )
  );

export const withPreset = (
  draft: SettingsDraft,
  preset: Preset
): SettingsDraft => ({ ...draft, ...PRESETS[preset] });

const numberIn = (text: string | undefined) => {
  const value = Number((text ?? "").trim());

  return Number.isFinite(value) ? value : Number.NaN;
};

export type Press = "Less" | "More" | "Toggle";

export const pressed = (
  control: RuleControl,
  draft: SettingsDraft,
  path: string,
  press: Press
): string => {
  const current = draft[path] ?? "";

  if (control.kind === "Switch") {
    return current === control.on ? control.off : control.on;
  }

  if (control.kind === "Segments") {
    return current;
  }

  const value = numberIn(current);
  const step = control.step(draft);

  if (Number.isNaN(value)) {
    return String(control.min);
  }

  return press === "Less"
    ? String(Math.max(control.min, value - step))
    : String(value + step);
};

export const unitText = (unit: string) => {
  if (unit.length === 0) {
    return "";
  }

  return /^\p{L}/u.test(unit) ? ` ${unit}` : unit;
};

export const zeroText = (control: RuleControl, current: string) =>
  control.kind === "Stepper" && Number(current) === 0 && current.trim() !== ""
    ? control.zero
    : Option.none();

export const valueText = (line: RuleLine, draft: SettingsDraft) => {
  const current = draft[line.field.path] ?? "";
  const { control } = line.copy;

  if (control.kind === "Switch") {
    return current === control.on ? "On" : "Off";
  }

  if (control.kind === "Segments") {
    return control.labels[current] ?? optionLabel(current);
  }

  return Option.match(zeroText(control, current), {
    onNone: () => `${current}${unitText(control.unit)}`,
    onSome: (text) => text,
  });
};

export interface CardPart {
  readonly text: string;
  readonly changed: boolean;
}

const partsOf = (lines: readonly RuleLine[], draft: SettingsDraft) =>
  lines.flatMap(({ copy, field, within }): readonly CardPart[] => {
    if (!isRelevant({ copy, field, within }, draft)) {
      return [];
    }

    const changed = Option.exists(
      Option.fromNullishOr(STANDARD.get(field.path)),
      (standard) => standard !== draft[field.path]
    );

    if (copy.card === "WhenChanged" && !changed) {
      return [];
    }

    return Option.toArray(copy.brief(draft)).map((text) => ({
      changed: copy.card === "Headline" ? false : changed,
      text,
    }));
  });

export const groupSummary = (group: RuleGroup, draft: SettingsDraft) =>
  partsOf(linesIn(group), draft);

export const rulesCardOf = (draft: SettingsDraft) => ({
  headline: partsOf(
    RULE_LINES.filter(({ copy }) => copy.card === "Headline").toSorted(
      (left, right) =>
        Number(left.copy.group !== "Blinds") -
        Number(right.copy.group !== "Blinds")
    ),
    draft
  ),
  rest: partsOf(
    RULE_LINES.filter(({ copy }) => copy.card !== "Headline"),
    draft
  ),
});
