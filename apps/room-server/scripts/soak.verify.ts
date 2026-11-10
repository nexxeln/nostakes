import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import { NodeFileSystem } from "@effect/platform-node";
import {
  Config,
  Console,
  Duration,
  Effect,
  Fiber,
  FileSystem,
  Option,
  Result,
  Schema,
} from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

import type { Temper } from "../test/fixtures/bot.js";
import type { ClientTemper } from "../test/fixtures/client-bot.js";
import type { Moment } from "../test/fixtures/client-wire.js";
import {
  addFairness,
  emptyFairness,
  FAIRNESS_COUNT_NAMES,
  proofRecord,
} from "../test/fixtures/fair-checks.js";
import type { FairnessCountName, Proof } from "../test/fixtures/fair-checks.js";
import {
  COUNT_NAMES,
  DEAF_REPLY_BOUND_MS,
  emptyCounts,
} from "../test/fixtures/night-checks.js";
import type { CountName } from "../test/fixtures/night-checks.js";
import {
  judgeNight,
  openNight,
  planNight,
  playNight,
} from "../test/fixtures/night.js";
import type {
  NightPlan,
  NightResult,
  OpenedNight,
  TableRules,
} from "../test/fixtures/night.js";
import { wallClock } from "../test/fixtures/poker-socket.js";
import { PokerStack } from "../test/fixtures/poker-stack.js";
import { inspect, refusedAlarms } from "../test/fixtures/stack.js";

const { afterAll, beforeAll, deploy, destroy, test } = Test.make({
  dev: true,
  providers: Cloudflare.providers(),
  sidecar: false,
  stage: `room_soak_${process.pid}`,
});

const deployed = beforeAll(deploy(PokerStack));

afterAll(destroy(PokerStack));

const ROOMS_AT_ONCE = 4;

const BUDGET_MINUTES = 95;

const VITEST_LIMIT_MS = (BUDGET_MINUTES + 15) * 60_000;

const soakConfig = Config.all({
  budgetMinutes: Config.Int("SOAK_BUDGET_MINUTES").pipe(
    Config.withDefault(BUDGET_MINUTES)
  ),
  hands: Config.Int("SOAK_HANDS").pipe(Config.withDefault(1000)),
  keepLogs: Config.Boolean("SOAK_KEEP_LOGS").pipe(Config.withDefault(false)),
  rooms: Config.Int("SOAK_ROOMS").pipe(Config.withDefault(12)),
  roomsAtOnce: Config.Int("SOAK_CONCURRENCY").pipe(
    Config.withDefault(ROOMS_AT_ONCE)
  ),
  seed: Config.Int("SOAK_SEED").pipe(Config.withDefault(20_261_110)),
});

const TEMPER: Temper = {
  churnPercent: 5,
  dropPercent: 0.6,
  duplicatePercent: 6,
  illegalPercent: 2,
  mustTableMuckPercent: 90,
  secondDevicePercent: 0.8,
  shovePercent: 0,
  showdownSilencePercent: 15,
  silencePercent: 0.4,
  thinkMs: 30,
  voteSilencePercent: 8,
};

const CHAOS: ClientTemper = {
  blackHolePercent: 0.3,
  deafAtClosePercent: 40,
  deafPercent: 0.1,
  dropPercent: 0.6,
  echoPercent: 0.5,
  issueBeforeDropPercent: 60,
  napPercent: 0.2,
  waitOutSilencePercent: 25,
  wakePercent: 0.5,
};

const HAND_BUDGET_MS = 12_000;

const UNCLOCKED_VOTE_SILENCE_PERCENT = 60;

const UNCLOCKED_SHOVE_PERCENT = 15;

const UNCLOCKED_TABLE: TableRules = { maxRuns: 3, runCount: "Vote" };

const temperFor = (turnSeconds: number): Temper =>
  turnSeconds === 0
    ? {
        ...TEMPER,
        shovePercent: UNCLOCKED_SHOVE_PERCENT,
        voteSilencePercent: UNCLOCKED_VOTE_SILENCE_PERCENT,
      }
    : TEMPER;

const tableRulesFor = (turnSeconds: number): TableRules =>
  turnSeconds === 0 ? UNCLOCKED_TABLE : {};

const CHECKED_ROOMS_IN_TEN = 7;

const CHECKED_SPREAD = 3;

const LOOP_PROBE_MS = 100;

const STALL_REPORT_MS = 500;

interface Stall {
  readonly at: number;
  readonly ms: number;
}

