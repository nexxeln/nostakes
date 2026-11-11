import { render } from "@nostakes/avatar";
import type { Expression, Theme } from "@nostakes/avatar";
import { Effect } from "effect";

import { FRIEND_IDS, FRIENDS, STARTING_STACK } from "./cast.js";
import type { FriendId, SeatId } from "./cast.js";
import { cardMarkup, chipsText } from "./markup.js";

const FRIEND_FACE_PX = 96;

const MY_FACE_PX = 220;

const CHIPS_IN_A_PUSH = 7;

const GATE_FROM_MS = 900;

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

const EASE_BACK = "cubic-bezier(0.3, 1.35, 0.5, 1)";

const SEATS: readonly SeatId[] = [...FRIEND_IDS, "you"];

export const need = (root: ParentNode, selector: string) => {
  const found = root.querySelector(selector);

  if (!(found instanceof HTMLElement)) {
    throw new TypeError(`The stage has no ${selector}. Rebuild the page.`);
  }

  return found;
};

const needDrawn = (root: ParentNode, selector: string) => {
  const found = root.querySelector(selector);

  if (!(found instanceof SVGElement)) {
    throw new TypeError(`The stage has no ${selector}. Rebuild the page.`);
  }

  return found;
};

export interface Pace {
  readonly next: () => boolean;
  readonly still: () => boolean;
  readonly wait: (ms: number) => Effect.Effect<void>;
}

type Holders = Set<() => void>;

const heldIn = (holders: Holders) =>
  Effect.callback<"Released">((resume) => {
    const open = () => {
      resume(Effect.succeed("Released"));
    };

    holders.add(open);

    return Effect.sync(() => {
      holders.delete(open);
    });
  }).pipe(Effect.asVoid);

export const openPace = (
  still: boolean,
  gated: (open: boolean) => void
): Pace => {
  const gates: Holders = new Set();

  const gate = Effect.suspend(() => {
    gated(true);

    return heldIn(gates);
  });

  return {
    next: () => {
      const held = [...gates];

      gates.clear();
      gated(false);

      for (const open of held) {
        open();
      }

      return held.length > 0;
    },
    still: () => still,
    wait: (ms) => {
      if (!still) {
        return Effect.sleep(ms);
      }

      return ms >= GATE_FROM_MS ? gate : Effect.void;
    },
  };
};

interface Spot {
  readonly x: number;
  readonly y: number;
}

interface Flight {
  readonly delay: number;
  readonly from: Spot;
  readonly kind: string;
  readonly ms: number;
  readonly to: Spot;
}

const chipFlight = (from: Spot, to: Spot, ms: number): Flight => ({
  delay: 0,
  from,
  kind: "fchip paper-chip",
  ms,
  to,
});

const cardFlight = (from: Spot, to: Spot, delay: number): Flight => ({
  delay,
  from,
  kind: "fcard",
  ms: 340,
  to,
});

export type Tone = "hot" | "plain" | "quiet";

interface Look {
  avatar: (typeof FRIENDS)[FriendId]["avatar"];
  expression: Expression;
  pot: number;
  theme: Theme;
}

