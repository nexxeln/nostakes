import type { Avatar, Expression, Theme } from "@nostakes/avatar";

import { FRIEND_FACES, NAMES } from "../../features/learn/cast.js";
import { SEATS } from "../../features/learn/lesson.js";
import type {
  Beat,
  Friend,
  Hand,
  Move,
  Seat,
} from "../../features/learn/lesson.js";
import { afterMove, chipsText, UNDEALT } from "../../features/learn/table.js";
import type { Table } from "../../features/learn/table.js";
import { paintAvatar, paintCardFace } from "../table/markup.js";
import { button, el, ring, spotIn } from "./dom.js";
import type { Spot } from "./dom.js";
import type { Timeline } from "./timeline.js";

const FRIENDS: readonly Friend[] = ["bo", "mara", "jonas"];

const FACE_PX = 112;

const STEP_MS = 520;

const TALK_GAP_MS = 900;

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

const EASE_BACK = "cubic-bezier(0.3, 1.35, 0.5, 1)";

export interface View {
  readonly arriving: readonly Move[];
  readonly beat: Beat;
  readonly before: Table;
  readonly hand: Hand | undefined;
  readonly table: Table;
}

export interface Look {
  readonly learner: Avatar;
  readonly still: boolean;
  readonly theme: Theme;
}

const capitalised = (text: string) =>
  `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

const cardEl = (card: string) => {
  const made = el("div", "card");
  const face = el("div", "face");

  made.dataset.card = card;
  paintCardFace(face, card);
  made.append(el("div", "back"), face);

  return made;
};

const seatEl = (seat: Seat) => {
  const root = el("div", seat === "you" ? "seat me at" : "seat at");
  const tile = el("div", "tile");
  const label = el("div", "label");
  const line = el("div", "line");

  root.dataset.seat = seat;
  tile.append(el("div", "frame"), ring(), el("div", "pic"), el("div", "tab"));
  line.append(el("span", "st"), el("span", "act"));
  label.append(el("div", "name", NAMES[seat]), line);
  root.append(tile, label);

  return root;
};

const pileEl = (seat: Seat) => {
  const pile = el("div", "pile at");

  pile.dataset.seat = seat;
  pile.append(el("i", "dot paper-chip"), el("span", "amt"), el("span", "tag"));

  return pile;
};

const shownEl = (seat: Friend) => {
  const shown = el("div", "shown");

  shown.dataset.seat = seat;

  return shown;
};

const part = (root: ParentNode, selector: string) => {
  const found = root.querySelector(selector);

  if (!(found instanceof HTMLElement)) {
    throw new TypeError(`The lesson's stage has no ${selector}.`);
  }

  return found;
};

const expressionOf = (seat: Seat, table: Table, beat: Beat): Expression => {
  if (table.folded.includes(seat)) {
    return "Folded";
  }

  return beat.faces[seat] ?? "Resting";
};

