import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import { NodeFileSystem } from "@effect/platform-node";
import {
  Config,
  Console,
  Effect,
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
  COUNT_NAMES,
  DEAF_REPLY_BOUND_MS,
  emptyCounts,
} from "../test/fixtures/night-checks.js";
import type { CountName } from "../test/fixtures/night-checks.js";
import { openNight, planNight, runNight } from "../test/fixtures/night.js";
import type {
  NightPlan,
  NightResult,
  OpenedNight,
} from "../test/fixtures/night.js";
import { wallClock } from "../test/fixtures/poker-socket.js";
import { PokerStack } from "../test/fixtures/poker-stack.js";
import { inspect } from "../test/fixtures/stack.js";

const { afterAll, beforeAll, deploy, destroy, test } = Test.make({
  dev: true,
  providers: Cloudflare.providers(),
  sidecar: false,
  stage: `room_soak_${process.pid}`,
});

const deployed = beforeAll(deploy(PokerStack));

afterAll(destroy(PokerStack));

const soakConfig = Config.all({
  hands: Config.Int("SOAK_HANDS").pipe(Config.withDefault(1000)),
  keepLogs: Config.Boolean("SOAK_KEEP_LOGS").pipe(Config.withDefault(false)),
  rooms: Config.Int("SOAK_ROOMS").pipe(Config.withDefault(12)),
  seed: Config.Int("SOAK_SEED").pipe(Config.withDefault(20_261_110)),
});

const TEMPER: Temper = {
  churnPercent: 5,
  dropPercent: 0.6,
  duplicatePercent: 6,
  illegalPercent: 2,
  secondDevicePercent: 0.8,
  showdownSilencePercent: 15,
  silencePercent: 0.4,
  thinkMs: 30,
  voteSilencePercent: 8,
};

const CHAOS: ClientTemper = {
  blackHolePercent: 0.3,
  deafPercent: 0.1,
  dropPercent: 0.6,
  echoPercent: 0.5,
  issueBeforeDropPercent: 60,
  napPercent: 0.2,
  waitOutSilencePercent: 25,
  wakePercent: 0.5,
};

const HAND_BUDGET_MS = 12_000;