interface Window {
  readonly from: number;
  readonly to: number;
}

interface Probe {
  readonly stalls: Stall[];
  peakHeapBytes: number;
}

type JudgedNight = Omit<NightResult, "events">;

const MEGABYTE = 1024 * 1024;

const watchEventLoop = (probe: Probe) =>
  Effect.gen(function* probeEventLoop() {
    let last = wallClock();

    const step = Effect.sleep(Duration.millis(LOOP_PROBE_MS)).pipe(
      Effect.andThen(
        Effect.sync(() => {
          const now = wallClock();
          const late = now - last - LOOP_PROBE_MS;

          if (late > STALL_REPORT_MS) {
            probe.stalls.push({ at: now - late, ms: late });
          }

          probe.peakHeapBytes = Math.max(
            probe.peakHeapBytes,
            process.memoryUsage().heapUsed
          );
          last = now;
        })
      )
    );

    return yield* Effect.forever(step);
  });

const describeStalls = (
  started: number,
  windows: readonly Window[],
  probe: Probe,
  results: readonly JudgedNight[]
) => {
  const at = (when: number) => `+${((when - started) / 1000).toFixed(1)} s`;

  const whilePlaying = probe.stalls.filter((stall) =>
    windows.some(({ from, to }) => stall.at >= from && stall.at < to)
  );

  const longest = Math.max(0, ...whilePlaying.map(({ ms }) => ms));

  return [
    `  event loop stalls over ${STALL_REPORT_MS} ms while rooms were playing: ${whilePlaying.length}, longest ${longest.toFixed(0)} ms${whilePlaying.length === 0 ? "" : `: ${whilePlaying.map((stall) => `${at(stall.at)} ${stall.ms.toFixed(0)} ms`).join(", ")}`}; waves played ${windows.map(({ from, to }) => `${at(from)} to ${at(to)}`).join(", ")}`,
    `  peak heap ${(probe.peakHeapBytes / MEGABYTE).toFixed(0)} MB`,
    `  checks after each night: ${results
      .toSorted((left, right) => left.checkedAt - right.checkedAt)
      .map(
        (result) =>
          `${result.plan.code} ${at(result.checkedAt)} ${result.checkMs.toFixed(0)} ms`
      )
      .join(", ")}`,
  ];
};

const FAIRNESS_EXPECTED: readonly FairnessCountName[] = [
  "handsJudged",
  "checkedInTime",
  "plainHands",
];

const INFORMATIONAL: ReadonlySet<CountName> = new Set([
  "catchUpsSkipped",
  "quietPauses",
  "quietResumes",
  "tablesUnattended",
  "clientDropsDeafSilence",
  "clientDropsSilenceLimit",
  "clientDropsUnansweredOnClearLine",
  "clientDropsUnexplained",
  "clientFailedAttempts",
  "clientSignalsKeptOnDevice",
  "clientUnexpectedRefusals",
  "replyTimeouts",
]);

export class SoakFailed extends Schema.TaggedError<
  SoakFailed,
  { readonly brand: unique symbol }
>()("SoakFailed", { seed: Schema.Int, summary: Schema.String }) {
  override get message() {
    return `The soak with seed ${this.seed} failed: ${this.summary}. Rerun with SOAK_SEED=${this.seed}; each failed room's stored log is saved at the path printed above.`;
  }
}

const describePlan = (plan: NightPlan) =>
  `${plan.code} seed ${plan.seed}: ${plan.players + plan.lateJoiners} players and ${plan.spectators} spectators, ${plan.hands} hands, turn ${plan.settings.turnSeconds}s, bank ${plan.settings.timeBankSeconds}s, runs ${plan.settings.table.maxRuns} ${plan.settings.table.runCount === "Vote" ? "by vote" : "fixed"}, client bots ${plan.clients.join(",") || "none"}, rules ${plan.ruleChanges.map((rule) => `${rule.label} at ${rule.atHand}`).join("; ")}`;

const sumCounts = (results: readonly JudgedNight[]) => {
  const total = emptyCounts();

  for (const result of results) {
    for (const name of COUNT_NAMES) {
      total[name] += result.verdict.counts[name];
    }
  }

  return total;
};

