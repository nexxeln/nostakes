import type { Theme } from "@nostakes/avatar";

import {
  LESSON_CARD_TITLE,
  lessonCardSvg,
} from "../../features/learn/keep-card.js";
import { Keeper } from "../pictures/keeper.js";

export const lessonKeeper = (theme: Theme, drawn: () => void) => {
  const keeper = new Keeper(
    {
      svg: (frame, fonts) =>
        lessonCardSvg({ deck: "TwoColour", fonts, frame, theme }),
      title: LESSON_CARD_TITLE,
    },
    drawn
  );

  keeper.prepare(["Chat"]);

  return keeper;
};
