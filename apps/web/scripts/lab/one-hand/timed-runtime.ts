const RELEASES = ["pointerup", "pointercancel", "pointerleave", "blur"];

const ON_SCREEN = 0.25;

const STEP_MARGIN_MS = 60;

const numbersIn = (text: string) =>
  text
    .split(",")
    .map(Number)
    .filter((value) => Number.isFinite(value));

const answering = (who: HTMLElement) => {
  const actor = who.querySelector<HTMLElement>(".actor");
  const look = actor?.dataset.poke ?? "";
  const drawn = who.querySelector(`[data-p="ex-${look}"] svg`)?.cloneNode(true);
  const hop = who.querySelector(".hop");

  if (
    hop !== null &&
    drawn !== undefined &&
    who.querySelector(".answer") === null
  ) {
    const answer = document.createElement("div");

    answer.className = "answer";
    answer.append(drawn);
    hop.append(answer);
  }
};

const pokeFaces = (reel: HTMLElement) => {
  for (const who of reel.querySelectorAll<HTMLElement>(".who")) {
    who.addEventListener("click", (event) => {
      event.stopPropagation();
      answering(who);
      who.classList.add("tapped");
    });
    who.addEventListener("animationend", (event) => {
      if (event.animationName === "hop" || event.animationName === "stay") {
        who.classList.remove("tapped");
      }
    });
  }
};

const LABELS = {
  Ended: "Play it again",
  Paused: "Play",
  Playing: "Pause",
};

const playFilm = (reel: HTMLElement, stage: HTMLElement) => {
  const length = Number(reel.dataset.length ?? "0");
  const beats = numbersIn(reel.dataset.beats ?? "");
  const button = reel.querySelector<HTMLElement>(".play");

  const film = reel
    .getAnimations({ subtree: true })
    .filter(
      (animation) => animation.effect?.getComputedTiming().duration === length
    );

  const now = {
    ended: false,
    holding: false,
    seen: false,
    shown: document.visibilityState === "visible",
    stepping: false,
    user: false,
  };

  const steps: Animation[] = [];
  const tick = document.createElement("i");

  tick.className = "tick";
  stage.append(tick);

  const sync = () => {
    const waiting = now.user && !now.stepping;

    reel.classList.toggle(
      "run",
      now.seen && now.shown && !now.holding && !waiting
    );
    reel.classList.toggle("paused", waiting && !now.ended);
    reel.classList.toggle("ended", now.ended);

    const label = now.ended ? LABELS.Ended : LABELS.Playing;

    button?.setAttribute("aria-label", waiting ? LABELS.Paused : label);
  };

  const seek = (ms: number) => {
    for (const animation of film) {
      animation.currentTime = ms;
    }
  };

  const settle = () => {
    steps.pop()?.cancel();
    now.stepping = false;
  };

  const playFrom = (ms: number) => {
    settle();
    seek(ms);
    reel.classList.remove("peeked");
    now.ended = false;
    now.user = false;
    sync();
  };

  const step = () => {
    const at = Number(film.at(0)?.currentTime ?? 0);
    const target = beats.find((beat) => beat > at + STEP_MARGIN_MS) ?? length;

    settle();
    now.stepping = true;

    const driver = tick.animate([{ opacity: 1 }, { opacity: 1 }], {
      duration: target - at,
    });

    steps.push(driver);
    driver.addEventListener("finish", () => {
      now.stepping = false;
      seek(target);
      sync();
    });
    sync();
  };

  const toggle = () => {
    if (now.ended) {
      playFrom(0);
    } else {
      settle();
      now.user = !now.user;
      sync();
    }
  };

  stage.addEventListener("click", () => {
    if (now.ended) {
      playFrom(0);
    } else if (now.user) {
      step();
    } else {
      now.user = true;
      sync();
    }
  });
  stage.addEventListener("animationend", (event) => {
    if (event.animationName === "clock") {
      settle();
      now.ended = true;
      sync();
    }
  });
  button?.addEventListener("click", toggle);

  for (const mark of reel.querySelectorAll<HTMLElement>(".seg")) {
    mark.addEventListener("click", () => {
      playFrom(Number(mark.dataset.at ?? "0"));
    });
  }

  const card = reel.querySelector<HTMLElement>(".peek");

  const look = () => {
    now.holding = true;
    reel.classList.add("peeking", "peeked");
    sync();
  };

  const release = () => {
    now.holding = false;
    reel.classList.remove("peeking");
    sync();
  };

  card?.addEventListener("pointerdown", look);
  card?.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  card?.addEventListener("keydown", (event) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      look();
    }
  });
  card?.addEventListener("keyup", release);
  card?.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  for (const name of RELEASES) {
    card?.addEventListener(name, release);
  }

  const asked = new URLSearchParams(globalThis.location.search).get("at");

  if (asked !== null) {
    now.user = true;
    seek(Number(asked));
  }

  document.addEventListener("visibilitychange", () => {
    now.shown = document.visibilityState === "visible";
    sync();
  });
  new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        now.seen = entry.intersectionRatio >= ON_SCREEN;
      }

      sync();
    },
    { threshold: [0, ON_SCREEN] }
  ).observe(stage);
};

const start = () => {
  const reel = document.querySelector<HTMLElement>("#reel");
  const stage = document.querySelector<HTMLElement>("#stage");

  if (reel === null || stage === null) {
    return;
  }

  pokeFaces(reel);

  if (!globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    reel.classList.add("live");
    playFilm(reel, stage);
  }
};

start();
