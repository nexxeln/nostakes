import { HABITS, MANNERS } from "../../features/learn/guide.js";
import { button, el } from "./dom.js";

export interface Recapped {
  readonly onAgain: () => void;
  readonly onKeep: () => void;
  readonly onRanks: () => void;
  readonly onSend: () => void;
}

export const openRecap = (
  root: HTMLElement,
  { onAgain, onKeep, onRanks, onSend }: Recapped
) => {
  const recap = el("section", "recap");
  const habits = el("ol", "");
  const door = document.createElement("a");
  const keep = button("button paper", "Keep the card");
  const send = button("button paper", "Send to a friend");
  const ranks = button("link", "What beats what");
  const again = button("link", "Play it again");
  const said = el("p", "said");
  const actions = el("div", "row");
  const links = el("div", "row");

  recap.setAttribute("aria-label", "What you learned");
  said.setAttribute("role", "status");
  door.className = "button big";
  door.href = "/";
  door.textContent = "Open a room";
  habits.append(...HABITS.map((habit) => el("li", "", habit)));
  actions.append(keep, send);
  links.append(ranks, again);
  recap.append(
    el("h2", "", "You can sit at a real table now."),
    habits,
    el("p", "manners", MANNERS),
    door,
    actions,
    said,
    links
  );
  root.append(recap);
  keep.addEventListener("click", onKeep);
  send.addEventListener("click", onSend);
  ranks.addEventListener("click", onRanks);
  again.addEventListener("click", onAgain);

  return {
    focus: () => {
      door.focus({ preventScroll: true });
    },
    say: (words: string) => {
      said.textContent = words;
    },
    shown: (on: boolean) => {
      const focused = document.activeElement;

      recap.inert = !on;

      if (!on && focused instanceof HTMLElement && recap.contains(focused)) {
        focused.blur();
      }
    },
  };
};
