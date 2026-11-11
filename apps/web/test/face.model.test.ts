import { describe, expect, it } from "@effect/vitest";
import {
  AvatarSchema,
  avatarFor,
  boxOfPart,
  choicesOf,
  codeFor,
  DEFAULT_AVATAR,
  parseAvatar,
  PARTS,
  PartSchema,
  PLACED_PARTS,
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
import { attr, findAll, getAllByRole } from "foldkit/scene";

import { SaveProfile } from "../src/client/commands.js";
import { choiceId, rovedTo } from "../src/features/face-builder.js";
import {
  calloutPoints,
  choiceName,
  DOTS_APART,
  SIDES,
  stepped,
  toldOf,
} from "../src/features/face/parts.js";
import { faceElement, modalElement } from "../src/features/face/stage.js";
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

const shownOn = (model: Model, selector: string, name: string) =>
  shownAfter(model, [], selector, name);

const namedAfter = (model: Model, steps: readonly Step[]) =>
  shownAfter(model, steps, ".face-callout", "aria-label").toSorted();

const heldAfter = (model: Model, steps: readonly Step[]) =>
  shownAfter(model, steps, ".face-callout.is-held", "aria-label");

const namesOfFace = (avatar: Avatar) =>
  PARTS.map((part) => toldOf(avatar, part)).toSorted();

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

const calloutOf = (part: Part) => `.face-callout[data-part="${part}"]`;

const STAGE = "nostakes-face";

const draftOf = (model: Model) =>
  Option.getOrElse(model.faceDraft, () => DEFAULT_AVATAR);

const sheetFor = (worn: Avatar) =>
  playAll(home, [
    Messages.PickedAvatar({ avatar: worn }),
    Messages.ClickedEditFace(),
  ]).model;

const stepsTo = (part: Part, from: string, to: string) => {
  const choices = choicesOf(part);

  return (
    (choices.indexOf(to) - choices.indexOf(from) + choices.length) %
    choices.length
  );
};

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
    "counts a shuffle so the face can pull its sheets apart, and never a picked part",
    { picked: avatars, shuffled: avatars, worn: avatars },
    ({ picked, shuffled, worn }) => {
      const start = sheetFor(worn);

      const dealt = update(
        start,
        Messages.ShuffledFace({ avatar: shuffled })
      ).model;

      expect(dealt.faceDraft).toStrictEqual(Option.some({ ...shuffled }));
      expect(dealt.faceShuffles - start.faceShuffles).toBe(
        codeFor(shuffled) === codeFor(worn) ? 0 : 1
      );

      const chosen = update(
        dealt,
        Messages.PickedAvatar({ avatar: picked })
      ).model;

      expect(chosen.faceDraft).toStrictEqual(Option.some({ ...picked }));
      expect(chosen.faceShuffles).toBe(dealt.faceShuffles);
    }
  );

  it.prop(
    "shows the choices of the part picked up, with exactly the worn one checked",
    { avatar: avatars },
    ({ avatar }) => {
      for (const part of PARTS) {
        const held = update(
          sheetFor(avatar),
          Messages.ChoseFacePart({ part })
        ).model;

        expect(checkedLabels(held)).toStrictEqual([
          choiceName(part, avatar[part]),
        ]);
        expect(shownOn(held, ".face-choice", "aria-label")).toStrictEqual(
          choicesOf(part).map((choice) => choiceName(part, choice))
        );
        expect(
          shownOn(held, ".face-callout.is-held", "aria-label")
        ).toStrictEqual([toldOf(avatar, part)]);
      }
    },
    { arbitrary: { runs: 5 } }
  );

  it.prop(
    "names every part and what it wears on a control beside the face",
    { avatar: avatars },
    ({ avatar }) => {
      expect(
        shownOn(sheetFor(avatar), ".face-callout", "aria-label").toSorted()
      ).toStrictEqual(PARTS.map((part) => toldOf(avatar, part)).toSorted());

      expect(
        shownOn(sheetFor(avatar), ".face-callout.is-held", "aria-label")
      ).toStrictEqual([]);
      expect(
        shownOn(sheetFor(avatar), ".face-choices", "aria-label")
      ).toStrictEqual(["Fish"]);
    },
    { arbitrary: { runs: 20 } }
  );

  it.prop(
    "reaches and changes every part with a mouse alone: click the part, click a choice",
    { avatar: avatars, wanted: avatars },
    ({ avatar, wanted }) => {
      for (const part of PARTS) {
        const steps = [
          Scene.click(calloutOf(part)),
          Scene.click(`#${choiceId(part, wanted[part])}`),
        ];

        const changed = { ...avatar, [part]: wanted[part] };

        expect(heldAfter(sheetFor(avatar), steps)).toStrictEqual([
          toldOf(changed, part),
        ]);
        expect(namedAfter(sheetFor(avatar), steps)).toStrictEqual(
          namesOfFace(changed)
        );
      }
    },
    { arbitrary: { runs: 5 } }
  );

  it.prop(
    "reaches and changes every part by touch alone: pick it up on the face, swipe to flip",
    { avatar: avatars, wanted: avatars },
    ({ avatar, wanted }) => {
      for (const part of PARTS) {
        const by = stepsTo(part, avatar[part], wanted[part]);

        const steps = [
          part === "colour" || part === "suit"
            ? Scene.click(calloutOf(part))
            : Scene.CustomElement.emit(faceElement, STAGE, "hold", { part }),
          Scene.CustomElement.emit(faceElement, STAGE, "flip", { by, part }),
        ];

        const changed = { ...avatar, [part]: wanted[part] };

        expect(heldAfter(sheetFor(avatar), steps)).toStrictEqual([
          toldOf(changed, part),
        ]);
        expect(namedAfter(sheetFor(avatar), steps)).toStrictEqual(
          namesOfFace(changed)
        );
      }
    },
    { arbitrary: { runs: 5 } }
  );

  it.prop(
    "reaches and changes every part with a keyboard alone: arrows on the part, or arrows among its choices",
    { avatar: avatars, wanted: avatars },
    ({ avatar, wanted }) => {
      for (const part of PARTS) {
        const presses = stepsTo(part, avatar[part], wanted[part]);
        const start = sheetFor(avatar);

        const rights = Array.from({ length: presses }, () =>
          Scene.keydown(calloutOf(part), "ArrowRight")
        );

        const changed = { ...avatar, [part]: wanted[part] };

        expect(namedAfter(start, rights)).toStrictEqual(namesOfFace(changed));
        expect(
          namedAfter(start, [
            ...rights,
            Scene.keydown(calloutOf(part), "ArrowLeft"),
          ])
        ).toStrictEqual(namesOfFace(stepped(changed, part, -1)));
        expect(heldAfter(start, rights.slice(0, 1))).toStrictEqual(
          presses === 0 ? [] : [toldOf(stepped(avatar, part, 1), part)]
        );

        const choices = choicesOf(part);
        const at = choices.indexOf(avatar[part]);
        const held = update(start, Messages.ChoseFacePart({ part })).model;

        expect(rovedTo(part, avatar[part], "ArrowRight")).toStrictEqual(
          Option.fromNullishOr(choices[(at + 1) % choices.length])
        );
        expect(rovedTo(part, avatar[part], "ArrowUp")).toStrictEqual(
          Option.fromNullishOr(
            choices[(at - 1 + choices.length) % choices.length]
          )
        );
        expect(rovedTo(part, avatar[part], "Home")).toStrictEqual(
          Option.fromNullishOr(choices[0])
        );
        expect(rovedTo(part, avatar[part], "End")).toStrictEqual(
          Option.fromNullishOr(choices.at(-1))
        );
        expect(rovedTo(part, avatar[part], "a")).toStrictEqual(Option.none());
        expect(
          shownOn(held, ".face-choice", "tabIndex").toSorted()
        ).toStrictEqual(
          choices
            .map((choice) => (choice === avatar[part] ? "0" : "-1"))
            .toSorted()
        );
      }
    },
    { arbitrary: { runs: 3 } }
  );

  it.prop(
    "puts a part down when its own control is pressed again, and keeps its choices in the tray",
    { avatar: avatars },
    ({ avatar }) => {
      for (const part of PARTS) {
        const twice = [
          Scene.click(calloutOf(part)),
          Scene.click(calloutOf(part)),
        ];

        expect(heldAfter(sheetFor(avatar), twice)).toStrictEqual([]);
        expect(
          shownAfter(sheetFor(avatar), twice, ".face-choices", "data-part")
        ).toStrictEqual([part]);
        expect(namedAfter(sheetFor(avatar), twice)).toStrictEqual(
          namesOfFace(avatar)
        );
      }
    },
    { arbitrary: { runs: 5 } }
  );

  it.prop(
    "follows a drag live on the labels and the tray, and makes the whole drag one step to undo",
    {
      avatar: avatars,
      part: Arbitrary.schema(PartSchema),
      path: Arbitrary.schema(
        Schema.Array(
          Schema.Int.check(Schema.isBetween({ maximum: 9, minimum: -9 }))
        ).check(Schema.isMinLength(1))
      ),
    },
    ({ avatar, part, path }) => {
      const start = sheetFor(avatar);
      let current = start;

      for (const by of path) {
        current = update(
          current,
          Messages.ScrubbedFacePart({ by, part })
        ).model;

        const shown = stepped(avatar, part, by);

        expect(draftOf(current)).toStrictEqual(shown);
        expect(namedAfter(current, [])).toStrictEqual(namesOfFace(shown));
        expect(checkedLabels(current)).toStrictEqual([
          choiceName(part, shown[part]),
        ]);
        expect(heldAfter(current, [])).toStrictEqual([toldOf(shown, part)]);
        expect(current.facePast).toStrictEqual([]);
      }

      const kept = update(
        current,
        Messages.SettledFaceScrub({ kept: true })
      ).model;

      expect(draftOf(kept)).toStrictEqual(draftOf(current));
      expect(kept.facePast).toStrictEqual(
        codeFor(draftOf(current)) === codeFor(avatar) ? [] : [{ ...avatar }]
      );
      expect(
        draftOf(update(kept, Messages.ClickedUndoFace()).model)
      ).toStrictEqual({ ...avatar });

      const dropped = update(
        current,
        Messages.SettledFaceScrub({ kept: false })
      ).model;

      expect(draftOf(dropped)).toStrictEqual({ ...avatar });
      expect(dropped.facePast).toStrictEqual([]);
    },
    { arbitrary: { runs: 25 } }
  );

  it.prop(
    "keeps every part's line on its own side for every fish, ends it on that part, and never lands two dots together",
    { avatar: avatars },
    ({ avatar }) => {
      const points = calloutPoints(avatar);

      expect(points.map(({ part }) => part).toSorted()).toStrictEqual(
        [...PLACED_PARTS].toSorted()
      );
      expect([...SIDES.left, ...SIDES.right].toSorted()).toStrictEqual(
        [...PLACED_PARTS].toSorted()
      );

      for (const point of points) {
        for (const other of points) {
          if (other !== point) {
            expect(
              Math.hypot(point.x - other.x, point.y - other.y)
            ).toBeGreaterThanOrEqual(DOTS_APART - 0.001);
          }
        }

        expect(point.worn).toBe(avatar[point.part] !== "None");

        for (const box of Option.toArray(boxOfPart(avatar, point.part))) {
          expect(point.x).toBeGreaterThanOrEqual(box.x - 2 * DOTS_APART);
          expect(point.x).toBeLessThanOrEqual(
            box.x + box.width + 2 * DOTS_APART
          );
          expect(point.y).toBeGreaterThanOrEqual(box.y - 2 * DOTS_APART);
          expect(point.y).toBeLessThanOrEqual(
            box.y + box.height + 2 * DOTS_APART
          );
        }
      }
    },
    { arbitrary: { runs: 200 } }
  );

  it.prop(
    "undoes any change in one step, a shuffle included, and does nothing with no face before",
    { avatar: avatars, made: moves },
    ({ avatar, made }) => {
      const start = sheetFor(avatar);

      expect(update(start, Messages.ClickedUndoFace()).model).toStrictEqual(
        start
      );
      expect(shownOn(start, ".face-undo", "disabled")).toHaveLength(1);

      let current = start;

      for (const move of made) {
        const next = update(current, messageOf(move)).model;
        const undone = update(next, Messages.ClickedUndoFace()).model;

        if (codeFor(draftOf(next)) === codeFor(draftOf(current))) {
          expect(next.facePast).toStrictEqual(current.facePast);
        } else {
          expect(draftOf(undone)).toStrictEqual(draftOf(current));
          expect(undone.facePast).toStrictEqual(current.facePast);
          expect(undone.faceTold).toBe("Back to the face before");
        }

        current = next;
      }
    },
    { arbitrary: { runs: 40 } }
  );

  it.prop(
    "says each change aloud, and drops the first-touch hint once the face is touched",
    { avatar: avatars, by: Arbitrary.schema(Schema.Literals([-1, 1])) },
    ({ avatar, by }) => {
      const start = sheetFor(avatar);

      expect(start.faceLearned).toBe(false);

      for (const part of PARTS) {
        const flipped = update(
          start,
          Messages.FlippedFacePart({ by, part })
        ).model;

        expect(flipped.faceTold).toBe(toldOf(draftOf(flipped), part));
        expect(flipped.faceLearned).toBe(true);
        expect(shownOn(flipped, ".face-told", "aria-live")).toStrictEqual([
          "polite",
        ]);
      }
    },
    { arbitrary: { runs: 12 } }
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
    { arbitrary: { runs: 25 } }
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
