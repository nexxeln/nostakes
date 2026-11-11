import { describe, expect, it } from "@effect/vitest";
import {
  AvatarSchema,
  avatarFor,
  codeFor,
  DEFAULT_AVATAR,
  parseAvatar,
  PARTS,
  PartSchema,
} from "@nostakes/avatar";
import type { Avatar, Part } from "@nostakes/avatar";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import {
  AvatarSchema as RoomAvatarSchema,
  MemberCommandSchema,
  RoomViewSchema,
} from "@nostakes/room";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";
import { Scene } from "foldkit";
import { attr, findAll } from "foldkit/scene";

import { SaveProfile } from "../src/client/commands.js";
import { toldOf } from "../src/features/face/parts.js";
import { modalElement } from "../src/features/face/stage.js";
import { Messages } from "../src/features/message.js";
import type { Message } from "../src/features/message.js";
import type { Model } from "../src/features/model.js";
import { init, update } from "../src/features/update.js";
import { view } from "../src/features/view.js";

const CODE = RoomCodeSchema.make("ABC234");

const PLAYER = PlayerIdSchema.make("player-0000000ab");

const NAME = "Ana";

const avatars = Arbitrary.schema(AvatarSchema);

const tables = Arbitrary.schema(RoomViewSchema.cases.Open);

type OpenView = typeof RoomViewSchema.cases.Open.Type;

const home = update(
  init({
    deck: "TwoColour",
    invite: Option.none(),
    learned: [],
    profile: { avatar: "🦊", name: "" },
    reloadedFor: Option.none(),
    rooms: [],
    saved: Option.none(),
    sound: false,
    systemTheme: "Light",
    theme: Option.none(),
  }).model,
  Messages.ClickedOpenRoom()
).model;

const inRoom = (worn: Avatar, table: OpenView): Model =>
  update(
    update(
      init({
        deck: "TwoColour",
        invite: Option.some(CODE),
        learned: [],
        profile: { avatar: codeFor(DEFAULT_AVATAR), name: NAME },
        reloadedFor: Option.none(),
        rooms: [],
        saved: Option.some({ code: CODE, player: PLAYER }),
        sound: false,
        systemTheme: "Light",
        theme: Option.none(),
      }).model,
      Messages.GotLink({
        link: {
          newBuild: Option.none(),
          phase: "Live",
          presence: [],
          receivedAt: 0,
          refusal: Option.none(),
          retryDelayMs: Option.none(),
        },
      })
    ).model,
    Messages.GotUpdate({
      events: [],
      receivedAt: 0,
      seq: 1,
      view: {
        ...table,
        members: [
          { avatar: codeFor(worn), name: NAME, player: PLAYER },
          ...table.members.filter(({ player }) => player !== PLAYER),
        ],
        you: Option.some(PLAYER),
      },
    })
  ).model;

type Issued = NonNullable<ReturnType<typeof update>["commands"]>;

const namesOf = (commands: Issued | undefined) =>
  (commands ?? []).map(({ name }) => name);

const sentCommands = (commands: Issued | undefined) =>
  (commands ?? []).flatMap((command) => {
    const sent = Schema.decodeUnknownOption(
      Schema.Struct({ command: MemberCommandSchema, key: Schema.Int })
    )(command.args);

    return command.name === "SendToRoom" && Option.isSome(sent)
      ? [sent.value.command]
      : [];
  });

const playAll = (model: Model, messages: readonly Message[]) => {
  const commands: Issued[number][] = [];
  let current = model;

  for (const message of messages) {
    const next = update(current, message);

    commands.push(...(next.commands ?? []));
    current = next.model;
  }

  return { commands, model: current };
};

type Step = ReturnType<typeof Scene.click>;

const shownAfter = (
  model: Model,
  steps: readonly Step[],
  selector: string,
  name: string
) => {
  const found: string[] = [];

  Scene.scene(
    { update, view },
    Scene.given(model),
    ...steps,
    Scene.tap((simulation) => {
      for (const node of findAll(simulation.html, selector)) {
        found.push(Option.getOrElse(attr(node, name), () => ""));
      }
    })
  );

  return found;
};

const namedAfter = (model: Model, steps: readonly Step[]) =>
  shownAfter(model, steps, ".face-callout", "aria-label").toSorted();

const namesOfFace = (avatar: Avatar) =>
  PARTS.map((part) => toldOf(avatar, part)).toSorted();

const draftOf = (model: Model) =>
  Option.getOrElse(model.faceDraft, () => DEFAULT_AVATAR);

const sheetFor = (worn: Avatar) =>
  playAll(home, [
    Messages.PickedAvatar({ avatar: worn }),
    Messages.ClickedEditFace(),
  ]).model;

const moves = Arbitrary.schema(
  Schema.Array(
    Schema.Struct({
      avatar: AvatarSchema,
      by: Schema.Int.check(Schema.isBetween({ maximum: 9, minimum: -9 })),
      kind: Schema.Literals(["Flip", "Hold", "Pick", "Shuffle"]),
      part: PartSchema,
    })
  )
);

