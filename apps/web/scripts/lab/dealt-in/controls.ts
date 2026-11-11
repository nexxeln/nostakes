import type { Expression } from "@nostakes/avatar";
import { Effect } from "effect";

import { chipsText } from "./markup.js";
import { need } from "./stage.js";
import type { Stage } from "./stage.js";

export type Choice =
  | { readonly kind: "call" }
  | { readonly kind: "fold" }
  | { readonly kind: "raise"; readonly to: number };

export interface Ask {
  readonly auto: Choice;
  readonly foldable: boolean;
  readonly ms: number;
  readonly pot: number;
  readonly raise: { readonly max: number; readonly min: number } | undefined;
  readonly toCall: number;
}

const DRAG_STARTS = 12;

const FOLD_ARMS = 52;

const CANCEL_BELOW = 0.07;

const SNAP_WITHIN = 0.045;

const GHOST_MS = 1100;

const HOLD_OFF_MS = 1600;

const PRESS_MS = 220;

interface Detent {
  readonly amount: number;
  readonly name: string;
  readonly reach: number;
}

type Words = readonly [string, string];

const FOLD_WORDS: Words = ["Let go to fold", ""];

interface Live {
  answer: ((choice: Choice) => void) | undefined;
  armed: boolean;
  ask: Ask | undefined;
  before: Expression;
  busy: boolean;
  detents: readonly Detent[];
  dragFrom: number;
  dragged: boolean;
  everPeeked: boolean;
  holding: boolean;
  length: number;
  named: Words;
  peeking: boolean;
  primary: (() => void) | undefined;
  pullFrom: number;
  railed: boolean;
  reach: number;
  shown: number;
  told: Words;
}

const onStage = () => globalThis.scrollY < globalThis.innerHeight * 0.5;

const frame = Effect.callback<number>((resume) => {
  const asked = requestAnimationFrame((now) => {
    resume(Effect.succeed(now));
  });

  return Effect.sync(() => {
    cancelAnimationFrame(asked);
  });
});

