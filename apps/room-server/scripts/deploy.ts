import * as NodeServices from "@effect/platform-node/NodeServices";
import { Console, Effect, Exit, FileSystem, Schema } from "effect";
import type { Redacted } from "effect";
import * as ChildProcess from "effect/process/ChildProcess";

import { siteOrigin, SiteStageSchema } from "../src/site.ts";
import type { SiteStage } from "../src/site.ts";
import { credential as deployCredential } from "./cloudflare-credentials.ts";

const SERVER = new URL("..", import.meta.url).pathname;

const REPO = new URL("../../..", import.meta.url).pathname;

const STACK = "scripts/production.run.ts";

const WEB_DIST = `${REPO}apps/web/dist`;

const WEB_BUILD_FILE = `${WEB_DIST}/build.json`;

const WebBuildSchema = Schema.fromJsonString(
  Schema.Struct({ build: Schema.NonEmptyString })
);

const PASSED_TO_ALCHEMY = {
  deploy: new Set(["--yes", "--detailed"]),
  plan: new Set(["--detailed"]),
} as const;

const ModeSchema = Schema.Literals(["plan", "deploy"]);

type Mode = typeof ModeSchema.Type;

const USAGE =
  "usage: pnpm plan:<stage> [--first] [--detailed], or pnpm deploy:<stage> --confirm=<stage>, where <stage> is production or preview";

class DeployStopped extends Schema.TaggedError<
  DeployStopped,
  { readonly brand: unique symbol }
>()("DeployStopped", { reason: Schema.String }) {
  override get message() {
    return this.reason;
  }
}

const refuse = (reason: string) => new DeployStopped({ reason });

const request = Effect.gen(function* readRequest() {
  const [modeArg, stageArg, ...flags] = process.argv.slice(2);
  const mode = yield* Schema.decodeUnknownEffect(ModeSchema)(modeArg);
  const stage = yield* Schema.decodeUnknownEffect(SiteStageSchema)(stageArg);

  return {
    confirmed: flags.includes(`--confirm=${stage}`),
    first: flags.includes("--first"),
    mode,
    passed: flags.filter((flag) => PASSED_TO_ALCHEMY[mode].has(flag)),
    stage,
  };
}).pipe(Effect.mapError(() => refuse(USAGE)));

const DEPLOY_TOKEN_NEEDS =
  "The token needs Workers Scripts and Secrets Store edit on the account, and Workers Routes and DNS edit on the nostakes.club zone.";

const credential = (name: string, file: string) =>
  deployCredential(name, file, DEPLOY_TOKEN_NEEDS).pipe(
    Effect.mapError((missing) => refuse(missing.reason))
  );

const webBuild = Effect.gen(function* readWebBuild() {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(WEB_BUILD_FILE);

  return (yield* Schema.decodeEffect(WebBuildSchema)(text)).build;
}).pipe(
  Effect.mapError(() =>
    refuse(
      `${WEB_BUILD_FILE} is missing or unreadable. The web build writes it, and the Worker tells open pages which build it serves from it. Run pnpm build, then try again.`
    )
  )
);

const emptiedWebDist = Effect.gen(function* emptyWebDist() {
  const fs = yield* FileSystem.FileSystem;

  yield* fs.remove(WEB_DIST, { force: true, recursive: true });
}).pipe(
  Effect.mapError(() =>
    refuse(
      `Could not empty ${WEB_DIST} before the build. A cached build is restored over whatever is there, so a file from an older build, such as a page that was since removed, would be deployed with it. Remove the directory by hand, then try again.`
    )
  )
);

const run = (
  step: string,
  command: string,
  args: readonly string[],
  cwd: string,
  env: Record<string, string | Redacted.Redacted> = {}
) =>
  Effect.gen(function* runStep() {
    yield* Console.log(`\n== ${step}\n`);

    const handle = yield* ChildProcess.make(command, args, {
      cwd,
      env,
      extendEnv: true,
      stderr: "inherit",
      stdin: "inherit",
      stdout: "inherit",
    });

    const exitCode = yield* handle.exitCode.pipe(Effect.orDie);

    return yield* exitCode === 0
      ? Effect.void
      : Effect.fail(
          refuse(
            `${step} exited with ${exitCode}, so nothing after it ran. Read its output above.`
          )
        );
  }).pipe(Effect.scoped);

const alchemy = (
  mode: Mode,
  stage: SiteStage,
  first: boolean,
  passed: readonly string[]
) =>
  Effect.gen(function* runAlchemy() {
    const token = yield* credential(
      "CLOUDFLARE_API_TOKEN",
      "cloudflare-api-token"
    );

    const account = yield* credential(
      "CLOUDFLARE_ACCOUNT_ID",
      "cloudflare-account-id"
    );

    const build = yield* webBuild;

    yield* Console.log(`\nThe web build is ${build}.`);

    yield* run(
      `alchemy ${mode} --stage ${stage}`,
      "pnpm",
      ["exec", "alchemy", mode, "--stage", stage, ...passed, STACK],
      SERVER,
      {
        ALCHEMY_TELEMETRY_DISABLED: "1",
        CI: mode === "plan" ? "true" : "false",
        CLOUDFLARE_ACCOUNT_ID: account,
        CLOUDFLARE_API_TOKEN: token,
        NOSTAKES_FIRST_PLAN: first ? "true" : "false",
        WEB_BUILD: build,
      }
    );
  });

const plan = (stage: SiteStage, first: boolean, passed: readonly string[]) =>
  Effect.gen(function* planStage() {
    yield* emptiedWebDist;
    yield* run("build every package and the web app", "pnpm", ["build"], REPO);
    yield* alchemy("plan", stage, first, passed);
    yield* Console.log(
      first
        ? `\nThat is everything the first deploy of ${stage} would create. Nothing was changed.`
        : `\nThat is the plan for ${stage} against its stored state. Nothing was changed.`
    );
  });

const deploy = (stage: SiteStage, passed: readonly string[]) =>
  Effect.gen(function* deployStage() {
    const origin = siteOrigin(stage);

    yield* emptiedWebDist;
    yield* run(
      "check, test, and build",
      "pnpm",
      ["turbo", "run", "check", "test", "build"],
      REPO
    );
    yield* alchemy("deploy", stage, false, passed);
    yield* run(
      `smoke check against ${origin}`,
      "node",
      ["scripts/smoke.ts", origin],
      SERVER
    ).pipe(
      Effect.tapError(() =>
        Console.error(
          `\n${origin} is deployed but failed its smoke check. To go back, open the Worker nostakes-${stage} in the Cloudflare dashboard, choose Deployments, and roll back to the version before this one.`
        )
      )
    );
    yield* Console.log(`\n${origin} is deployed and passed its smoke check.`);
  });

const driver = Effect.gen(function* driver() {
  const { confirmed, first, mode, passed, stage } = yield* request;

  if (mode === "plan") {
    return yield* plan(stage, first, passed);
  }

  if (first) {
    return yield* refuse(
      "--first only plans. Deploy with pnpm deploy:<stage> --confirm=<stage>."
    );
  }

  if (!confirmed) {
    return yield* refuse(
      `Refusing to deploy ${stage} without --confirm=${stage}. Read pnpm plan:${stage} first, then run pnpm deploy:${stage} --confirm=${stage}.`
    );
  }

  return yield* deploy(stage, passed);
});

const outcome = await Effect.runPromiseExit(
  driver.pipe(
    Effect.tapError((stopped) => Console.error(`\n${stopped.message}`)),
    Effect.provide(NodeServices.layer)
  )
);

process.exitCode = Exit.isSuccess(outcome) ? 0 : 1;
