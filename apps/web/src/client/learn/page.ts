import { parseAvatar } from "@nostakes/avatar";
import type { Avatar, Theme } from "@nostakes/avatar";
import { Effect, Option } from "effect";

import { LEARNER_FACE } from "../../features/learn/cast.js";
import { stepAt } from "../../features/learn/counts.js";
import { factsOf } from "../../features/learn/facts.js";
import { SHARE } from "../../features/learn/guide.js";
import { LESSON } from "../../features/learn/hands.js";
import { handOf } from "../../features/learn/lesson.js";
import type { Gesture } from "../../features/learn/lesson.js";
import {
  arrival,
  back,
  begin,
  choose,
  here,
  jump,
  skip,
  tableAt,
  tableBefore,
} from "../../features/learn/walk.js";
import type { Walk } from "../../features/learn/walk.js";
import type { Keeper } from "../pictures/keeper.js";
import { openCoach } from "./coach.js";
import { openCounts } from "./counts.js";
import { openGestures } from "./gestures.js";
import { drawExamples, openRanks } from "./ranks.js";
import { openRecap } from "./recap.js";
import { openStage } from "./stage.js";
import type { View } from "./stage.js";
import { openTimeline } from "./timeline.js";

import "../tokens.css";
import "../reading.css";
import "./learn.css";

const THEME_KEY = "nostakes.theme";

const PROFILE_KEY = "nostakes.profile";

const root = globalThis.document.documentElement;

const darkSystem = globalThis.matchMedia("(prefers-color-scheme: dark)");