const summarize = (
  seed: number,
  rooms: number,
  elapsed: number,
  results: readonly JudgedNight[],
  failures: readonly string[]
) => {
  const counts = sumCounts(results);

  const [longest] = results.toSorted(
    (left, right) => right.verdict.counts.events - left.verdict.counts.events
  );

  const views = results.reduce(
    (total, result) => total + result.verdict.views,
    0
  );

  const viewMs = results.reduce(
    (total, result) => total + result.verdict.viewMs,
    0
  );

  const deafReplies = results.flatMap(({ verdict }) => verdict.deafReplyMs);

  const slowestDeafReply = Math.max(0, ...deafReplies);

  const fairness = emptyFairness();

  for (const result of results) {
    addFairness(fairness, result.verdict.fairness);
  }

  const gaps = [
    ...COUNT_NAMES.filter(
      (name) => counts[name] === 0 && !INFORMATIONAL.has(name)
    ),
    ...FAIRNESS_EXPECTED.filter((name) => fairness[name] === 0),
  ];

  const lines = [
    `soak seed ${seed} summary`,
    `  rooms ${results.length} of ${rooms}, hands ${counts.hands}, events ${counts.events}, wall ${elapsed.toFixed(1)} s, hands per second ${(counts.hands / elapsed).toFixed(2)}`,
    `  commands ${counts.commands}, rejected ${counts.rejected}, illegal sent ${counts.illegal}, protocol violations ${counts.protocolViolations}`,
    `  reconnects ${counts.reconnects}, socket drops ${counts.drops}, second devices ${counts.secondDevices}, catch-ups ${counts.catchUps}, catch-ups past the window ${counts.catchUpsSkipped}`,
    `  restarts ${counts.restarts} mid-hand and ${counts.voteRestarts} mid-vote, resent after a drop ${counts.resent}`,
    `  tables left with no seated player connected ${counts.tablesUnattended}, games paused while nobody was there ${counts.quietPauses}, resumed when someone came back ${counts.quietResumes}`,
    `  silences ${counts.silences}, time banks started ${counts.bankStarts}, timeouts ${counts.timeouts}, welcome clock checks ${counts.welcomeClockChecks}`,
    `  duplicates sent ${counts.duplicates}, duplicates with matching replies ${counts.duplicatesConfirmed}, reply timeouts ${counts.replyTimeouts}`,
    `  hands by ante: none ${counts.noAnteHands}, every player ${counts.everyPlayerAnteHands}, big blind ${counts.bigBlindAnteHands}; antes posted ${counts.antePosts}`,
    `  straddles ${counts.straddles}, multi-run hands ${counts.multiRunHands}, run choices ${counts.runChoices}, run votes past their deadline without a turn clock ${counts.unclockedVotesTimedOut}, rabbit hunts ${counts.rabbitHunts}, shows ${counts.shows}`,
    `  showdowns: tabled ${counts.showdownTables}, mucked ${counts.showdownMucks}, chosen at or after the clock's deadline ${counts.lateShowdownChoices}, won without showing ${counts.unshownWinners}, winning hands refused a muck ${counts.illegalMucks}`,
    `  hands with approval ${counts.handsWithApproval} and without ${counts.handsWithoutApproval}, approvals ${counts.approvals}, denials ${counts.denials}`,
    `  settings changed ${counts.settingsChanged}, rules queued ${counts.rulesQueued}, closes queued in a hand ${counts.closeQueued}`,
    `  frames checked ${counts.framesChecked}, views checked ${counts.viewsChecked}, viewFor ${views > 0 ? ((viewMs * 1000) / views).toFixed(1) : "n/a"} µs each over ${views}`,
    `  client bots ${counts.clientBots}: commands ${counts.clientCommands}, traced to the log ${counts.clientCommandsTraced}, issued right before a drop ${counts.clientIssuedBeforeDrop}, resent after a drop ${counts.clientResent}`,
    `  client drops: bot close ${counts.clientDropsBotClose}, server restart ${counts.clientDropsRestart}, unanswered on a deaf line ${counts.clientDropsDeafUnanswered}, black hole ${counts.clientDropsBlackHole}; server silence limit ${counts.clientDropsSilenceLimit}, deaf and silent ${counts.clientDropsDeafSilence}, unanswered on a clear line ${counts.clientDropsUnansweredOnClearLine}, unexplained ${counts.clientDropsUnexplained}, failed reconnects ${counts.clientFailedAttempts}`,
    `  commands issued on a deaf line ${counts.clientDeafCommands}, answered ${deafReplies.length}, slowest reply ${slowestDeafReply.toFixed(0)} ms (bound ${DEAF_REPLY_BOUND_MS} ms), lines deafened as the room closed ${counts.clientDeafAtClose}`,
    `  signals: sent by socket bots ${counts.signalsSent}, of them peeks without cards ${counts.peeksWithoutCards}; sent by client bots ${counts.clientSignalsSent}, kept on the device ${counts.clientSignalsKeptOnDevice}, heard by client bots ${counts.clientSignalsHeard}; relayed to socket bots ${counts.signalDeliveries} (peeks ${counts.peekDeliveries}, reactions ${counts.reactionDeliveries}), each checked against the room's rule at its place in the log`,
    `  client wakes ${counts.clientWakes}, naps ${counts.clientNaps}, skipped ranges ${counts.clientSkippedRanges}, past batches echoed ${counts.clientEchoes}, events checked ${counts.clientEventsChecked}, views checked ${counts.clientViewsChecked}, unexpected refusals ${counts.clientUnexpectedRefusals}`,
    `  replay of the longest night (${longest?.plan.code ?? "none"}, ${longest?.verdict.counts.hands ?? 0} hands, ${longest?.verdict.counts.events ?? 0} events): ${(longest?.verdict.replayMs ?? 0).toFixed(1)} ms`,
    `  settlement transfers per room: ${results.map((result) => result.verdict.transfers.join(",")).join(" ")} (total ${counts.transfers})`,
    `  fair shuffle, verdicts by the bots' devices: ${FAIRNESS_COUNT_NAMES.map((name) => `${name} ${fairness[name]}`).join(", ")}`,
    `  gaps (counts at zero): ${gaps.length === 0 ? "none" : gaps.join(", ")}`,
    ...failures.map((failure) => `  FAILED ${failure}`),
  ];

  return { counts, gaps, lines };
};

