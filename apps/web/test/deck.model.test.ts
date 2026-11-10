import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";

import { Messages } from "../src/features/message.js";
import { DeckSchema } from "../src/features/model.js";
import type { Deck } from "../src/features/model.js";
import { init, update } from "../src/features/update.js";

const opened = (deck: Deck) =>
  init({
    deck,
    invite: Option.none(),
    learned: [],
    profile: { avatar: "", name: "Ana" },
    reloadedFor: Option.none(),
    rooms: [],
    saved: Option.none(),
    sound: false,
    systemTheme: "Light",
    theme: Option.none(),
  });

const deckCommands = (
  commands: ReturnType<typeof update>["commands"] | undefined
) =>
  (commands ?? []).flatMap(({ args, name }) =>
    name === "ApplyDeck" ? [args] : []
  );

describe("the four-colour deck", () => {
  it.prop(
    "draws the deck this device chose last time from the first page",
    { deck: DeckSchema },
    ({ deck }) => {
      const { commands, model } = opened(deck);

      expect(model.deck).toBe(deck);
      expect(deckCommands(commands)).toEqual([{ deck }]);
    }
  );

  it.prop(
    "applies and remembers the deck a player picks, on this device only",
    { from: DeckSchema, to: DeckSchema },
    ({ from, to }) => {
      const { commands, model } = update(
        opened(from).model,
        Messages.ChoseDeck({ deck: to })
      );

      expect(model.deck).toBe(to);
      expect(deckCommands(commands)).toEqual([{ deck: to }]);
      expect((commands ?? []).map(({ name }) => name)).toEqual(["ApplyDeck"]);
    }
  );
});
