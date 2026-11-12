import { describe, expect, it } from "@effect/vitest";
import { PlayerIdSchema, RoomCodeSchema } from "@nostakes/protocol";
import type { PlayerId } from "@nostakes/protocol";
import { MemberCommandSchema, RoomViewSchema } from "@nostakes/room";
import type { MemberCommand } from "@nostakes/room";
import { Option, Schema } from "effect";

import { Messages, ReplyOutcomes } from "../src/features/message.js";
import type { Message } from "../src/features/message.js";
import type { Model } from "../src/features/model.js";
import { init, update } from "../src/features/update.js";

type OpenView = typeof RoomViewSchema.cases.Open.Type;

type Issued = NonNullable<ReturnType<typeof update>["commands"]>;

const CODE = RoomCodeSchema.make("ABC234");

const SentSchema = Schema.Struct({
  command: MemberCommandSchema,
  key: Schema.Int,
});

const sentOf = (commands: Issued) =>
  commands.flatMap((command) => {
    const sent = Schema.decodeUnknownOption(SentSchema)(command.args);

    return command.name === "SendToRoom" && Option.isSome(sent)
      ? [sent.value]
      : [];
  });

interface Sent {
  readonly command: MemberCommand;
  readonly key: number;
}

const play = (model: Model, messages: readonly Message[]) => {
  const sent: Sent[] = [];
  let current = model;

  for (const message of messages) {
    const next = update(current, message);

    sent.push(...sentOf(next.commands ?? []));
    current = next.model;
  }

  return { model: current, sent };
};

const opened = (player: PlayerId) =>
  init({
    deck: "TwoColour",
    invite: Option.some(CODE),
    learned: [],
    profile: { avatar: "", name: "Ana" },
    reloadedFor: Option.none(),
    rooms: [],
    saved: Option.some({ code: CODE, player }),
    sound: false,
    systemTheme: "Light",
    theme: Option.none(),
  }).model;

const live = (presence: readonly PlayerId[]) =>
  Messages.ReceivedLink({
    link: {
      newBuild: Option.none(),
      phase: "Live",
      presence,
      receivedAt: 0,
      refusal: Option.none(),
      retryDelayMs: Option.none(),
    },
  });

const idOf = (place: number) =>
  PlayerIdSchema.make(`player-${String(place).padStart(9, "0")}`);

const hostedBy = (view: OpenView, hosting: boolean): OpenView => {
  const members = view.members.map((member, place) => ({
    ...member,
    player: idOf(place),
  }));

  const count = Math.max(members.length, 1);

  return {
    ...view,
    host: idOf(0),
    members,
    seats: view.seats.map((seat, place) => ({
      ...seat,
      occupant: seat.occupant.pipe(
        Option.map((occupant) => ({
          ...occupant,
          player: idOf((place * 5) % count),
        }))
      ),
    })),
    you: Option.some(idOf(hosting ? 0 : 1)),
  };
};

const todaysOrder = (view: OpenView): readonly PlayerId[] => {
  const members = view.members.map(({ player }) => player);

  const seated = view.seats.flatMap(({ occupant }) =>
    Option.toArray(occupant).map(({ player }) => player)
  );

  return [...seated, ...members].filter(
    (player, place, all) => all.indexOf(player) === place
  );
};

describe("the host leaving the room", () => {
  it.prop(
    "hands the host to a connected member and leaves only once that is accepted, or leaves alone when nobody else is here",
    {
      accepted: Schema.Boolean,
      here: Schema.Array(Schema.Boolean),
      hosting: Schema.Boolean,
      pick: Schema.Option(
        Schema.Int.check(Schema.isBetween({ maximum: 12, minimum: 0 }))
      ),
      view: RoomViewSchema.cases.Open,
    },
    ({ accepted, here, hosting, pick, view: generated }) => {
      const view = hostedBy(generated, hosting);
      const you = Option.getOrThrow(view.you);

      const presence = view.members
        .map(({ player }) => player)
        .filter((player, place) => player === you || here[place] === true);

      const others = todaysOrder(view).filter(
        (player) => player !== you && presence.includes(player)
      );

      const picked = pick.pipe(
        Option.flatMap((place) =>
          Option.fromNullishOr(view.members[place]?.player)
        )
      );

      const left = play(opened(you), [
        live(presence),
        Messages.ReceivedUpdate({ events: [], receivedAt: 0, seq: 1, view }),
        Messages.ClickedConfirm({
          confirm: MemberCommandSchema.cases.LeaveRoom.make({}),
        }),
        ...Option.toArray(picked).map((player) =>
          Messages.ChoseHeir({ player })
        ),
        Messages.ClickedLeave(),
      ]);

      if (!hosting || others.length === 0) {
        expect(left.sent.map(({ command }) => command._tag)).toStrictEqual([
          "LeaveRoom",
        ]);

        return;
      }

      const [handOver] = left.sent;

      const heir = picked.pipe(
        Option.filter((player) => others.includes(player)),
        Option.getOrElse(() => others[0])
      );

      expect(left.sent).toHaveLength(1);
      expect(handOver?.command).toStrictEqual(
        MemberCommandSchema.cases.TransferHost.make({ to: heir ?? you })
      );

      const answered = play(left.model, [
        Messages.ReceivedReply({
          key: handOver?.key ?? -1,
          outcome: accepted
            ? ReplyOutcomes.Accepted({ seq: 2 })
            : ReplyOutcomes.Lost({ reason: "the line dropped." }),
        }),
      ]);

      expect(answered.sent.map(({ command }) => command._tag)).toStrictEqual(
        accepted ? ["LeaveRoom"] : []
      );
    },
    { arbitrary: { runs: 100 } }
  );
});