interface Move {
  readonly avatar: Avatar;
  readonly by: number;
  readonly kind: "Flip" | "Hold" | "Pick" | "Shuffle";
  readonly part: Part;
}

const messageOf = ({ avatar, by, kind, part }: Move): Message =>
  ({
    Flip: Messages.FlippedFacePart({ by, part }),
    Hold: Messages.ChoseFacePart({ part }),
    Pick: Messages.PickedAvatar({ avatar }),
    Shuffle: Messages.ShuffledFace({ avatar }),
  })[kind];

describe("the face builder", () => {
  it.prop(
    "a face picked before joining is saved on the device and sent with the name",
    { avatar: avatars },
    ({ avatar }) => {
      const picked = update(home, Messages.PickedAvatar({ avatar }));

      expect(avatarFor(picked.model.profile.avatar)).toStrictEqual({
        ...avatar,
      });
      expect(namesOf(picked.commands)).toStrictEqual(["SaveProfile"]);

      const named = update(picked.model, Messages.ChangedName({ value: "Bo" }));
      const opened = update(named.model, Messages.SubmittedCreate());

      expect(opened.commands?.map(({ args }) => args)).toStrictEqual([
        { avatar: codeFor(avatar), name: "Bo" },
      ]);
    }
  );

  it.prop(
    "in the room a face is drafted, then sent once as the member's new profile",
    { draft: avatars, table: tables, worn: avatars },
    ({ draft, table, worn }) => {
      const before = inRoom(worn, table);

      const opened = update(before, Messages.ClickedEditFace());

      expect(opened.model.faceDraft).toStrictEqual(Option.some({ ...worn }));

      const drafted = update(
        opened.model,
        Messages.PickedAvatar({ avatar: draft })
      );

      expect(drafted.commands ?? []).toStrictEqual([]);
      expect(drafted.model.profile).toStrictEqual(before.profile);

      const saved = update(drafted.model, Messages.ClickedSaveFace());

      expect(sentCommands(saved.commands)).toStrictEqual([
        MemberCommandSchema.cases.SetProfile.make({
          avatar: codeFor(draft),
          name: NAME,
        }),
      ]);
      expect(namesOf(saved.commands)).toStrictEqual([
        "SendToRoom",
        "SaveProfile",
      ]);
      expect(saved.model.faceDraft).toStrictEqual(Option.none());
      expect(saved.model.profile.avatar).toBe(codeFor(draft));
    },
    { arbitrary: { runs: 20 } }
  );

  it.prop(
    "Done saves exactly the face on screen, and its code reads back as that face",
    { avatar: avatars, made: moves },
    ({ avatar, made }) => {
      const built = playAll(sheetFor(avatar), made.map(messageOf)).model;
      const onScreen = draftOf(built);

      expect(namedAfter(built, [])).toStrictEqual(namesOfFace(onScreen));

      expect(
        shownAfter(
          built,
          [
            Scene.click(".face-done"),
            Scene.Command.resolve(SaveProfile, Messages.CompletedPreference()),
          ],
          ".face-builder",
          "role"
        )
      ).toStrictEqual([]);

      const saved = update(built, Messages.ClickedSaveFace()).model;

      expect(saved.faceDraft).toStrictEqual(Option.none());
      expect(saved.facePast).toStrictEqual([]);
      expect(saved.profile.avatar).toBe(codeFor(onScreen));
      expect(avatarFor(saved.profile.avatar)).toStrictEqual({ ...onScreen });
      expect(parseAvatar(saved.profile.avatar)).toStrictEqual(
        Option.some({ ...onScreen })
      );
    },
    { arbitrary: { runs: 15 } }
  );

  it.prop(
    "closing without saving, by the button or by Escape, keeps the old face",
    { avatar: avatars, made: moves },
    ({ avatar, made }) => {
      const built = playAll(sheetFor(avatar), made.map(messageOf)).model;

      for (const closing of [
        Scene.click(".face-close"),
        Scene.CustomElement.emit(modalElement, "nostakes-modal", "cancel", {
          by: "Escape",
        }),
      ]) {
        expect(
          shownAfter(built, [closing], ".face-builder", "role")
        ).toStrictEqual([]);
      }

      const closed = update(built, Messages.ClickedCancelFace()).model;

      expect(closed.faceDraft).toStrictEqual(Option.none());
      expect(closed.facePast).toStrictEqual([]);
      expect(closed.profile.avatar).toBe(codeFor(avatar));
    },
    { arbitrary: { runs: 12 } }
  );

  it.prop(
    "every face's code fits the room's avatar string",
    { avatar: avatars },
    ({ avatar }) => {
      expect(Schema.is(RoomAvatarSchema)(codeFor(avatar))).toBe(true);
    }
  );
});