const INFORMATIONAL: ReadonlySet<CountName> = new Set([
  "catchUpsSkipped",
  "clientDropsDeafSilence",
  "clientDropsSilenceLimit",
  "clientDropsUnansweredOnClearLine",
  "clientDropsUnexplained",
  "clientFailedAttempts",
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
  `${plan.code} seed ${plan.seed}: ${plan.players + plan.lateJoiners} players and ${plan.spectators} spectators, ${plan.hands} hands, turn ${plan.settings.turnSeconds}s, bank ${plan.settings.timeBankSeconds}s, runs ${plan.settings.table.maxRuns}, client bots ${plan.clients.join(",") || "none"}, rules ${plan.ruleChanges.map((rule) => `${rule.label} at ${rule.atHand}`).join("; ")}`;

const sumCounts = (results: readonly NightResult[]) => {
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
  results: readonly NightResult[],
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

  const gaps = COUNT_NAMES.filter(
    (name) => counts[name] === 0 && !INFORMATIONAL.has(name)
  );

  const lines = [
    `soak seed ${seed} summary`,
    `  rooms ${results.length} of ${rooms}, hands ${counts.hands}, events ${counts.events}, wall ${elapsed.toFixed(1)} s, hands per second ${(counts.hands / elapsed).toFixed(2)}`,
    `  commands ${counts.commands}, rejected ${counts.rejected}, illegal sent ${counts.illegal}, protocol violations ${counts.protocolViolations}`,
    `  reconnects ${counts.reconnects}, socket drops ${counts.drops}, second devices ${counts.secondDevices}, catch-ups ${counts.catchUps}, catch-ups past the window ${counts.catchUpsSkipped}`,
    `  restarts ${counts.restarts} mid-hand and ${counts.voteRestarts} mid-vote, resent after a drop ${counts.resent}`,
    `  silences ${counts.silences}, time banks started ${counts.bankStarts}, timeouts ${counts.timeouts}, welcome clock checks ${counts.welcomeClockChecks}`,
    `  duplicates sent ${counts.duplicates}, duplicates with matching replies ${counts.duplicatesConfirmed}, reply timeouts ${counts.replyTimeouts}`,
    `  hands by ante: none ${counts.noAnteHands}, every player ${counts.everyPlayerAnteHands}, big blind ${counts.bigBlindAnteHands}; antes posted ${counts.antePosts}`,
    `  straddles ${counts.straddles}, multi-run hands ${counts.multiRunHands}, run choices ${counts.runChoices}, run votes past their deadline without a turn clock ${counts.unclockedVotesTimedOut}, rabbit hunts ${counts.rabbitHunts}, shows ${counts.shows}`,
    `  showdowns: tabled ${counts.showdownTables}, mucked ${counts.showdownMucks}, chosen at or after the clock's deadline ${counts.lateShowdownChoices}, won without showing ${counts.unshownWinners}, illegal mucks sent ${counts.illegalMucks}`,
    `  hands with approval ${counts.handsWithApproval} and without ${counts.handsWithoutApproval}, approvals ${counts.approvals}, denials ${counts.denials}`,
    `  settings changed ${counts.settingsChanged}, rules queued ${counts.rulesQueued}, closes queued in a hand ${counts.closeQueued}`,
    `  frames checked ${counts.framesChecked}, views checked ${counts.viewsChecked}, viewFor ${views > 0 ? ((viewMs * 1000) / views).toFixed(1) : "n/a"} µs each over ${views}`,
    `  client bots ${counts.clientBots}: commands ${counts.clientCommands}, traced to the log ${counts.clientCommandsTraced}, issued right before a drop ${counts.clientIssuedBeforeDrop}, resent after a drop ${counts.clientResent}`,
    `  client drops: bot close ${counts.clientDropsBotClose}, server restart ${counts.clientDropsRestart}, unanswered on a deaf line ${counts.clientDropsDeafUnanswered}, black hole ${counts.clientDropsBlackHole}; server silence limit ${counts.clientDropsSilenceLimit}, deaf and silent ${counts.clientDropsDeafSilence}, unanswered on a clear line ${counts.clientDropsUnansweredOnClearLine}, unexplained ${counts.clientDropsUnexplained}, failed reconnects ${counts.clientFailedAttempts}`,
    `  commands issued on a deaf line ${counts.clientDeafCommands}, answered ${deafReplies.length}, slowest reply ${slowestDeafReply.toFixed(0)} ms (bound ${DEAF_REPLY_BOUND_MS} ms)`,
    `  client wakes ${counts.clientWakes}, naps ${counts.clientNaps}, skipped ranges ${counts.clientSkippedRanges}, past batches echoed ${counts.clientEchoes}, events checked ${counts.clientEventsChecked}, views checked ${counts.clientViewsChecked}, unexpected refusals ${counts.clientUnexpectedRefusals}`,
    `  replay of the longest night (${longest?.plan.code ?? "none"}, ${longest?.verdict.counts.hands ?? 0} hands, ${longest?.verdict.counts.events ?? 0} events): ${(longest?.verdict.replayMs ?? 0).toFixed(1)} ms`,
    `  settlement transfers per room: ${results.map((result) => result.verdict.transfers.join(",")).join(" ")} (total ${counts.transfers})`,
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

const saveLog = (seed: number, night: OpenedNight, events: readonly string[]) =>
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

    return path;
  });

test(
  "soak: at least 1,000 hands across at least 10 rooms of 2 to 9 seats over real sockets, with every check after every room",
  Effect.gen(function* soak() {
    const { url } = yield* deployed;
    const base = yield* Effect.fromNullishOr(url).pipe(Effect.orDie);
    const { hands, keepLogs, rooms, seed } = yield* soakConfig;
    const perRoom = Math.ceil(hands / rooms);

    const plans = Array.from({ length: rooms }, (_, index) =>
      planNight(
        seed * 100 + index,
        {
          betweenHandsSeconds: index % 2,
          clientPercent: 50,
          handBudgetMs: HAND_BUDGET_MS,
          hands: perRoom + (index % 3),
          players: 2 + (index % 8),
          restarts: 2,
          rotation: index,
          silences: 3,
          turnSeconds: index % 6 === 5 ? 0 : 1 + (index % 2),
        },
        TEMPER,
        CHAOS
      )
    );

    yield* Console.log(
      `soak seed ${seed}: ${rooms} rooms, ${hands} hands wanted`
    );

    for (const plan of plans) {
      yield* Console.log(`  ${describePlan(plan)}`);
    }

    const started = wallClock();
    const opened = [];

    for (const plan of plans) {
      opened.push(yield* openNight(base, plan));
    }

    const outcomes = yield* Effect.all(
      opened.map((night) => runNight(base, night).pipe(Effect.result)),
      { concurrency: "unbounded" }
    );

    const elapsed = (wallClock() - started) / 1000;
    const results: NightResult[] = [];
    const failures: string[] = [];
    const kept: string[] = [];

    for (const [index, outcome] of outcomes.entries()) {
      const night = opened[index];

      if (night === undefined) {
        continue;
      }

      const { plan } = night;

      if (Result.isFailure(outcome)) {
        const stored = yield* inspect(base, plan.code);
        const path = yield* saveLog(seed, night, stored.events);

        failures.push(
          `${plan.code} (seed ${plan.seed}): ${outcome.failure.message} The room halted: ${Option.getOrElse(stored.halted, () => "no")}. log ${path}`
        );
        continue;
      }

      results.push(outcome.success);

      if (outcome.success.verdict.problems.length > 0) {
        const path = yield* saveLog(seed, night, outcome.success.events);

        failures.push(
          `${plan.code} (seed ${plan.seed}): ${outcome.success.verdict.problems.join(" | ")} log ${path}`
        );
      } else if (keepLogs) {
        const path = yield* saveLog(seed, night, outcome.success.events);

        kept.push(`  kept ${plan.code} (seed ${plan.seed}) log ${path}`);
      }
    }

    const { counts, gaps, lines } = summarize(
      seed,
      rooms,
      elapsed,
      results,
      failures
    );

    yield* Console.log([...lines, ...kept].join("\n"));

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
  { timeout: 1_800_000 }
);
