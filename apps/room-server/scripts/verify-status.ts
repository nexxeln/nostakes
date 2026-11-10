import * as NodeServices from "@effect/platform-node/NodeServices";
import { Console, Effect, Exit, Option, Schema, Stream } from "effect";
import * as ChildProcess from "effect/process/ChildProcess";

import { GhFailed } from "./gh-failed.ts";

const WORKFLOW = "Verify";

const COMMITS_SHOWN = 10;

const RUNS_LOOKED_AT = 60;

const OUTCOMES = [
  "success",
  "FAILURE",
  "cancelled",
  "running",
  "queued",
  "never ran",
] as const;

type Outcome = (typeof OUTCOMES)[number];

const FAILING: ReadonlySet<Outcome> = new Set(["FAILURE", "cancelled"]);

const FINISHED: ReadonlySet<Outcome> = new Set([...FAILING, "success"]);

class VerifyFailing extends Schema.TaggedError<
  VerifyFailing,
  { readonly brand: unique symbol }
>()("VerifyFailing", { jobs: Schema.Array(Schema.String) }) {
  override get message() {
    return `The newest finished ${WORKFLOW} result of ${this.jobs.join(", ")} is a failure. Read it with gh run view <run> --log-failed, and fix it forward.`;
  }
}

const CommitsSchema = Schema.fromJsonString(
  Schema.Array(Schema.Struct({ sha: Schema.String, subject: Schema.String }))
);

const RunsSchema = Schema.fromJsonString(
  Schema.Array(
    Schema.Struct({
      createdAt: Schema.String,
      databaseId: Schema.Int,
      event: Schema.String,
      headSha: Schema.String,
    })
  )
);

const JobsSchema = Schema.fromJsonString(
  Schema.Array(
    Schema.Struct({
      conclusion: Schema.NullOr(Schema.String),
      name: Schema.String,
      status: Schema.String,
      steps: Schema.Int,
      url: Schema.String,
    })
  )
);

type Run = (typeof RunsSchema.Type)[number];

type Job = (typeof JobsSchema.Type)[number];

interface Seen {
  readonly run: Run;
  readonly job: Job;
  readonly outcome: Outcome;
}

const gh = (args: readonly string[]) =>
  Effect.gen(function* runGh() {
    const handle = yield* ChildProcess.make("gh", args, {
      stderr: "inherit",
      stdin: "ignore",
      stdout: "pipe",
    });

    const [text, exitCode] = yield* Effect.all(
      [Stream.mkString(Stream.decodeText(handle.stdout)), handle.exitCode],
      { concurrency: 2 }
    ).pipe(Effect.orDie);

    return yield* exitCode === 0
      ? Effect.succeed(text)
      : Effect.fail(new GhFailed({ command: args.join(" "), exitCode }));
  }).pipe(Effect.scoped);

const outcomeOf = (job: Job): Outcome => {
  if (job.status !== "completed") {
    return job.steps === 0 ? "queued" : "running";
  }

  if (job.conclusion === "success") {
    return "success";
  }

  if (job.conclusion === "failure" || job.conclusion === "timed_out") {
    return "FAILURE";
  }

  return job.steps === 0 ? "never ran" : "cancelled";
};

const commitsOnMain = gh([
  "api",
  `repos/{owner}/{repo}/commits?sha=main&per_page=${COMMITS_SHOWN}`,
  "--jq",
  '[.[] | {sha, subject: (.commit.message | split("\\n") | .[0])}]',
]).pipe(Effect.flatMap(Schema.decodeUnknownEffect(CommitsSchema)));

const verifyRuns = gh([
  "run",
  "list",
  "--workflow",
  WORKFLOW,
  "--branch",
  "main",
  "--limit",
  String(RUNS_LOOKED_AT),
  "--json",
  "databaseId,headSha,event,createdAt",
]).pipe(Effect.flatMap(Schema.decodeUnknownEffect(RunsSchema)));

const jobsOf = (run: Run) =>
  gh([
    "api",
    `repos/{owner}/{repo}/actions/runs/${run.databaseId}/jobs?per_page=100`,
    "--jq",
    "[.jobs[] | {name, status, conclusion, url: .html_url, steps: (.steps | length)}]",
  ]).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(JobsSchema)),
    Effect.map((jobs) =>
      jobs.map((job): Seen => ({ job, outcome: outcomeOf(job), run }))
    )
  );

const newestFirst = (seen: readonly Seen[]) =>
  seen.toSorted((left, right) =>
    right.run.createdAt.localeCompare(left.run.createdAt)
  );

const shownFor = (seen: readonly Seen[]): Outcome =>
  newestFirst(seen).find(({ outcome }) => outcome !== "never ran")?.outcome ??
  "never ran";

const report = Effect.gen(function* report() {
  const [commits, runs] = yield* Effect.all([commitsOnMain, verifyRuns], {
    concurrency: 2,
  });

  const seen = (yield* Effect.all(runs.map(jobsOf), { concurrency: 8 })).flat();

  const names = [...new Set(seen.map(({ job }) => job.name))];

  const width = Math.max(
    ...OUTCOMES.map((outcome) => outcome.length),
    ...names.map((name) => name.length)
  );

  const cell = (text: string) => text.padEnd(width + 2);

  const rows = commits.map(({ sha, subject }) => {
    const forCommit = seen.filter(({ run }) => run.headSha === sha);

    const cells = names.map((name) =>
      cell(shownFor(forCommit.filter(({ job }) => job.name === name)))
    );

    return `${sha.slice(0, 7)}  ${cells.join("")}${subject.slice(0, 60)}`;
  });

  const newestFinished = names.map((name) => ({
    latest: Option.fromNullishOr(
      newestFirst(seen).find(
        ({ job, outcome }) => job.name === name && FINISHED.has(outcome)
      )
    ),
    name,
  }));

  const nameWidth = Math.max(...names.map((name) => name.length));

  yield* Console.log(
    [
      `${WORKFLOW} on main, newest commit first. A job that never ran was replaced in the queue by a newer push.`,
      `commit   ${names.map(cell).join("")}subject`,
      ...rows,
      "",
      `Newest finished result of each job over the last ${runs.length} ${WORKFLOW} runs:`,
      ...newestFinished.map(({ latest, name }) =>
        Option.match(latest, {
          onNone: () => `  ${name.padEnd(nameWidth)}  none yet`,
          onSome: ({ job, outcome, run }) =>
            `  ${name.padEnd(nameWidth)}  ${outcome.padEnd(9)}  ${run.headSha.slice(0, 7)} ${run.event.padEnd(17)} ${job.url}`,
        })
      ),
    ].join("\n")
  );

  const failing = newestFinished.flatMap(({ latest, name }) =>
    latest.pipe(
      Option.filter(({ outcome }) => FAILING.has(outcome)),
      Option.map(() => name),
      Option.toArray
    )
  );

  return yield* failing.length === 0
    ? Effect.void
    : Effect.fail(new VerifyFailing({ jobs: failing }));
});

const outcome = await Effect.runPromiseExit(
  report.pipe(
    Effect.tapError((failure) => Console.error(`\n${failure.message}`)),
    Effect.provide(NodeServices.layer)
  )
);

process.exitCode = Exit.isSuccess(outcome) ? 0 : 1;