export const openStage = (scene: HTMLElement, pace: Pace) => {
  const fx = need(scene, ".fx");
  const potTab = need(scene, ".pot");
  const potValue = need(potTab, ".v");
  const deck = need(scene, ".deck");
  const board = need(scene, ".board");
  const me = need(scene, ".me");
  const myPic = need(me, ".pic");
  const hand = need(scene, ".hand");
  const seal = need(scene, ".seal");
  const slots = [...board.querySelectorAll<HTMLElement>(".slot")];
  const drawn = new Map<string, string>();
  const stacks = new Map<SeatId, number>();
  const bets = new Map<SeatId, number>();
  const bubbles = new Map<SeatId, HTMLElement>();
  const expressions = new Map<FriendId, Expression>();
  const clocks = new Map<SeatId, Animation>();

  const model: Look = {
    avatar: FRIENDS.jonas.avatar,
    expression: "Resting",
    pot: 0,
    theme: "Light",
  };

  const seatOf = (id: SeatId) =>
    id === "you" ? me : need(scene, `.seat[data-seat="${id}"]`);

  const pileOf = (id: SeatId) => need(scene, `.pile[data-seat="${id}"]`);

  const quiet = () => pace.still();

  const spotOf = (element: Element): Spot => {
    const box = element.getBoundingClientRect();
    const frame = scene.getBoundingClientRect();

    return {
      x: box.left + box.width / 2 - frame.left,
      y: box.top + box.height / 2 - frame.top,
    };
  };

  const faceOf = (id: FriendId, expression: Expression) => {
    const key = `${id}:${expression}:${model.theme}`;

    const art =
      drawn.get(key) ??
      render(FRIENDS[id].avatar, {
        expression,
        size: FRIEND_FACE_PX,
        theme: model.theme,
      });

    drawn.set(key, art);

    return art;
  };

  const paintFriend = (id: FriendId) => {
    need(seatOf(id), ".pic").innerHTML = faceOf(
      id,
      expressions.get(id) ?? "Resting"
    );
  };

  const paintMe = (layers: boolean) => {
    myPic.innerHTML = render(model.avatar, {
      expression: model.expression,
      layers,
      size: MY_FACE_PX,
      theme: model.theme,
    });
  };

  const pop = (element: HTMLElement, from: number) => {
    if (!quiet()) {
      element.animate([{ scale: from }, { scale: 1 }], {
        duration: 420,
        easing: EASE_BACK,
      });
    }
  };

  const express = (id: SeatId, expression: Expression) => {
    if (id === "you") {
      if (model.expression !== expression) {
        model.expression = expression;
        paintMe(false);
      }

      return;
    }

    if (expressions.get(id) !== expression) {
      expressions.set(id, expression);
      paintFriend(id);
      pop(need(seatOf(id), ".pic"), 0.82);
    }
  };

  const fly = ({ delay, from, kind, ms, to }: Flight) =>
    Effect.suspend(() => {
      if (quiet()) {
        return Effect.void;
      }

      const flying = document.createElement("i");
      const turn = (from.x * 7 + to.y * 3) % 40;

      flying.className = `fly ${kind}`;
      fx.append(flying);

      const motion = flying.animate(
        [
          {
            opacity: 0,
            transform: `translate(${from.x}px, ${from.y}px) rotate(${turn - 20}deg)`,
          },
          { offset: 0.12, opacity: 1 },
          {
            opacity: 1,
            transform: `translate(${to.x}px, ${to.y}px) rotate(${20 - turn}deg)`,
          },
        ],
        { delay, duration: ms, easing: EASE, fill: "both" }
      );

      return pace.wait(delay + ms).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            motion.cancel();
            flying.remove();
          })
        )
      );
    });

  const writeStack = (id: SeatId) => {
    need(seatOf(id), ".st").textContent = chipsText(stacks.get(id) ?? 0);
  };

  const writePot = () => {
    potValue.textContent = chipsText(model.pot);
    potTab.classList.toggle("on", model.pot > 0);
    pop(potTab, 1.16);
  };

  const hush = (id: SeatId) => {
    const bubble = bubbles.get(id);

    if (bubble !== undefined) {
      bubbles.delete(id);
      bubble.classList.add("leaving");
    }
  };

  const hushAll = () => {
    for (const id of SEATS) {
      hush(id);
    }
  };

  const speak = (id: FriendId, words: string, ms: number, loud = false) => {
    if (pace.still()) {
      hushAll();
    } else {
      hush(id);
    }

    const bubble = document.createElement("div");
    const tile = need(seatOf(id), ".tile");

    bubble.className = loud ? "bubble loud" : "bubble";
    bubble.textContent = words;
    bubble.style.setProperty("--hold", `${ms}ms`);
    bubble.addEventListener("animationend", (event) => {
      if (event.animationName === "hush") {
        bubble.remove();

        if (bubbles.get(id) === bubble) {
          bubbles.delete(id);
        }
      }
    });
    scene.append(bubble);

    const anchor = spotOf(tile);
    const half = bubble.offsetWidth / 2;
    const edge = 8;

    const middle = Math.min(
      scene.clientWidth - half - edge,
      Math.max(half + edge, anchor.x)
    );

    bubble.style.left = `${middle - half}px`;
    bubble.style.top = `${anchor.y + tile.offsetHeight * (loud ? 1.02 : 0.58)}px`;
    bubble.style.setProperty("--tail", `${anchor.x - (middle - half)}px`);
    bubbles.set(id, bubble);
  };

  const say = (id: FriendId, words: string, ms: number) =>
    Effect.suspend(() => {
      speak(id, words, ms);

      return pace.wait(Math.min(ms, 1000));
    });

  const act = (id: SeatId, words: string, tone: Tone = "plain") => {
    const seat = seatOf(id);
    const line = need(seat, ".act");

    line.textContent = words;
    line.className = tone === "plain" ? "act" : `act ${tone}`;
    seat.classList.toggle("said", words.length > 0);
  };

  const post = (id: SeatId, total: number, tag = "") =>
    Effect.gen(function* postChips() {
      const before = bets.get(id) ?? 0;
      const pile = pileOf(id);

      stacks.set(id, (stacks.get(id) ?? 0) - (total - before));
      bets.set(id, total);
      yield* fly(chipFlight(spotOf(seatOf(id)), spotOf(pile), 300));
      need(pile, ".amt").textContent = chipsText(total);
      need(pile, ".tag").textContent = tag;
      pile.classList.toggle("tagged", tag.length > 0);
      pile.classList.add("on");
      writeStack(id);
    });

  const collect = Effect.gen(function* collectBets() {
    const target = spotOf(potTab);
    const staked = SEATS.filter((id) => (bets.get(id) ?? 0) > 0);

    const flights = staked.map((id) => {
      const pile = pileOf(id);
      const from = spotOf(pile);

      pile.classList.remove("on", "tagged");
      model.pot += bets.get(id) ?? 0;

      return fly(chipFlight(from, target, 320));
    });

    bets.clear();
    yield* Effect.all(flights, { concurrency: "unbounded" });
    writePot();

    for (const id of SEATS) {
      if (!seatOf(id).classList.contains("out")) {
        act(id, "");
      }
    }
  });

  const stopClock = (id: SeatId) => {
    clocks.get(id)?.cancel();
    clocks.delete(id);
    seatOf(id).classList.remove("on-clock", "acting");
  };

  const startClock = (id: SeatId, ms: number) => {
    stopClock(id);
    seatOf(id).classList.add("on-clock", "acting");

    if (!quiet()) {
      clocks.set(
        id,
        needDrawn(seatOf(id), ".ring .run").animate(
          [{ strokeDashoffset: 0 }, { strokeDashoffset: 100 }],
          { duration: ms, fill: "forwards" }
        )
      );
    }
  };

  const fold = (id: FriendId) =>
    Effect.suspend(() => {
      const seat = seatOf(id);

      express(id, "Folded");
      act(id, "Fold", "quiet");
      seat.classList.add("out");
      stopClock(id);

      return fly(cardFlight(spotOf(seat), spotOf(potTab), 0));
    });

  const think = (id: FriendId, ms: number) =>
    Effect.gen(function* thinkItOver() {
      express(id, "Thinking");
      startClock(id, ms * 2.4);
      yield* pace.wait(ms);
      stopClock(id);
    });

  const dealTo = (id: SeatId, round: number, order: number) =>
    fly(
      cardFlight(
        spotOf(deck),
        spotOf(id === "you" ? hand : seatOf(id)),
        (round * SEATS.length + order) * 70
      )
    ).pipe(
      Effect.andThen(
        Effect.sync(() => {
          if (id !== "you" && round === 1) {
            express(id, "LookingDown");
          }
        })
      )
    );

  const deal = (hole: readonly [string, string]) =>
    Effect.gen(function* dealHand() {
      for (const [index, card] of hole.entries()) {
        const place = hand.children.item(index);

        if (place !== null) {
          place.innerHTML = cardMarkup(card);
        }
      }

      scene.classList.add("playing");
      yield* Effect.all(
        [0, 1].flatMap((round) =>
          SEATS.map((id, index) => dealTo(id, round, index))
        ),
        { concurrency: "unbounded" }
      );
      hand.classList.add("dealt");
      deck.classList.add("gone");
      yield* pace.wait(700);

      for (const id of FRIEND_IDS) {
        express(id, "Resting");
      }
    });

  const turnUp = (cards: readonly string[]) =>
    Effect.suspend(() => {
      const from = slots.findIndex((slot) => !slot.classList.contains("full"));
      const gap = quiet() ? 0 : 170;

      const placed = cards.map((card, index) => {
        const slot = slots[from + index];

        if (slot !== undefined) {
          slot.innerHTML = cardMarkup(card);
          slot.classList.add("full");
          slot.style.setProperty("--flip-delay", `${index * gap}ms`);
        }

        return slot;
      });

      board.getBoundingClientRect();

      for (const slot of placed) {
        slot?.querySelector(".card")?.classList.add("up");
      }

      return pace.wait(420 + cards.length * gap);
    });

  const reveal = (id: FriendId, cards: readonly [string, string]) => {
    const shown = need(scene, `.shown[data-seat="${id}"]`);

    shown.innerHTML = cards.map(cardMarkup).join("");
    shown.getBoundingClientRect();

    for (const card of shown.querySelectorAll(".card")) {
      card.classList.add("up");
    }
  };

  const tab = (id: SeatId, words: string, paid = false) => {
    const label = need(seatOf(id), ".tab");

    label.textContent = words;
    label.classList.toggle("paid", paid);
    label.classList.toggle("on", words.length > 0);
  };

  const award = (id: SeatId, amount: number) =>
    Effect.gen(function* pushThePot() {
      const from = spotOf(potTab);
      const to = spotOf(seatOf(id));

      potTab.classList.remove("on");
      yield* Effect.all(
        Array.from({ length: CHIPS_IN_A_PUSH }, (_, index) =>
          fly({
            delay: index * 45,
            from: { x: from.x + (index - 3) * 5, y: from.y },
            kind: `fchip paper-chip chip-${index % 3}`,
            ms: 420,
            to,
          })
        ),
        { concurrency: "unbounded" }
      );
      model.pot = 0;
      stacks.set(id, (stacks.get(id) ?? 0) + amount);
      writeStack(id);
      tab(id, `+${chipsText(amount)}`);
      seatOf(id).classList.add("won");
    });

  const giveBack = (id: SeatId, amount: number) => {
    const left = (bets.get(id) ?? 0) - amount;

    bets.set(id, left);
    stacks.set(id, (stacks.get(id) ?? 0) + amount);
    need(pileOf(id), ".amt").textContent = chipsText(left);
    writeStack(id);
  };

  const pay = (from: FriendId, to: SeatId, amount: number) =>
    Effect.gen(function* payBounty() {
      const paid = Math.min(amount, stacks.get(from) ?? 0);

      if (paid === 0) {
        return 0;
      }

      stacks.set(from, (stacks.get(from) ?? 0) - paid);
      stacks.set(to, (stacks.get(to) ?? 0) + paid);
      tab(from, `Bounty −${chipsText(paid)}`, true);
      writeStack(from);
      yield* fly(chipFlight(spotOf(seatOf(from)), spotOf(seatOf(to)), 420));
      writeStack(to);

      return paid;
    });

  const reset = () => {
    for (const id of SEATS) {
      const seat = seatOf(id);

      stacks.set(id, STARTING_STACK);
      bets.delete(id);
      stopClock(id);
      seat.classList.remove("out", "won", "said");
      pileOf(id).classList.remove("on", "tagged");
      tab(id, "");
      act(id, "");
      writeStack(id);
      hush(id);
    }

    for (const id of FRIEND_IDS) {
      expressions.set(id, "Resting");
      paintFriend(id);
      need(scene, `.shown[data-seat="${id}"]`).innerHTML = "";
    }

    for (const slot of slots) {
      slot.innerHTML = "";
      slot.classList.remove("full");
    }

    model.pot = 0;
    model.expression = "Resting";
    paintMe(false);
    potTab.classList.remove("on");
    hand.classList.remove("dealt", "open", "peek", "armed", "thrown");
    deck.classList.remove("gone");
    scene.classList.remove("playing", "done");
    seal.classList.remove("on");
  };

  const lift = (cards: readonly string[]) => {
    for (const card of board.querySelectorAll<HTMLElement>(".card")) {
      const kept = cards.includes(card.dataset.card ?? "");

      card.classList.toggle("lifted", kept);
      card.classList.toggle("dimmed", !kept);
    }
  };

  const paintAll = () => {
    for (const id of FRIEND_IDS) {
      paintFriend(id);
    }

    paintMe(false);
  };

  const paintTalk = (root: ParentNode) => {
    for (const id of FRIEND_IDS) {
      for (const place of root.querySelectorAll(`[data-face="${id}"]`)) {
        place.innerHTML = faceOf(id, "Resting");
      }
    }
  };

  return {
    act,
    award,
    collect,
    deal,
    express,
    fold,
    giveBack,
    hand,
    hush,
    hushAll,
    lift,
    me,
    model,
    pace,
    paintAll,
    paintMe,
    paintTalk,
    pay,
    post,
    potOf: () => model.pot,
    reset,
    reveal,
    say,
    scene,
    seal,
    speak,
    startClock,
    stopClock,
    tab,
    think,
    turnUp,
  };
};

export type Stage = ReturnType<typeof openStage>;
