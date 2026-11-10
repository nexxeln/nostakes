import { RoomSettingsSchema } from "@nostakes/room";
import type { RoomSettings } from "@nostakes/room";
import { Match, Option, Predicate, Result, Schema, SchemaAST } from "effect";

import type { SettingsDraft } from "./model.js";

export interface FieldText {
  readonly path: string;
  readonly title: string;
  readonly description: string;
}

export type SettingField =
  | (FieldText & { readonly kind: "Number" })
  | (FieldText & { readonly kind: "Toggle" })
  | (FieldText & {
      readonly kind: "Choice";
      readonly options: readonly string[];
    })
  | (FieldText & {
      readonly kind: "Variant";
      readonly variants: readonly {
        readonly tag: string;
        readonly fields: readonly SettingField[];
      }[];
    })
  | (FieldText & {
      readonly kind: "Group";
      readonly fields: readonly SettingField[];
    })
  | (FieldText & { readonly kind: "Unsupported" });

const TAG = "_tag";

const humanize = (name: string) =>
  name
    .replaceAll(/(?<lower>[a-z])(?<upper>[A-Z])/gu, "$<lower> $<upper>")
    .toLowerCase()
    .replace(/^./u, (first) => first.toUpperCase());

export const optionLabel = (option: string) => {
  if (option === "true") {
    return "On";
  }

  if (option === "false") {
    return "Off";
  }

  return humanize(option);
};

const join = (path: string, name: string) =>
  path.length === 0 ? name : `${path}.${name}`;

const literalOf = (ast: SchemaAST.AST) =>
  SchemaAST.isLiteral(ast) && Predicate.isString(ast.literal)
    ? Option.some(ast.literal)
    : Option.none();

const tagOf = (ast: SchemaAST.AST) =>
  SchemaAST.isObjects(ast)
    ? Option.fromNullishOr(
        ast.propertySignatures.find(({ name }) => name === TAG)
      ).pipe(Option.flatMap(({ type }) => literalOf(type)))
    : Option.none();

const fieldOf = (
  ast: SchemaAST.AST,
  path: string,
  name: string
): SettingField => {
  const children = (objects: SchemaAST.Objects) =>
    objects.propertySignatures
      .filter((property) => property.name !== TAG)
      .map((property) =>
        fieldOf(
          property.type,
          join(path, String(property.name)),
          String(property.name)
        )
      );

  const text = {
    description: SchemaAST.resolveDescription(ast) ?? "",
    path,
    title: SchemaAST.resolveTitle(ast) ?? humanize(name),
  };

  if (SchemaAST.isNumber(ast)) {
    return { ...text, kind: "Number" };
  }

  if (SchemaAST.isBoolean(ast)) {
    return { ...text, kind: "Toggle" };
  }

  if (SchemaAST.isObjects(ast)) {
    return { ...text, fields: children(ast), kind: "Group" };
  }

  if (SchemaAST.isUnion(ast)) {
    const literals = ast.types.flatMap((member) =>
      Option.toArray(literalOf(member))
    );

    if (literals.length === ast.types.length) {
      return { ...text, kind: "Choice", options: literals };
    }

    const variants = ast.types.flatMap((member) =>
      SchemaAST.isObjects(member)
        ? Option.toArray(tagOf(member)).map((tag) => ({
            fields: children(member),
            tag,
          }))
        : []
    );

    if (variants.length === ast.types.length) {
      return { ...text, kind: "Variant", path: join(path, TAG), variants };
    }
  }

  return { ...text, kind: "Unsupported" };
};

const SETTINGS_ROOT = fieldOf(RoomSettingsSchema.ast, "", "settings");

export const SETTINGS_FORM: readonly SettingField[] =
  SETTINGS_ROOT.kind === "Group" ? SETTINGS_ROOT.fields : [SETTINGS_ROOT];

const encodeSettings = Schema.encodeSync(
  Schema.toCodecJson(RoomSettingsSchema)
);

const flatten = (value: Schema.Json, path: string): [string, string][] => {
  if (Predicate.isString(value)) {
    return [[path, value]];
  }

  if (Predicate.isNumber(value) || Predicate.isBoolean(value)) {
    return [[path, String(value)]];
  }

  if (value === null || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([name, inner]) =>
    flatten(inner, join(path, name))
  );
};

export const draftOf = (settings: RoomSettings): SettingsDraft =>
  Object.fromEntries(flatten(encodeSettings(settings), ""));

const numberIn = (text: string | undefined) => {
  const trimmed = (text ?? "").trim();

  return trimmed.length > 0 ? Number(trimmed) : Number.NaN;
};

const fieldName = (field: SettingField) =>
  field.path.split(".").at(field.kind === "Variant" ? -2 : -1) ?? "";

const valueOf = (field: SettingField, draft: SettingsDraft): Schema.Json => {
  const entriesOf = (
    fields: readonly SettingField[]
  ): (readonly [string, Schema.Json])[] =>
    fields.map((inner) => [fieldName(inner), valueOf(inner, draft)] as const);

  const objectOf = (fields: readonly SettingField[]) =>
    Object.fromEntries<Schema.Json>(entriesOf(fields));

  return Match.value(field).pipe(
    Match.discriminatorsExhaustive("kind")({
      Choice: ({ path }) => draft[path] ?? "",
      Group: ({ fields }) => objectOf(fields),
      Number: ({ path }) => numberIn(draft[path]),
      Toggle: ({ path }) => draft[path] === "true",
      Unsupported: () => null,
      Variant: ({ path, variants }) => {
        const tag = draft[path] ?? "";
        const chosen = variants.find((variant) => variant.tag === tag);

        return Object.fromEntries<Schema.Json>([
          [TAG, tag],
          ...entriesOf(chosen?.fields ?? []),
        ]);
      },
    })
  );
};

const decodeSettings = Schema.decodeUnknownResult(
  Schema.toCodecJson(RoomSettingsSchema)
);

export const settingsFrom = (
  draft: SettingsDraft
): Result.Result<RoomSettings, string> =>
  decodeSettings(valueOf(SETTINGS_ROOT, draft)).pipe(
    Result.mapError((issue) => `Check the settings: ${issue.message}`)
  );

const encodedText = (settings: RoomSettings) =>
  JSON.stringify(encodeSettings(settings));

export const savesAs = (draft: SettingsDraft, settings: RoomSettings) =>
  Result.match(settingsFrom(draft), {
    onFailure: () => false,
    onSuccess: (saved) => encodedText(saved) === encodedText(settings),
  });