export const openStage = (
  lesson: HTMLElement,
  timeline: Timeline,
  look: Look
) => {
  const scene = el("div", "scene intro");
  const potTab = el("div", "pot at");
  const board = el("div", "board at");
  const hand = el("div", "hand at");
  const fx = el("div", "fx");
  const chip = button("chipctl at", "");
  const chipTop = el("span", "a");
  const chipBottom = el("span", "b");
  const chipLabel = el("span", "lbl");
  const myName = el("span", "named");
  const seats = new Map(SEATS.map((seat) => [seat, seatEl(seat)] as const));
  const piles = new Map(SEATS.map((seat) => [seat, pileEl(seat)] as const));
  const shown = new Map(FRIENDS.map((seat) => [seat, shownEl(seat)] as const));
  const slots = Array.from({ length: 5 }, () => el("div", "slot"));
  const drawn = new Map<Seat, string>();
  const bubbles = new Set<HTMLElement>();
  const now = { hand: "", theme: look.theme };

  scene.setAttribute("aria-hidden", "true");
  chip.tabIndex = -1;
  potTab.append(el("span", "k", "Pot"), el("span", "v", "0"));
  board.append(...slots);
  hand.append(el("div", "hc"), el("div", "hc"), myName);
  chipLabel.append(chipTop, chipBottom);
  chip.append(el("span", "disc"), chipLabel, el("span", "up"));
  scene.append(
    el("div", "felt"),
    potTab,
    board,
    ...seats.values(),
    ...piles.values(),
    ...shown.values(),
    hand,
    fx,
    chip
  );
  lesson.append(scene);

  const seatOf = (seat: Seat) => seats.get(seat) ?? scene;

  const pileOf = (seat: Seat) => piles.get(seat) ?? scene;

  const paintFace = (seat: Seat, expression: Expression) => {
    const key = `${expression}:${now.theme}`;

    if (drawn.get(seat) !== key) {
      const pic = part(seatOf(seat), ".pic");

      drawn.set(seat, key);
      paintAvatar(pic, seat === "you" ? look.learner : FRIEND_FACES[seat], {
        expression,
        size: FACE_PX,
        theme: now.theme,
      });

      if (!look.still) {
        pic.animate([{ scale: 0.84 }, { scale: 1 }], {
          duration: 380,
          easing: EASE_BACK,
        });
      }
    }
  };

  const fly = (kind: string, from: Spot, to: Spot, delay: number) => {
    if (look.still) {
      return;
    }

    const flying = el("i", `fly ${kind}`);

    fx.append(flying);
    flying
      .animate(
        [
          { opacity: 0, transform: `translate(${from.x}px, ${from.y}px)` },
          { offset: 0.15, opacity: 1 },
          { opacity: 1, transform: `translate(${to.x}px, ${to.y}px)` },
        ],
        { delay, duration: 360, easing: EASE, fill: "both" }
      )
      .addEventListener("finish", () => {
        flying.remove();
      });
  };

  const dealHand = (dealt: Hand | undefined) => {
    for (const [index, slot] of slots.entries()) {
      const card = dealt?.board[index];

      slot.replaceChildren(...(card === undefined ? [] : [cardEl(card)]));
    }

    for (const [index, place] of [...hand.querySelectorAll(".hc")].entries()) {
      const card = dealt?.hole.you[index];

      place.replaceChildren(...(card === undefined ? [] : [cardEl(card)]));
    }

    for (const seat of FRIENDS) {
      shown
        .get(seat)
        ?.replaceChildren(
          ...(dealt?.hole[seat] ?? []).map(cardEl),
          el("span", "named")
        );
    }
  };

  const showTable = (table: Table, beat: Beat) => {
    for (const seat of SEATS) {
      const root = seatOf(seat);
      const pile = pileOf(seat);
      const won = table.won?.seat === seat;

      part(root, ".st").textContent = chipsText(table.stacks[seat]);
      part(root, ".act").textContent = table.said[seat];
      root.classList.toggle("said", table.said[seat].length > 0);
      root.classList.toggle("out", table.folded.includes(seat));
      root.classList.toggle("won", won);
      part(root, ".tab").textContent = won
        ? `+${chipsText(table.won?.amount ?? 0)}`
        : "";
      part(root, ".tab").classList.toggle("on", won);
      part(pile, ".amt").textContent = chipsText(table.bets[seat]);
      part(pile, ".tag").textContent = table.posted[seat];
      pile.classList.toggle("on", table.bets[seat] > 0);
      pile.classList.toggle("tagged", table.posted[seat].length > 0);
    }

    part(potTab, ".v").textContent = chipsText(table.pot);
    potTab.classList.toggle("on", table.pot > 0);

    for (const [index, slot] of slots.entries()) {
      const up = index < table.board;

      slot.classList.toggle("full", up);
      slot.querySelector(".card")?.classList.toggle("up", up);
    }

    for (const seat of FRIENDS) {
      const up = table.shown.includes(seat);
      const place = shown.get(seat);

      place?.classList.toggle("on", up);

      for (const card of place?.querySelectorAll(".card") ?? []) {
        card.classList.toggle("up", up);
      }
    }

    hand.classList.toggle("dealt", beat.kind !== "Intro");
    hand.classList.toggle("open", beat.peeked && !table.folded.includes("you"));
    hand.classList.toggle("thrown", table.folded.includes("you"));
  };

  const hush = () => {
    for (const bubble of bubbles) {
      bubble.remove();
    }

    bubbles.clear();
  };

  const speak = (who: Friend, words: string, order: number) => {
    const bubble = el("div", "bubble", words);
    const tile = part(seatOf(who), ".tile");

    bubble.style.setProperty("--hold", `${2600 + order * TALK_GAP_MS}ms`);
    bubble.style.animationDelay = `${order * TALK_GAP_MS}ms, ${2600 + order * TALK_GAP_MS}ms`;
    bubble.addEventListener("animationend", (event) => {
      if (event.animationName === "hush") {
        bubble.remove();
        bubbles.delete(bubble);
      }
    });
    scene.append(bubble);

    const anchor = spotIn(scene, tile);
    const half = bubble.offsetWidth / 2;

    const middle = Math.min(
      scene.clientWidth - half - 8,
      Math.max(half + 8, anchor.x)
    );

    bubble.style.left = `${middle - half}px`;
    bubble.style.top = `${anchor.y + tile.offsetHeight * 0.58 + order * (bubble.offsetHeight + 6)}px`;
    bubble.style.setProperty("--tail", `${anchor.x - (middle - half)}px`);
    bubbles.add(bubble);
  };

  const showBeat = (view: View) => {
    const { beat, table } = view;
    const judged = beat.kind === "Outcome" && beat.lit.length > 0;

    for (const seat of SEATS) {
      paintFace(seat, expressionOf(seat, table, beat));
    }

    for (const card of scene.querySelectorAll<HTMLElement>(".card")) {
      const lit = beat.lit.includes(card.dataset.card ?? "");

      card.classList.toggle("lit", lit);
      card.classList.toggle("dimmed", judged && !lit);
    }

    for (const seat of FRIENDS) {
      const named = beat.tabled.find((tabled) => tabled.seat === seat)?.name;
      const place = shown.get(seat);

      if (place !== undefined) {
        part(place, ".named").textContent =
          named === undefined || !table.shown.includes(seat)
            ? ""
            : capitalised(named);
      }
    }

    myName.textContent = capitalised(
      beat.tabled.find((tabled) => tabled.seat === "you")?.name ?? ""
    );
    hush();

    for (const [order, talk] of beat.talk.entries()) {
      speak(talk.who, talk.words, order);
    }
  };

  const showChip = (beat: Beat) => {
    const forward = beat.choices.find(
      (choice) => choice.gesture === "Tap" || choice.gesture === "Next"
    );

    const pulled = beat.choices.find((choice) => choice.gesture === "Drag");
    const words = (forward ?? pulled)?.label ?? "";
    const [first = "", ...rest] = words.split(" ");

    chipTop.textContent = first;
    chipBottom.textContent = rest.join(" ");
    chip.classList.toggle("idle", words.length === 0);
    chip.classList.toggle("live", words.length > 0);
    chip.classList.toggle("pulls", pulled !== undefined);
    chip.classList.toggle("nudge", beat.kind === "Intro");
    chip.classList.toggle("gone", beat.kind === "Recap");
    chip.setAttribute(
      "aria-label",
      words.length > 0 ? words : "Nothing to tap"
    );
  };

  const flightFor = (move: Move, table: Table) => {
    if (move.kind === "Bet" || move.kind === "Call") {
      fly(
        "fchip paper-chip",
        spotIn(scene, seatOf(move.seat)),
        spotIn(scene, pileOf(move.seat)),
        0
      );
    }

    if (move.kind === "Fold" && move.seat !== "you") {
      fly("fcard", spotIn(scene, seatOf(move.seat)), spotIn(scene, potTab), 0);
    }

    if (table.won !== undefined) {
      for (const order of [0, 1, 2, 3, 4]) {
        fly(
          "fchip paper-chip",
          spotIn(scene, potTab),
          spotIn(scene, seatOf(table.won.seat)),
          order * 50
        );
      }
    }
  };

  const settle = (view: View) => {
    timeline.finish();

    if (now.hand !== view.beat.hand) {
      now.hand = view.beat.hand;
      dealHand(view.hand);
    }

    scene.classList.toggle("intro", view.beat.kind === "Intro");
    lesson.classList.toggle("playing", view.beat.kind !== "Intro");
    lesson.classList.toggle("recapped", view.beat.kind === "Recap");
    showTable(view.hand === undefined ? UNDEALT : view.table, view.beat);
    showBeat(view);
    showChip(view.beat);
  };

  const play = (view: View) => {
    if (
      look.still ||
      view.arriving.length === 0 ||
      view.arriving.length > 6 ||
      now.hand !== view.beat.hand
    ) {
      settle(view);

      return;
    }

    timeline.finish();
    hush();
    showChip(view.beat);

    const tables: Table[] = [];

    for (const move of view.arriving) {
      tables.push(afterMove(tables.at(-1) ?? view.before, move));
    }

    timeline.run([
      ...view.arriving.map((move, index) => ({
        at: index * STEP_MS,
        run: () => {
          const table = tables[index] ?? view.table;

          showTable(table, view.beat);
          flightFor(move, table);
        },
      })),
      {
        at: view.arriving.length * STEP_MS,
        run: () => {
          showBeat(view);
        },
      },
    ]);
  };

  return {
    chip,
    hand,
    peek: (looking: boolean, beat: Beat) => {
      hand.classList.toggle("peek", looking);
      paintFace("you", looking ? "LookingDown" : (beat.faces.you ?? "Resting"));
    },
    play,
    repaint: (theme: Theme, view: View) => {
      now.theme = theme;
      drawn.clear();
      settle(view);
    },
    scene,
    settle,
  };
};

export type Stage = ReturnType<typeof openStage>;
