import { Antes, PositiveChipsSchema } from "@nostakes/engine";
import type { Ante } from "@nostakes/engine";
import { RoomSettingsSchema } from "@nostakes/room";
import type { RoomSettings } from "@nostakes/room";
import { Option, Result, Schema } from "effect";

import type { SettingsDraft } from "./model.js";

export const draftOf = (settings: RoomSettings): SettingsDraft => ({
  anteAmount: Antes.$match(settings.table.ante, {
    BigBlindPays: ({ amount }) => String(amount),
    EveryPlayer: ({ amount }) => String(amount),
    NoAnte: () => "",
  }),
  anteKind: settings.table.ante._tag,
  approveChips: settings.approval.chips,
  approveSeats: settings.approval.seats,
  betweenHandsSeconds: String(settings.betweenHandsSeconds),
  bigBlind: String(settings.table.bigBlind),
  buyInMax: String(settings.buyIn.max),
  buyInMin: String(settings.buyIn.min),
  maxRuns: String(settings.table.maxRuns),
  rabbitHunt: settings.table.rabbitHunt,
  runChoiceSeconds: String(settings.runChoiceSeconds),
  showdown: settings.table.showdown,
  showdownSeconds: String(settings.showdownSeconds),
  smallBlind: String(settings.table.smallBlind),
  straddleButton: settings.table.straddle.button,
  straddleUnderTheGun: String(settings.table.straddle.underTheGun),
  timeBankSeconds: String(settings.timeBankSeconds),
  turnSeconds: String(settings.turnSeconds),
});

const decodeSettings = Schema.decodeUnknownResult(RoomSettingsSchema);

const number = (text: string) => {
  const trimmed = text.trim();
  const value = Number(trimmed);

  return trimmed.length > 0 && Number.isFinite(value) ? value : Number.NaN;
};

const anteFrom = (draft: SettingsDraft): Option.Option<Ante> => {
  if (draft.anteKind === "NoAnte") {
    return Option.some(Antes.NoAnte());
  }

  const amount = Schema.decodeOption(PositiveChipsSchema)(
    number(draft.anteAmount)
  );

  return draft.anteKind === "EveryPlayer"
    ? amount.pipe(Option.map((chips) => Antes.EveryPlayer({ amount: chips })))
    : amount.pipe(Option.map((chips) => Antes.BigBlindPays({ amount: chips })));
};

const settingsWith = (
  draft: SettingsDraft,
  ante: Ante
): Result.Result<RoomSettings, string> =>
  decodeSettings({
    approval: { chips: draft.approveChips, seats: draft.approveSeats },
    betweenHandsSeconds: number(draft.betweenHandsSeconds),
    buyIn: { max: number(draft.buyInMax), min: number(draft.buyInMin) },
    runChoiceSeconds: number(draft.runChoiceSeconds),
    showdownSeconds: number(draft.showdownSeconds),
    table: {
      ante,
      bigBlind: number(draft.bigBlind),
      maxRuns: number(draft.maxRuns),
      rabbitHunt: draft.rabbitHunt,
      showdown: draft.showdown,
      smallBlind: number(draft.smallBlind),
      straddle: {
        button: draft.straddleButton,
        underTheGun: number(draft.straddleUnderTheGun),
      },
    },
    timeBankSeconds: number(draft.timeBankSeconds),
    turnSeconds: number(draft.turnSeconds),
  }).pipe(Result.mapError((issue) => `Check the settings: ${issue.message}`));

export const settingsFrom = (
  draft: SettingsDraft
): Result.Result<RoomSettings, string> =>
  Option.match(anteFrom(draft), {
    onNone: () =>
      Result.fail("The ante must be a whole number of chips above zero."),
    onSome: (ante) => settingsWith(draft, ante),
  });

export const optionText = <A>(
  option: Option.Option<A>,
  show: (value: A) => string
) => Option.match(option, { onNone: () => "", onSome: show });