export const openControls = (
  stage: Stage,
  onPeek: (looking: boolean) => void
) => {
  const { hand, pace, scene } = stage;
  const chip = need(scene, ".chipctl");
  const chipTop = need(chip, ".a");
  const chipBottom = need(chip, ".b");
  const rail = need(scene, ".rail");
  const held = need(rail, ".held");
  const fill = need(rail, ".fill");
  const dets = need(rail, ".dets");
  const readoutKind = need(rail, ".readout .k");
  const readoutValue = need(rail, ".readout .v");
  const hint = need(scene, ".hint");
  const hintSay = need(hint, ".say");
  const hintFoot = need(hint, ".foot");

  const live: Live = {
    answer: undefined,
    armed: false,
    ask: undefined,
    before: "Resting",
    busy: false,
    detents: [],
    dragFrom: 0,
    dragged: false,
    everPeeked: false,
    holding: false,
    length: 0,
    named: ["", ""],
    peeking: false,
    primary: undefined,
    pullFrom: 0,
    railed: false,
    reach: 0,
    shown: -1,
    told: ["", ""],
  };

  const label = (top: string, bottom: string) => {
    chipTop.textContent = top;
    chipBottom.textContent = bottom;
  };

  const write = (say: string, foot: string) => {
    hintSay.textContent = say;
    hintFoot.textContent = foot;
    hint.classList.toggle("on", say.length > 0);
  };

  const tell = (say: string, foot = "") => {
    live.told = [say, foot];

    if (!live.peeking) {
      write(say, foot);
    }
  };

  const idle = () => {
    chip.classList.add("idle");
    chip.classList.remove("live", "nudge");
    label("", "");
  };

  const peek = (looking: boolean) => {
    if (live.peeking === looking || !hand.classList.contains("dealt")) {
      return;
    }

    live.peeking = looking;
    hand.classList.toggle("peek", looking);
    hand.classList.remove("beckon");

    if (looking) {
      live.before = stage.model.expression;
      stage.express("you", "LookingDown");
      write(...live.named);
    } else {
      write(...live.told);

      if (stage.model.expression === "LookingDown") {
        stage.express("you", live.before);
      }
    }

    onPeek(looking);
  };

  const settle = (choice: Choice) => {
    const { answer } = live;

    if (answer !== undefined) {
      live.answer = undefined;
      live.ask = undefined;
      idle();
      tell("");
      answer(choice);
    }
  };

  const amountAt = (reach: number) => {
    const range = live.ask?.raise;

    if (range === undefined) {
      return 0;
    }

    const near = live.detents.find(
      (detent) => Math.abs(detent.reach - reach) < SNAP_WITHIN
    );

    return (
      near?.amount ??
      Math.round((range.min + (range.max - range.min) * reach) / 10) * 10
    );
  };

  const showReach = (reach: number) => {
    const amount = amountAt(reach);

    held.style.transform = `translateY(${-reach * live.length}px)`;
    fill.style.setProperty("--reach", reach.toFixed(3));

    if (amount !== live.shown) {
      live.shown = amount;
      readoutKind.textContent =
        amount === live.ask?.raise?.max ? "All in" : "Raise to";
      readoutValue.textContent = chipsText(amount);

      for (const [index, detent] of live.detents.entries()) {
        dets.children
          .item(index)
          ?.classList.toggle("hit", detent.amount === amount);
      }
    }
  };

  const openRail = () => {
    const range = live.ask?.raise;

    if (range === undefined) {
      return false;
    }

    const box = chip.getBoundingClientRect();
    const around = scene.getBoundingClientRect();
    const bottom = box.top - around.top - 14;
    const length = Math.min(around.height * 0.44, bottom - 96);
    const span = range.max - range.min;
    const potRaise = Math.min(range.max, live.ask?.pot ?? range.min);

    live.length = length;
    live.shown = -1;
    live.detents = [
      { amount: range.min, name: "Min", reach: 0.1 },
      {
        amount: potRaise,
        name: "Pot",
        reach: Math.max(0.3, Math.min(0.75, (potRaise - range.min) / span)),
      },
      { amount: range.max, name: "All in", reach: 1 },
    ];
    rail.style.setProperty("--rail-top", `${bottom - length}px`);
    rail.style.setProperty("--rail-length", `${length}px`);
    dets.innerHTML = live.detents
      .map(
        (detent) =>
          `<div class="det" style="top:${bottom - detent.reach * length}px"><span class="tag">${detent.name} <b>${chipsText(detent.amount)}</b></span></div>`
      )
      .join("");
    rail.classList.add("on");
    showReach(0);

    return true;
  };

  const closeRail = () => {
    rail.classList.remove("on");
    held.style.transform = "";
  };

  const releaseAt = (reach: number) => {
    closeRail();

    if (reach >= CANCEL_BELOW) {
      settle({ kind: "raise", to: amountAt(reach) });
    }
  };

  const climb = (reach: number, started: number): Effect.Effect<void> =>
    frame.pipe(
      Effect.flatMap((now) => {
        const done = Math.min(1, (now - started) / GHOST_MS);

        showReach(reach * (1 - (1 - done) ** 3));

        return done < 1 ? climb(reach, started) : Effect.void;
      })
    );

  const ghostRaise = (to: number) =>
    Effect.gen(function* raiseByItself() {
      if (pace.still() || !openRail()) {
        return;
      }

      const reach =
        live.detents.find((detent) => detent.amount === to)?.reach ?? 1;

      live.busy = true;
      yield* frame.pipe(Effect.flatMap((started) => climb(reach, started)));
      yield* pace.wait(420);
      live.busy = false;
      closeRail();
    });

  const whenHandsAreFree: Effect.Effect<void> = Effect.suspend(() =>
    live.peeking || live.holding || live.busy
      ? pace.wait(HOLD_OFF_MS).pipe(Effect.andThen(whenHandsAreFree))
      : Effect.void
  );

  const pressByItself = Effect.gen(function* pressChip() {
    chip.classList.add("pressed");
    yield* pace.wait(PRESS_MS);
    chip.classList.remove("pressed");
  });

  const playedForYou = (ask: Ask) =>
    Effect.gen(function* playForYou() {
      yield* pace.wait(ask.ms);
      yield* whenHandsAreFree;
      yield* ask.auto.kind === "raise"
        ? ghostRaise(ask.auto.to)
        : pressByItself;

      return ask.auto;
    });

  const chosen = (ask: Ask) =>
    Effect.callback<Choice>((resume) => {
      live.ask = ask;
      live.answer = (choice) => {
        resume(Effect.succeed(choice));
      };

      chip.classList.remove("idle", "gone");
      chip.classList.add("live");
      label("Call", chipsText(ask.toCall));
      stage.startClock("you", ask.ms);
    });

  const offer = (ask: Ask) =>
    Effect.raceFirst(chosen(ask), playedForYou(ask)).pipe(
      Effect.tap((choice) =>
        Effect.sync(() => {
          settle(choice);
          live.answer = undefined;
          live.ask = undefined;
          idle();
          tell("");
          stage.stopClock("you");
        })
      )
    );

  const tapped = (top: string, bottom: string) =>
    Effect.callback<"Tapped">((resume) => {
      chip.classList.remove("idle", "gone");
      label(top, bottom);
      live.primary = () => {
        resume(Effect.succeed("Tapped"));
      };
    }).pipe(Effect.asVoid);

  const press = () => {
    const { primary } = live;

    if (live.ask !== undefined) {
      settle({ kind: "call" });
    } else if (primary !== undefined) {
      live.primary = undefined;
      primary();
    }
  };

  chip.addEventListener("pointerdown", (event) => {
    if (!live.busy) {
      live.dragFrom = event.clientY;
      live.railed = false;
      live.reach = 0;
      live.dragged = false;
      live.holding = true;
      chip.setPointerCapture(event.pointerId);
    }
  });

  chip.addEventListener("pointermove", (event) => {
    if (!chip.hasPointerCapture(event.pointerId) || live.busy) {
      return;
    }

    const pulled = live.dragFrom - event.clientY;

    if (!live.railed && pulled > DRAG_STARTS) {
      live.railed = openRail();
      live.dragged = live.railed;
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
    live.holding = false;

    if (chip.hasPointerCapture(event.pointerId)) {
      chip.releasePointerCapture(event.pointerId);
    }

    if (live.railed) {
      live.railed = false;
      releaseAt(event.type === "pointercancel" ? 0 : live.reach);
    }
  };

  chip.addEventListener("pointerup", endDrag);
  chip.addEventListener("pointercancel", endDrag);
  chip.addEventListener("click", () => {
    if (live.dragged) {
      live.dragged = false;
    } else if (!live.busy) {
      press();
    }
  });

  hand.addEventListener("pointerdown", (event) => {
    live.pullFrom = event.clientY;
    live.armed = false;
    live.everPeeked = true;
    hand.setPointerCapture(event.pointerId);
    peek(true);
  });

  hand.addEventListener("pointermove", (event) => {
    if (!hand.hasPointerCapture(event.pointerId)) {
      return;
    }

    const armed =
      live.ask?.foldable === true && live.pullFrom - event.clientY > FOLD_ARMS;

    if (armed !== live.armed) {
      live.armed = armed;
      hand.classList.toggle("armed", armed);
      write(...(armed ? FOLD_WORDS : live.named));
    }
  });

  const endPull = (event: PointerEvent) => {
    if (hand.hasPointerCapture(event.pointerId)) {
      hand.releasePointerCapture(event.pointerId);
    }

    peek(false);

    if (live.armed) {
      live.armed = false;
      hand.classList.remove("armed");

      if (event.type === "pointerup") {
        settle({ kind: "fold" });
      }
    }
  };

  hand.addEventListener("pointerup", endPull);
  hand.addEventListener("pointercancel", endPull);

  const raiseByKey = () => {
    const { ask } = live;
    const range = ask?.raise;

    if (range !== undefined && !live.busy) {
      Effect.runFork(
        ghostRaise(range.max).pipe(
          Effect.andThen(
            Effect.sync(() => {
              if (live.ask === ask) {
                settle({ kind: "raise", to: range.max });
              }
            })
          )
        )
      );
    }
  };

  const keyChoices = new Map<string, () => void>([
    [
      "c",
      () => {
        settle({ kind: "call" });
      },
    ],
    [
      "f",
      () => {
        if (live.ask?.foldable === true) {
          settle({ kind: "fold" });
        }
      },
    ],
    ["r", raiseByKey],
  ]);

  globalThis.addEventListener("keydown", (event) => {
    if (!onStage() || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (event.key === " " && document.activeElement !== chip) {
      event.preventDefault();

      if (!event.repeat) {
        live.everPeeked = true;
        peek(true);
      }

      return;
    }

    if (!event.repeat) {
      keyChoices.get(event.key.toLowerCase())?.();
    }
  });

  globalThis.addEventListener("keyup", (event) => {
    if (event.key === " ") {
      peek(false);
    }
  });

  const showPeek = Effect.gen(function* peekByItself() {
    if (live.everPeeked) {
      return;
    }

    peek(true);
    yield* pace.wait(1500);

    if (!live.everPeeked) {
      peek(false);
    }
  });

  const holding = (say: string, foot: string) => {
    live.named = [say, foot];
  };

  return {
    chip,
    holding,
    idle,
    label,
    offer,
    peek,
    showPeek,
    tapped,
    tell,
  };
};

export type Controls = ReturnType<typeof openControls>;
