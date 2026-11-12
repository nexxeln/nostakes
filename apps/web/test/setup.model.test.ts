import { describe, expect, it } from "@effect/vitest";
import { TableConfigSchema } from "@nostakes/engine";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import {
  MemberCommandSchema,
  RequestedSettingsSchema,
  RoomSettingsSchema,
  RoomViewSchema,
} from "@nostakes/room";
import { Effect, Option, Result, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { Messages, ReplyOutcomes } from "../src/features/message.js";
import type { Message } from "../src/features/message.js";
import type { Model, SettingsDraft } from "../src/features/model.js";
import { roomOf } from "../src/features/room.js";
import { PresetSchema } from "../src/features/rules-copy.js";
import { pressed } from "../src/features/rules.js";
import type { Press } from "../src/features/rules.js";
import { settingsFrom } from "../src/features/settings.js";
import {
  BLIND_LINES,
  BUY_IN_LINES,
  EXTRAS,
  extraFlipped,
  openWithRules,
  rememberedRules,
  shownAmounts,
} from "../src/features/setup.js";
import { init, setupDraft, update } from "../src/features/update.js";

const CODE = RoomCodeSchema.make("ABC234");

const HOST = PlayerIdSchema.make("player-0000000ab");

const flags = {
  deck: "TwoColour" as const,
  invite: Option.some(CODE),
  learned: [],
  profile: { avatar: "🦊", name: "Ana" },
  reloadedFor: Option.none(),
  rooms: [],
  saved: Option.some({ code: CODE, player: HOST }),
  sound: false,
  systemTheme: "Light" as const,
  theme: Option.none(),
};

type OpenView = typeof RoomViewSchema.cases.Open.Type;

type Issued = NonNullable<ReturnType<typeof update>["commands"]>;

const SentSchema = Schema.Struct({
  command: MemberCommandSchema,
  key: Schema.Int,
});

const sentSettings = (commands: Issued) =>
  commands.flatMap((command) => {
    const sent = Schema.decodeUnknownOption(SentSchema)(command.args);

    return command.name === "SendToRoom" &&
      Option.isSome(sent) &&
      MemberCommandSchema.guards.ChangeSettings(sent.value.command)
      ? [{ key: sent.value.key, settings: sent.value.command.settings }]
      : [];
  });

const live = Messages.ReceivedLink({
  link: {
    newBuild: Option.none(),
    phase: "Live",
    presence: [],
    receivedAt: 0,
    refusal: Option.none(),
    retryDelayMs: Option.none(),
  },
});

const shown = (view: OpenView, seq: number) =>
  Messages.ReceivedUpdate({ events: [], receivedAt: 0, seq, view });

const play = (model: Model, messages: readonly Message[]) => {
  const commands: Issued[number][] = [];
  let current = model;

  for (const message of messages) {
    const next = update(current, message);

    commands.push(...(next.commands ?? []));
    current = next.model;
  }

  return { commands, model: current };
};

const encodeSettings = Schema.encodeSync(
  Schema.toCodecJson(RoomSettingsSchema)
);

const encodeRequested = Schema.encodeSync(
  Schema.toCodecJson(RequestedSettingsSchema)
);

const decodeRequested = Schema.decodeUnknownResult(
  Schema.toCodecJson(RequestedSettingsSchema)
);

const views = Arbitrary.schema(RoomViewSchema.cases.Open);

const hosting = (view: OpenView): OpenView => ({
  ...view,
  host: HOST,
  you: Option.some(HOST),
});

const decodeTable = Schema.decodeUnknownOption(TableConfigSchema);

const queuedFrom = (
  table: OpenView["settings"]["table"],
  raise: number
): OpenView["settings"]["table"] =>
  Option.getOrElse(
    decodeTable({ ...table, bigBlind: table.bigBlind + raise }),
    () => table
  );

describe("the house rules sheet", () => {
  it.prop(
    "keeps a rule change queued for the next hand when the host reopens it and saves something else",
    {
      raise: Schema.Int.check(Schema.isBetween({ maximum: 50, minimum: 1 })),
      view: RoomViewSchema.cases.Open,
    },
    ({ raise, view }) => {
      const queued = queuedFrom(view.settings.table, raise);

      const table = {
        ...hosting(view),
        queued: { ...view.queued, rules: Option.some(queued) },
      };

      const turnSeconds = table.settings.turnSeconds === 0 ? "1" : "0";

      const { commands } = play(init(flags).model, [
        live,
        shown(table, 1),
        Messages.ClickedHouseRules(),
        Messages.ChangedSetting({ path: "turnSeconds", value: turnSeconds }),
        Messages.ClickedSaveSettings(),
      ]);

      expect(
        sentSettings(commands).map(({ settings }) => encodeSettings(settings))
      ).toStrictEqual([
        encodeSettings({
          ...table.settings,
          table: queued,
          turnSeconds: Number(turnSeconds),
        }),
      ]);
    },
    { arbitrary: { runs: 40 } }
  );
});

const PressSchema = Schema.Literals(["Less", "More", "Toggle"]);

const StepSchema = Schema.TaggedUnion({
  Answer: { accepted: Schema.Boolean },
  Change: {
    control: Schema.Int.check(Schema.isBetween({ maximum: 40, minimum: 0 })),
    press: PressSchema,
  },
  Preset: { preset: PresetSchema },
  Settle: {},
});

type Step = typeof StepSchema.Type;

const steps = Arbitrary.array(Arbitrary.schema(StepSchema), {
  maxLength: 30,
  minLength: 4,
});

const BuyInsSchema = Schema.Struct({
  least: Schema.Int.check(Schema.isBetween({ maximum: 50, minimum: 1 })),
  more: Schema.Int.check(Schema.isBetween({ maximum: 250, minimum: 0 })),
  table: Schema.Boolean,
});

const SMALL_BLINDS = 1000;

const firstNight = (
  view: OpenView,
  { least, more, table }: typeof BuyInsSchema.Type
): OpenView => {
  const { bigBlind, smallBlind } = view.settings.table;
  const big = table ? (bigBlind % SMALL_BLINDS) + 1 : bigBlind;

  const settings = table
    ? {
        ...view.settings,
        buyIn: { max: big * (least + more), min: big * least },
        table: {
          ...view.settings.table,
          bigBlind: big,
          smallBlind: Math.min(smallBlind, big),
        },
      }
    : view.settings;

  return {
    ...hosting(view),
    hand: Option.none(),
    lastHand: Option.none(),
    queued: { ...view.queued, rules: Option.none() },
    settings: Schema.is(RoomSettingsSchema)(settings)
      ? settings
      : view.settings,
  };
};

const roomParts = (model: Model) =>
  roomOf(model).pipe(
    Option.flatMap((room) =>
      Option.all([
        room.shown.pipe(
          Option.map(({ view }) => view),
          Option.filter(RoomViewSchema.guards.Open)
        ),
        room.setup,
      ])
    )
  );

const sheetDraft = (model: Model): SettingsDraft =>
  Option.match(roomParts(model), {
    onNone: () => ({}),
    onSome: ([view, setup]) => setupDraft(view, setup),
  });

const seqOf = (model: Model) =>
  roomOf(model).pipe(
    Option.flatMap(({ shown: last }) => last),
    Option.map(({ seq }) => seq),
    Option.getOrElse(() => 0)
  );

const changeFor = (
  draft: SettingsDraft,
  control: number,
  press: Press
): Option.Option<Message> => {
  const steppers = [
    ...BLIND_LINES,
    ...BUY_IN_LINES,
    ...EXTRAS.flatMap((extra) => shownAmounts(extra, draft)),
  ].map(({ copy }) => ({
    path: copy.path,
    value: pressed(
      copy.control,
      draft,
      copy.path,
      press === "Toggle" ? "More" : press
    ),
  }));

  const switches = EXTRAS.map((extra) => ({
    path: extra.line.field.path,
    value: extraFlipped(extra, draft),
  }));

  const controls = [...steppers, ...switches];

  return Option.fromUndefinedOr(controls[control % controls.length]).pipe(
    Option.map(({ path, value }) =>
      Messages.ChangedSetupSetting({ path, value })
    )
  );
};

interface Walk {
  readonly model: Model;
  readonly view: OpenView;
  readonly sent: Option.Option<OpenView["settings"]>;
  readonly problems: readonly string[];
}

const messagesFor = (step: Step, walk: Walk): readonly Message[] => {
  const setup = Option.map(roomParts(walk.model), ([, sheet]) => sheet);

  return StepSchema.match(step, {
    Answer: ({ accepted }) =>
      Option.match(setup.pipe(Option.flatMap(({ inFlight }) => inFlight)), {
        onNone: () => [],
        onSome: (key) => [
          Messages.ReceivedReply({
            key,
            outcome: accepted
              ? ReplyOutcomes.Accepted({ seq: seqOf(walk.model) + 1 })
              : ReplyOutcomes.Lost({ reason: "the line dropped." }),
          }),
        ],
      }),
    Change: ({ control, press }) =>
      Option.toArray(changeFor(sheetDraft(walk.model), control, press)),
    Preset: ({ preset }) => [Messages.ChoseSetupPreset({ preset })],
    Settle: () =>
      Option.match(setup, {
        onNone: () => [],
        onSome: ({ token }) => [Messages.SettledSetupEdit({ token })],
      }),
  });
};

const wireText = (settings: OpenView["settings"]) =>
  JSON.stringify(encodeRequested(settings));

const sentProblems = (sent: OpenView["settings"], after: SettingsDraft) => {
  const wire: unknown = JSON.parse(wireText(sent));
  const named = settingsFrom(after);

  return [
    ...(Result.isSuccess(decodeRequested(wire))
      ? []
      : ["the page sent settings the room cannot read"]),
    ...(Result.isSuccess(named) && wireText(named.success) === wireText(sent)
      ? []
      : ["the page sent settings the controls do not name"]),
  ];
};

const isChange = Schema.is(Messages.ChangedSetupSetting);

const isReply = Schema.is(Messages.ReceivedReply);

const buyInsFollowed = (
  before: SettingsDraft,
  after: SettingsDraft,
  message: Message
): readonly string[] => {
  if (
    !isChange(message) ||
    message.path !== "table.bigBlind" ||
    Result.isFailure(settingsFrom(after))
  ) {
    return [];
  }

  const old = Number(before["table.bigBlind"]);
  const now = Number(after["table.bigBlind"]);

  const both =
    Number(before["buyIn.min"]) % old === 0 &&
    Number(before["buyIn.max"]) % old === 0;

  return ["buyIn.min", "buyIn.max"].flatMap((path) => {
    const was = Number(before[path]);
    const is = Number(after[path]);
    const kept = both ? is * old === was * now : is === was;

    return kept
      ? []
      : [
          `${path} went from ${was} to ${is} when the big blind went from ${old} to ${now}`,
        ];
  });
};

const applied = (walk: Walk, message: Message): Walk => {
  const before = sheetDraft(walk.model);
  const next = update(walk.model, message);
  const after = sheetDraft(next.model);

  const sent = sentSettings(next.commands ?? []).map(
    ({ settings }) => settings
  );

  const problems = [
    ...walk.problems,
    ...sent.flatMap((settings) => sentProblems(settings, after)),
    ...buyInsFollowed(before, after, message),
  ];

  const answered =
    isReply(message) && ReplyOutcomes.guards.Accepted(message.outcome)
      ? walk.sent
      : Option.none();

  return Option.match(answered, {
    onNone: () => ({
      model: next.model,
      problems,
      sent: Option.orElse(Option.fromUndefinedOr(sent.at(-1)), () => walk.sent),
      view: walk.view,
    }),
    onSome: (settings) => {
      const view = { ...walk.view, settings };

      return {
        model: update(next.model, shown(view, seqOf(next.model) + 1)).model,
        problems,
        sent: Option.none(),
        view,
      };
    },
  });
};

const stepped = (walk: Walk, step: Step): Walk => {
  let current = walk;

  for (const message of messagesFor(step, walk)) {
    current = applied(current, message);
  }

  return current;
};

describe("the setup sheet", () => {
  it.prop(
    "sends whole settings the room reads, exactly as the controls name them, with the buy-ins following the big blind",
    { buyIns: BuyInsSchema, script: steps, view: views },
    ({ buyIns, script, view }) => {
      const table = firstNight(view, buyIns);

      const opened = play(init(flags).model, [
        live,
        shown(table, 1),
        Messages.ClickedSetup(),
      ]).model;

      let walked: Walk = {
        model: opened,
        problems: [],
        sent: Option.none(),
        view: table,
      };

      for (const step of script) {
        walked = stepped(walked, step);
      }

      expect(walked.problems).toStrictEqual([]);
    },
    { arbitrary: { runs: 60 } }
  );
});

describe("the rules a device remembers", () => {
  it.effect.prop(
    "never carry a lock and never stop a room from opening, whatever was stored",
    {
      garbage: Schema.String,
      refused: Schema.Boolean,
      settings: RequestedSettingsSchema,
      stale: Schema.Boolean,
    },
    ({ garbage, refused, settings, stale }) =>
      Effect.gen(function* opensAnyway() {
        const stored = stale
          ? garbage
          : wireText({ ...settings, locked: true });

        const asked: Option.Option<boolean>[] = [];

        const opened = yield* openWithRules(
          rememberedRules(Option.some(stored)),
          (chosen) => {
            asked.push(chosen.pipe(Option.map(({ locked }) => locked)));

            return refused && Option.isSome(chosen)
              ? Effect.fail("BadRequest" as const)
              : Effect.succeed("pass" as const);
          }
        );

        expect({
          entry: opened.entry,
          lastAskCarriedRules: Option.isSome(asked.at(-1) ?? Option.none()),
          locked: asked.some((locked) => Option.contains(locked, true)),
        }).toStrictEqual({
          entry: "pass",
          lastAskCarriedRules: !refused && !stale,
          locked: false,
        });
      })
  );
});