const timelineText = (night: OpenedNight) => {
  const stamp = ({ at, what }: Moment) =>
    `  +${((at - night.openedAt) / 1000).toFixed(3)} ${what}`;

  return [
    `room ${night.plan.code} seed ${night.plan.seed}, opened at ${night.openedAt.toFixed(0)}`,
    "night",
    ...night.journal.moments().map(stamp),
    ...night.clients.flatMap((client) => [
      `${client.label} player ${client.pass.player}`,
      ...client.timeline().map(stamp),
    ]),
  ].join("\n");
};

const saveLog = (
  seed: number,
  night: OpenedNight,
  events: readonly string[],
  proofs: readonly Proof[] = []
) =>
  Effect.gen(function* writeLog() {
    const { plan } = night;
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* fs.makeTempDirectory({ prefix: "nostakes-soak-" });
    const path = `${directory}/${seed}-${plan.code}.json`;

    yield* fs.writeFileString(
      path,
      JSON.stringify({
        code: plan.code,
        events,
        seed: plan.seed,
        soakSeed: seed,
      })
    );
    yield* fs.writeFileString(
      `${directory}/${seed}-${plan.code}.timeline.txt`,
      timelineText(night)
    );

    if (proofs.length > 0) {
      yield* fs.writeFileString(
        `${directory}/${seed}-${plan.code}.proofs.json`,
        JSON.stringify(proofs.map(proofRecord), null, 2)
      );
    }

    return path;
  });

