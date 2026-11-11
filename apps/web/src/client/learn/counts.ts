import { stepReport, tookReport } from "../../features/learn/counts.js";
import type { GuideStep } from "../../features/learn/counts.js";
import { countingOn } from "../counting.js";

const REPORTS_PATH = "/rooms/reports";

const send = (report: string) => {
  globalThis.navigator.sendBeacon(
    REPORTS_PATH,
    new Blob([report], { type: "application/json" })
  );
};

const counting = () => {
  try {
    return countingOn();
  } catch {
    return false;
  }
};

export const openCounts = () => {
  const sent = new Set<GuideStep>();
  const run = { startedAt: -1 };

  return {
    reached: (step: GuideStep, now: number) => {
      if (sent.has(step) || !counting()) {
        return;
      }

      sent.add(step);
      send(stepReport(step));

      if (step === "Started") {
        run.startedAt = now;
      }

      if (step === "Finished" && run.startedAt >= 0) {
        send(tookReport(now - run.startedAt));
      }
    },
  };
};
