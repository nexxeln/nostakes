import { describe, expect, it } from "@effect/vitest";
import {
  AvatarSchema,
  avatarFor,
  codeFor,
  DEFAULT_AVATAR,
} from "@nostakes/avatar";
import type { Avatar } from "@nostakes/avatar";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import { MemberCommandSchema, RoomViewSchema } from "@nostakes/room";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";
import { Scene } from "foldkit";
import { attr, getAllByRole } from "foldkit/scene";

import { Messages } from "../src/features/message.js";
import type { Message } from "../src/features/message.js";
import type { FacePart, Model } from "../src/features/model.js";
import { init, update } from "../src/features/update.js";
import { view } from "../src/features/view.js";

const CODE = RoomCodeSchema.make("ABC234");

const PLAYER = PlayerIdSchema.make("player-0000000ab");

const NAME = "Ana";

const avatars = Arbitrary.schema(AvatarSchema);

const tables = Arbitrary.schema(RoomViewSchema.cases.Open);

type OpenView = typeof RoomViewSchema.cases.Open.Type;

const home = init({
  invite: Option.none(),
  learned: [],
  profile: { avatar: "🦊", name: "" },
  reloadedFor: Option.none(),
  saved: Option.none(),
  sound: false,
  theme: Option.none(),
}).model;

const inRoom = (worn: Avatar, table: OpenView): Model =>
  update(
    update(
      init({
        invite: Option.some(CODE),
        learned: [],
        profile: { avatar: codeFor(DEFAULT_AVATAR), name: NAME },
        reloadedFor: Option.none(),
        saved: Option.some({ code: CODE, player: PLAYER }),
        sound: false,
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

const checkedLabels = (model: Model) => {
  const labels: string[] = [];

  Scene.scene(
    { update, view },
    Scene.given(model),
    Scene.tap((simulation) => {
      for (const radio of getAllByRole("radio", { checked: true })(
        simulation.html
      )) {
        labels.push(Option.getOrElse(attr(radio, "aria-label"), () => ""));
      }
    })
  );

  return labels;
};

const spaced = (name: string) => name.replaceAll(/(?<=[a-z])(?=[A-Z])/gu, " ");

const onPart = (model: Model, part: FacePart) =>
  update(model, Messages.ChoseFacePart({ part })).model;

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
    }
  );

  it.prop(
    "cancelling a draft in the room sends nothing and keeps the old face",
    { draft: avatars, table: tables, worn: avatars },
    ({ draft, table, worn }) => {
      const before = inRoom(worn, table);

      const after = playAll(before, [
        Messages.ClickedEditFace(),
        Messages.PickedAvatar({ avatar: draft }),
        Messages.ClickedCancelFace(),
      ]);

      expect(after.commands).toStrictEqual([]);
      expect(after.model.faceDraft).toStrictEqual(Option.none());
      expect(after.model.profile).toStrictEqual(before.profile);
    }
  );

  it.prop(
    "on the home screen a face is drafted in the sheet and kept on the device only when saved",
    { draft: avatars, worn: avatars },
    ({ draft, worn }) => {
      const before = update(
        home,
        Messages.PickedAvatar({ avatar: worn })
      ).model;

      const opened = update(before, Messages.ClickedEditFace());

      expect(opened.model.faceDraft).toStrictEqual(Option.some({ ...worn }));

      const drafted = update(
        opened.model,
        Messages.PickedAvatar({ avatar: draft })
      );

      expect(drafted.commands ?? []).toStrictEqual([]);
      expect(drafted.model.profile).toStrictEqual(before.profile);

      const cancelled = update(drafted.model, Messages.ClickedCancelFace());

      expect(cancelled.model.profile).toStrictEqual(before.profile);
      expect(cancelled.model.faceDraft).toStrictEqual(Option.none());

      const saved = update(drafted.model, Messages.ClickedSaveFace());

      expect(namesOf(saved.commands)).toStrictEqual(["SaveProfile"]);
      expect(saved.model.faceDraft).toStrictEqual(Option.none());
      expect(saved.model.profile.avatar).toBe(codeFor(draft));
    }
  );

  it("asks for a random face when shuffled and changes nothing itself", () => {
    const shuffled = update(home, Messages.ClickedShuffleFace());

    expect(namesOf(shuffled.commands)).toStrictEqual(["ShuffleFace"]);
    expect(shuffled.model).toStrictEqual(home);
  });

  it.prop(
    "marks exactly the parts the face wears as picked",
    { avatar: avatars },
    ({ avatar }) => {
      const wearing = playAll(home, [
        Messages.PickedAvatar({ avatar }),
        Messages.ClickedEditFace(),
      ]).model;

      expect(checkedLabels(onPart(wearing, "Species"))).toStrictEqual([
        spaced(avatar.species),
      ]);
      expect(checkedLabels(onPart(wearing, "Backdrop"))).toStrictEqual([
        avatar.backdrop,
      ]);
      expect(checkedLabels(onPart(wearing, "Extra"))).toStrictEqual([
        spaced(avatar.extra),
      ]);
      expect(checkedLabels(onPart(wearing, "Tattoo"))).toStrictEqual([
        spaced(avatar.tattoo),
      ]);
    }
  );
});
