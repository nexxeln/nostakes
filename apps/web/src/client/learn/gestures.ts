import type { Gesture } from "../../features/learn/lesson.js";
import { el } from "./dom.js";

const DRAG_STARTS = 12;

const COMMITS_FROM = 0.5;

const FOLD_ARMS = 48;

const PEEK_COUNTS_MS = 140;

export interface Asked {
  readonly drag: string;
  readonly flick: boolean;
  readonly peek: boolean;
}

export interface Hands {
  readonly asked: () => Asked;
  readonly chip: HTMLElement;
  readonly hand: HTMLElement;
  readonly onGesture: (gesture: Gesture) => void;
  readonly onMiss: () => void;
  readonly onPeek: (looking: boolean) => void;
  readonly scene: HTMLElement;
}

const railEl = () => {
  const rail = el("div", "rail");
  const track = el("div", "track");
  const fill = el("div", "fill");
  const held = el("div", "held");
  const target = el("div", "det hit");
  const tag = el("span", "tag");
  const readout = el("div", "readout");
  const value = el("div", "v");
  const note = el("div", "note", "Let go at the top to bet.");

  track.append(fill);
  target.append(tag);
  readout.append(value, note);
  rail.append(el("div", "wash"), track, target, held, readout);

  return { fill, held, note, rail, tag, target, value };
};

export const openGestures = ({
  asked,
  chip,
  hand,
  onGesture,
  onMiss,
  onPeek,
  scene,
}: Hands) => {
  const { fill, held, note, rail, tag, target, value } = railEl();

  const live = {
    armed: false,
    dragged: false,
    from: 0,
    length: 1,
    peekedAt: 0,
    peeking: false,
    pulledFrom: 0,
    railed: false,
    reach: 0,
  };

  scene.append(rail);

  const openRail = () => {
    const words = asked().drag;

    if (words.length === 0) {
      return false;
    }

    const box = chip.getBoundingClientRect();
    const around = scene.getBoundingClientRect();
    const bottom = box.top - around.top - 14;

    live.length = Math.max(80, Math.min(around.height * 0.34, bottom - 96));
    rail.style.setProperty("--rail-top", `${bottom - live.length}px`);
    rail.style.setProperty("--rail-length", `${live.length}px`);
    target.style.top = `${bottom - live.length}px`;
    tag.textContent = words;
    value.textContent = words;
    rail.classList.add("on");

    return true;
  };

  const showReach = (reach: number) => {
    held.style.transform = `translateY(${-reach * live.length}px)`;
    fill.style.setProperty("--reach", reach.toFixed(3));
    note.textContent =
      reach >= COMMITS_FROM ? "Let go." : "Keep going, then let go.";
  };

  const closeRail = () => {
    rail.classList.remove("on");
    held.style.transform = "";
  };

  const peek = (looking: boolean, at: number) => {
    if (live.peeking === looking) {
      return;
    }

    live.peeking = looking;

    if (looking) {
      live.peekedAt = at;
    }

    onPeek(looking);

    if (!looking && asked().peek) {
      if (at - live.peekedAt >= PEEK_COUNTS_MS) {
        onGesture("Peek");
      } else {
        onMiss();
      }
    }
  };

  chip.addEventListener("pointerdown", (event) => {
    live.from = event.clientY;
    live.railed = false;
    live.dragged = false;
    live.reach = 0;
    chip.setPointerCapture(event.pointerId);
  });

  chip.addEventListener("pointermove", (event) => {
    if (!chip.hasPointerCapture(event.pointerId)) {
      return;
    }

    const pulled = live.from - event.clientY;

    if (!live.railed && pulled > DRAG_STARTS) {
      live.railed = openRail();
      live.dragged = true;
    }

    if (live.railed) {
      live.reach = Math.min(
        1,
        Math.max(0, (pulled - DRAG_STARTS) / live.length)
      );
      showReach(live.reach);
    }
  });

  const endDrag = (event: PointerEvent) => {
    if (chip.hasPointerCapture(event.pointerId)) {
      chip.releasePointerCapture(event.pointerId);
    }

    if (live.railed) {
      live.railed = false;
      closeRail();

      if (event.type === "pointerup" && live.reach >= COMMITS_FROM) {
        onGesture("Drag");
      }
    }
  };

  chip.addEventListener("pointerup", endDrag);
  chip.addEventListener("pointercancel", endDrag);
  chip.addEventListener("click", () => {
    if (live.dragged) {
      live.dragged = false;
    } else {
      onGesture("Tap");
    }
  });

  hand.addEventListener("pointerdown", (event) => {
    live.pulledFrom = event.clientY;
    live.armed = false;
    hand.setPointerCapture(event.pointerId);
    peek(true, event.timeStamp);
  });

  hand.addEventListener("pointermove", (event) => {
    if (!hand.hasPointerCapture(event.pointerId)) {
      return;
    }

    const armed = asked().flick && live.pulledFrom - event.clientY > FOLD_ARMS;

    if (armed !== live.armed) {
      live.armed = armed;
      hand.classList.toggle("armed", armed);
    }
  });

  const endPull = (event: PointerEvent) => {
    if (hand.hasPointerCapture(event.pointerId)) {
      hand.releasePointerCapture(event.pointerId);
    }

    const folding = live.armed && event.type === "pointerup";

    live.armed = false;
    hand.classList.remove("armed");

    if (folding) {
      live.peeking = false;
      onPeek(false);
      onGesture("Flick");
    } else {
      peek(false, event.timeStamp);
    }
  };

  hand.addEventListener("pointerup", endPull);
  hand.addEventListener("pointercancel", endPull);

  return {
    peekByKey: (looking: boolean, at: number) => {
      peek(looking, at);
    },
  };
};
