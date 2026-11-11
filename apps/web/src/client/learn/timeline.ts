export interface Cue {
  readonly at: number;
  readonly run: () => void;
}

export const openTimeline = () => {
  const waiting: Cue[] = [];
  const clock = { started: -1, ticking: false };

  const tick = (now: number) => {
    if (clock.started < 0) {
      clock.started = now;
    }

    while ((waiting[0]?.at ?? Infinity) <= now - clock.started) {
      waiting.shift()?.run();
    }

    if (waiting.length > 0) {
      requestAnimationFrame(tick);
    } else {
      clock.ticking = false;
    }
  };

  const finish = () => {
    for (const cue of waiting.splice(0)) {
      cue.run();
    }
  };

  return {
    busy: () => waiting.length > 0,
    finish,
    run: (cues: readonly Cue[]) => {
      finish();
      waiting.push(...cues.toSorted((one, other) => one.at - other.at));
      clock.started = -1;

      if (!clock.ticking && waiting.length > 0) {
        clock.ticking = true;
        requestAnimationFrame(tick);
      }
    },
  };
};

export type Timeline = ReturnType<typeof openTimeline>;