test(
  "soak: at least 1,000 hands across at least 10 rooms of 2 to 9 seats over real sockets, with every check after every room",
  Effect.gen(function* soak() {
    const { url } = yield* deployed;
    const base = yield* Effect.fromNullishOr(url).pipe(Effect.orDie);

    const { budgetMinutes, hands, keepLogs, rooms, roomsAtOnce, seed } =
      yield* soakConfig;

    const perRoom = Math.ceil(hands / rooms);

    const plans = Array.from({ length: rooms }, (_, index) => {
      const turnSeconds = index % 6 === 5 ? 0 : 1 + (index % 2);

      return planNight(
        seed * 100 + index,
        {
          betweenHandsSeconds: index % 2,
          clientPercent: 50,
          handBudgetMs: HAND_BUDGET_MS,
          hands: perRoom + (index % 3),
          players: 2 + (index % 8),
          restarts: 2,
          rotation: index,
          shuffle:
            (index * CHECKED_SPREAD) % 10 < CHECKED_ROOMS_IN_TEN
              ? "Checked"
              : "Plain",
          silences: 3,
          tableRules: tableRulesFor(turnSeconds),
          turnSeconds,
        },
        temperFor(turnSeconds),
        CHAOS
      );
    });

    yield* Console.log(
      `soak seed ${seed}: ${rooms} rooms, ${hands} hands wanted, ${roomsAtOnce} rooms playing at a time, ${budgetMinutes} minutes to finish`
    );

    for (const plan of plans) {
      yield* Console.log(`  ${describePlan(plan)}`);
    }

    const started = wallClock();
    const probe: Probe = { peakHeapBytes: 0, stalls: [] };
    const prober = yield* watchEventLoop(probe).pipe(Effect.forkChild);
    const waveCount = Math.ceil(plans.length / Math.max(1, roomsAtOnce));

    const waves = Array.from({ length: waveCount }, (_, wave) =>
      plans.filter(
        ({ seed: roomSeed }) => (roomSeed - seed * 100) % waveCount === wave
      )
    );

    const windows: Window[] = [];
    const results: JudgedNight[] = [];
    const failures: string[] = [];
    const kept: string[] = [];

    let wavesJudged = 0;

    const playWaves = Effect.gen(function* playWaves() {
      for (const wave of waves) {
        const opened: OpenedNight[] = [];

        for (const plan of wave) {
          opened.push(yield* openNight(base, plan));
        }

        const from = wallClock();

        const played = yield* Effect.all(
          opened.map((night) => playNight(base, night).pipe(Effect.result)),
          { concurrency: "unbounded" }
        );

        windows.push({ from, to: wallClock() });

        for (const [index, outcome] of played.entries()) {
          const night = opened[index];

          if (night === undefined) {
            continue;
          }

          const { plan } = night;

          if (Result.isFailure(outcome)) {
            const stored = yield* inspect(base, plan.code);
            const path = yield* saveLog(seed, night, stored.events);

            const failure = `${plan.code} (seed ${plan.seed}): ${outcome.failure.message} The room halted: ${Option.getOrElse(stored.halted, () => "no")}. Alarm runs whose own command the room refused: ${refusedAlarms(stored)} of ${stored.alarmRuns.length}. log ${path}`;

            failures.push(failure);
            yield* Console.log(`  wave ${wavesJudged + 1} FAILED ${failure}`);
            continue;
          }

          const { checkMs, checkedAt, durationMs, events, verdict } =
            judgeNight(outcome.success);

          results.push({ checkMs, checkedAt, durationMs, plan, verdict });

          yield* Console.log(
            `  wave ${wavesJudged + 1} ${plan.code}: ${verdict.counts.hands} hands in ${(durationMs / 1000).toFixed(0)} s, checked in ${checkMs.toFixed(0)} ms, ${verdict.problems.length === 0 ? "ok" : `FAILED ${verdict.problems.slice(0, 3).join(" | ")}`}`
          );

          if (verdict.problems.length > 0) {
            const path = yield* saveLog(seed, night, events, verdict.proofs);

            failures.push(
              `${plan.code} (seed ${plan.seed}): ${verdict.problems.join(" | ")} log ${path}`
            );
          } else if (keepLogs) {
            const path = yield* saveLog(seed, night, events);

            kept.push(`  kept ${plan.code} (seed ${plan.seed}) log ${path}`);
          }
        }

        wavesJudged += 1;
      }
    });

    const finished = yield* playWaves.pipe(
      Effect.timeoutOption(Duration.minutes(budgetMinutes))
    );

    if (Option.isNone(finished)) {
      failures.push(
        `the soak ran out of its ${budgetMinutes} minutes during wave ${wavesJudged + 1} of ${waveCount}; the rooms of that wave and later ones were not judged`
      );
    }

    yield* Fiber.interrupt(prober);

    const elapsed = (wallClock() - started) / 1000;

    const { counts, gaps, lines } = summarize(
      seed,
      rooms,
      elapsed,
      results,
      failures
    );

    yield* Console.log(
      [
        ...lines,
        ...describeStalls(started, windows, probe, results),
        ...kept,
      ].join("\n")
    );

    const failed =
      failures.length > 0 ||
      gaps.length > 0 ||
      counts.hands < hands ||
      counts.clientUnexpectedRefusals > 0;

    return yield* failed
      ? Effect.fail(
          new SoakFailed({
            seed,
            summary: `${failures.length} rooms failed, gaps ${gaps.join(", ") || "none"}, ${counts.hands} of ${hands} hands`,
          })
        )
      : Effect.void;
  }).pipe(Effect.provide([FetchHttpClient.layer, NodeFileSystem.layer])),
  { timeout: VITEST_LIMIT_MS }
);