const stored = (key: string) => {
  try {
    return globalThis.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};

const chosenTheme = stored(THEME_KEY);

if (chosenTheme === "Dark" || chosenTheme === "Light") {
  root.dataset.theme = chosenTheme.toLowerCase();
}

const themeNow = (): Theme => {
  if (root.dataset.theme === "dark") {
    return "Dark";
  }

  return root.dataset.theme !== "light" && darkSystem.matches
    ? "Dark"
    : "Light";
};

const learnerFace = (): Avatar => {
  const code = /"avatar":"(?<code>h1[0-9a-z]{11})"/u.exec(stored(PROFILE_KEY))
    ?.groups?.code;

  return code === undefined
    ? LEARNER_FACE
    : Option.getOrElse(parseAvatar(code), () => LEARNER_FACE);
};

const viewOf = (walk: Walk): View | undefined => {
  const beat = here(LESSON, walk);

  return beat === undefined
    ? undefined
    : {
        arriving: arrival(LESSON, walk),
        beat,
        before: tableBefore(LESSON, walk),
        hand: handOf(LESSON, beat.hand),
        table: tableAt(LESSON, walk),
      };
};

const KEY_GESTURES = new Map<string, Gesture>([
  ["c", "Tap"],
  ["enter", "Tap"],
  ["f", "Flick"],
  ["r", "Drag"],
]);

const onStage = () => globalThis.scrollY < globalThis.innerHeight * 0.5;

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && target.closest("button, a, dialog") !== null;

interface Panels {
  coach: ReturnType<typeof openCoach> | undefined;
  recap: ReturnType<typeof openRecap> | undefined;
}

interface Session {
  keeper: Keeper | undefined;
  walk: Walk;
}

const startLesson = (lesson: HTMLElement) => {
  const still = globalThis.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  const session: Session = { keeper: undefined, walk: begin(LESSON) };
  const timeline = openTimeline();
  const counts = openCounts();

  const stage = openStage(lesson, timeline, {
    learner: learnerFace(),
    still,
    theme: themeNow(),
  });

  const ranks = openRanks(lesson);

  const keeping = Effect.promise(() => import("./keep.js")).pipe(
    Effect.map(({ lessonKeeper }) => {
      session.keeper ??= lessonKeeper(themeNow(), () => {
        lesson.dataset.kept = "ready";
      });

      return session.keeper;
    })
  );

  const panels: Panels = { coach: undefined, recap: undefined };

  const go = (walk: Walk, animated: boolean) => {
    const view = viewOf(walk);

    if (view === undefined) {
      return;
    }

    const step = stepAt(LESSON, walk.at);

    if (step !== undefined) {
      counts.reached(step, performance.now());
    }

    session.walk = walk;
    lesson.dataset.beat = view.beat.id;
    panels.coach?.show(
      view.beat,
      walk,
      factsOf(view.hand, view.table, view.beat)
    );

    if (animated) {
      stage.play(view);
    } else {
      stage.settle(view);
    }

    panels.recap?.shown(view.beat.kind === "Recap");

    if (view.beat.kind === "Recap") {
      Effect.runFork(keeping);
      panels.recap?.focus();
    }
  };

  const act = (gesture: Gesture) => {
    const beat = here(LESSON, session.walk);

    const index =
      beat?.choices.findIndex(
        (choice) =>
          choice.gesture === gesture ||
          (gesture === "Tap" && choice.gesture === "Next")
      ) ?? -1;

    if (index === -1) {
      panels.coach?.again();
    } else {
      go(choose(LESSON, session.walk, index), true);
    }
  };

  const say = (words: string) => {
    panels.recap?.say(words);
  };

  const send = () => {
    const url = new URL("/learn", globalThis.location.origin).href;

    if ("share" in globalThis.navigator) {
      Effect.runFork(
        Effect.tryPromise(() =>
          globalThis.navigator.share({ ...SHARE, url })
        ).pipe(Effect.ignore)
      );

      return;
    }

    Effect.runFork(
      Effect.tryPromise(() =>
        globalThis.navigator.clipboard.writeText(url)
      ).pipe(
        Effect.match({
          onFailure: () => {
            say(url);
          },
          onSuccess: () => {
            say("Link copied.");
          },
        })
      )
    );
  };

  panels.coach = openCoach(lesson, LESSON, {
    onBack: () => {
      go(back(session.walk), false);
    },
    onChoice: (index) => {
      go(choose(LESSON, session.walk, index), true);
    },
    onHand: (hand) => {
      go(jump(LESSON, session.walk, hand), false);
    },
    onSkip: () => {
      go(skip(LESSON, session.walk), true);
    },
  });

  panels.recap = openRecap(lesson, {
    onAgain: () => {
      go(begin(LESSON), false);
    },
    onKeep: () => {
      Effect.runFork(
        keeping.pipe(
          Effect.tap((keeper) =>
            Effect.sync(() => {
              keeper.keep("Chat");
            })
          )
        )
      );
    },
    onRanks: ranks.open,
    onSend: send,
  });

  const gestures = openGestures({
    asked: () => {
      const choices = here(LESSON, session.walk)?.choices ?? [];

      return {
        drag: choices.find((choice) => choice.gesture === "Drag")?.label ?? "",
        flick: choices.some((choice) => choice.gesture === "Flick"),
        peek: choices.some((choice) => choice.gesture === "Peek"),
      };
    },
    chip: stage.chip,
    hand: stage.hand,
    onGesture: act,
    onPeek: (looking) => {
      const beat = here(LESSON, session.walk);

      if (beat !== undefined) {
        stage.peek(looking, beat);
      }
    },
    scene: stage.scene,
  });

  globalThis.addEventListener("keydown", (event) => {
    if (!onStage() || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const key = event.key.toLowerCase();

    if (key === " " && !typing(event.target)) {
      event.preventDefault();
      gestures.peekByKey(true, event.timeStamp);

      return;
    }

    if (event.repeat || (key === "enter" && typing(event.target))) {
      return;
    }

    const gesture = KEY_GESTURES.get(key);

    if (gesture !== undefined) {
      act(gesture);
    } else if (key === "arrowleft") {
      go(back(session.walk), false);
    } else if (key === "arrowright") {
      go(skip(LESSON, session.walk), true);
    }
  });

  globalThis.addEventListener("keyup", (event) => {
    if (event.key === " ") {
      gestures.peekByKey(false, event.timeStamp);
    }
  });

  for (const opener of lesson.querySelectorAll<HTMLElement>("[data-ranks]")) {
    opener.hidden = false;
    opener.addEventListener("click", ranks.open);
  }

  darkSystem.addEventListener("change", () => {
    const view = viewOf(session.walk);

    if (view !== undefined) {
      stage.repaint(themeNow(), view);
    }
  });

  lesson.classList.toggle("still", still);
  go(session.walk, false);
};

const lessonRoot =
  globalThis.document.querySelector<HTMLElement>("[data-lesson]");

if (lessonRoot !== null) {
  startLesson(lessonRoot);
}

drawExamples(globalThis.document);
