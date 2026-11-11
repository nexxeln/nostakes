import type { Beat, Gesture, Lesson } from "../../features/learn/lesson.js";
import { handNumber } from "../../features/learn/walk.js";
import type { Walk } from "../../features/learn/walk.js";
import { button, el } from "./dom.js";

const KEYS: Readonly<Record<Gesture, string>> = {
  Drag: "R",
  Flick: "F",
  Next: "Enter",
  Peek: "Space",
  Tap: "C",
};

export interface Coached {
  readonly onBack: () => void;
  readonly onChoice: (index: number) => void;
  readonly onHand: (hand: string) => void;
  readonly onSkip: () => void;
}

export const openCoach = (
  root: HTMLElement,
  lesson: Lesson,
  { onBack, onChoice, onHand, onSkip }: Coached
) => {
  const coach = el("div", "coach");
  const line = el("p", "say");
  const facts = el("p", "sr");
  const cue = el("p", "cue");
  const choices = el("div", "choices");
  const controls = el("nav", "controls");
  const backStep = button("step", "Back");
  const skipStep = button("step", "Skip");
  const dots = el("ol", "dots");

  line.setAttribute("role", "status");
  line.setAttribute("aria-live", "polite");
  choices.setAttribute("role", "group");
  choices.setAttribute("aria-label", "Your move");
  controls.setAttribute("aria-label", "The lesson");
  backStep.addEventListener("click", onBack);
  skipStep.addEventListener("click", onSkip);

  const marks = lesson.hands.map((hand, index) => {
    const mark = button("", "");

    mark.setAttribute("aria-label", `Hand ${index + 1}: ${hand.title}`);
    mark.addEventListener("click", () => {
      onHand(hand.id);
    });

    const item = el("li", "");

    item.append(mark);
    dots.append(item);

    return mark;
  });

  controls.append(backStep, dots, skipStep);
  facts.setAttribute("role", "status");
  coach.append(line, facts, cue, choices, controls);
  root.append(coach);

  const choiceButton = (beat: Beat, index: number) => {
    const choice = beat.choices[index];
    const made = button(index === 0 ? "button" : "button paper", "");

    made.dataset.gesture = choice?.gesture ?? "";
    made.dataset.to = choice?.to ?? "";
    made.append(
      el("kbd", "", KEYS[choice?.gesture ?? "Tap"]),
      choice?.label ?? ""
    );
    made.addEventListener("click", () => {
      onChoice(index);
    });

    return made;
  };

  return {
    again: () => {
      cue.classList.remove("again");
      cue.getBoundingClientRect();
      cue.classList.add("again");
    },
    show: (beat: Beat, walk: Walk, said: string) => {
      const at = handNumber(lesson, walk);

      facts.textContent = said;
      line.textContent = beat.kind === "Recap" ? "" : beat.line;
      cue.textContent = beat.cue;
      choices.replaceChildren(
        ...beat.choices.map((_, index) => choiceButton(beat, index))
      );
      backStep.disabled = walk.before.length === 0;
      skipStep.disabled = beat.choices.length === 0;
      skipStep.textContent = beat.kind === "Outcome" ? "Next" : "Skip";

      for (const [index, mark] of marks.entries()) {
        mark.classList.toggle("done", index + 1 < at);

        if (index + 1 === at) {
          mark.setAttribute("aria-current", "step");
        } else {
          mark.removeAttribute("aria-current");
        }
      }
    },
  };
};
