# Agent instructions

This file is the repo law for agents and contributors. It holds the commands, the validation rules, the architecture constraints, and the stop rules. The fence (types, lint, hooks, CI) enforces most of it. Fence wins over prose.

nostakes is a web app where groups of friends play poker online, at most 9 players per room. Chip accounting must be exactly right.

## Stack contract

Workspace `package.json` files declare the pinned stack. Keep every dependency exact. Record drift instead of migrating silently.

- pnpm workspaces and Turborepo `2.11.10`: `packages/*`, `tools/fence`, and `apps/*`
- Node `>=24.18.0` (`.nvmrc` holds `24.18.0`) and pnpm `11.3.0`. Do not install with npm or Bun.
- Effect `4.1.2` and `@effect/vitest` `4.1.2`. Every package resolves the same Effect runtime.
- TypeScript `7.0.2` in strict mode, patched by `@effect/tsgo` `0.67.5` in `prepare` so the Effect diagnostics fail `tsc` too
- `@yielded/effect-tsrs` `0.2.3` runs `typecheck` and `check` with `diagnostics --strict --type-check`. `--strict` makes Effect warnings fail.
- tsrs `0.23.0-ts7.1.0-beta` runs `typecheck:fast`. It has no Effect diagnostics.
- Vitest `5.1.0`
- Oxlint `1.92.0` with `oxlint-tsgolint` `7.0.2006` for type-aware rules, `@oxlint/plugins` `1.92.0`, Ultracite `8.1.1`, and Oxfmt `0.77.0`
- Lefthook `2.2.2` and `@types/node` `24.19.2`
- Alchemy `2.0.0-beta.85` (`alchemy`, `@alchemy.run/cloudflare`, `@alchemy.run/test`), `@cloudflare/workers-types` `5.20261108.1`, and `@effect/platform-node` `4.1.2`, which Alchemy's local Worker bridge imports. `workerd` is the only extra entry under `allowBuilds`, so its postinstall can fetch the local runtime.
- XState `6.0.0-beta.1` and `@xstate/effect` `1.0.0-beta.0`, both betas and newer than most training data. Read the installed source before you change a machine. `oxlint.config.ts` loads the `@xstate/effect/oxlint` plugin, resolved from `packages/client`.

Foldkit arrives in a later phase, with the owner's sign-off.

## Packages

- `@nostakes/engine` (`packages/engine`): pure no-limit hold'em rules
- `@nostakes/ledger` (`packages/ledger`): buy-ins, cash-outs, and settle-up transfers
- `@nostakes/room` (`packages/room`): one poker night as a pure reducer over the engine and the ledger: members, host, seats, clocks, the queue at the end of a hand, views, and redaction
- `@nostakes/protocol` (`packages/protocol`): the JSON frames between a room's clients and its server, the room pass, and the wire limits. It is generic over a room core's schemas, so it never imports the room, and it does no I/O.
- `@nostakes/client` (`packages/client`): the headless room client. It holds one connection, resumes after a drop without missing or repeating an event, resends unanswered commands with their ids, and exposes the view, the applied events, the connection state, and presence. Like `protocol` it is generic over a core's schemas and never imports the room. It reads no `window` or `document`. Its unit and model tests use a fake socket and the test clock. Its tests against the real server live in `apps/room-server/test/client-room.test.ts`, because a package may not import app code.
- `@nostakes/room-server` (`apps/room-server`): the Cloudflare Worker and one Durable Object per room, declared with Alchemy. It hosts any core that satisfies `HostedRoom` in `src/hosted-room.ts`. `src/poker-room.ts` adapts `@nostakes/room` to that port, and `src/poker-room-object.ts` and `src/worker.ts` are the production object and Worker, with allowed origins read from the `ALLOWED_ORIGINS` config. Its tests drive a toy core and the real room through real WebSocket clients on local workerd. Seeded bots in `test/fixtures/bot.ts` play whole nights, and `test/fixtures/night-checks.ts` checks every frame they received against the stored log. Each night splits its bots by seed into raw socket bots, which also break the protocol on purpose, and client bots in `test/fixtures/client-bot.ts`, which run `@nostakes/client` over the live WebSocket transport and play from its view. A client bot's wire (`test/fixtures/client-wire.ts`) can be closed from the bot's side, black-holed, deafened, taken offline, or fed a batch it already applied. A line only gets worse: a deaf line can be black-holed, but a black-holed line never hears again, because a real socket cannot lose frames and then deliver later ones. A night ends deterministically: once the room starts closing, each client bot closes any line it has broken, even while it waits for a reply, and the night stops only when every client bot is live, has nothing pending, and sees the room closed. A client bot that cannot get there within `SETTLE_LIMIT_MS` fails the night. The checks trace every accepted client command to the batch in the log that `decide` reproduces for it, account for every sequence number in the client's activity, and compare the client's view at the end of each hand with `viewFor`, apart from clocks. A live batch is redacted for each viewer's audience after the batch. A catch-up redacts each missed event for the audience right after that event, from the states the host keeps for the last 201 events, because a seat can change hands between batches. `Welcome.catchUp` says what it covers: `UpToDate`, `Missed { from, events }`, or `Skipped { from, to }`, and the client checks the range instead of inferring it. A browser never sees the HTTP status of a refused upgrade, so a socket for a wrong code, a halted room, or a full room is accepted and closed with a `Closing` frame (`src/refused-socket.ts`). Only a wrong origin gets an HTTP refusal. Every close the server makes goes through `closeWith` in `src/socket-close.ts`, and `test/close-paths.test.ts` fails on any other socket close. The object registers the exact ping and pong texts with the hibernation auto-response, so a ping never wakes a room, and it closes a live socket it has not heard from for `SOCKET_SILENCE_LIMIT_MS` with `Unresponsive`. After each commit the host counts the stored rows of the batch and halts if one is missing.
- `@nostakes/fence` (`tools/fence`): fixture tests for the lint rules and the hook policy. It ships nothing.

## Commands

- `pnpm install`: install the workspace. `prepare` patches TypeScript and installs the git hooks.
- `pnpm check`: lockfile check, strict typecheck, type-aware lint, and format check
- `pnpm test`: build each package and run every Vitest suite once
- `pnpm build`: compile each package to `dist`
- `pnpm typecheck`: strict effect-tsrs over every workspace and the root scripts
- `pnpm typecheck:tsc`: patched `tsc`. Run it when a checker pin changes.
- `pnpm typecheck:fast`: tsrs in seconds, without Effect diagnostics. `pnpm check` stays the gate.
- `pnpm lint`: type-aware lint and format check only
- `pnpm fix`: apply Oxfmt and safe Oxlint fixes. The fix deletes comment prose, so move what a comment knows into a name or a test first.
- `pnpm debt`: list every lint, Effect, and TypeScript directive with its reason. It exits non-zero while any directive exists. The list only shrinks.
- `pnpm verify`: run the long-running verification scripts of every package
- `pnpm turbo run check test build`: the full gate. CI runs it after a frozen install.

### Verification scripts

A long-running check, such as an exhaustive enumeration or a simulator, is a script, not a test.

- Put it in `packages/<name>/scripts/<script>.ts`. The package tsconfig already includes `scripts/`, so the fence checks it.
- Add `"verify": "node scripts/<script>.ts"` to the package `scripts`. Node strips the types. Chain several scripts with `&&`.
- Import the package by its own name, for example `@nostakes/engine`. The name resolves to the built `dist`, and turbo's `verify` task builds the package first.
- Print with Effect `Console`, run the program with `Effect.runPromise`, and fail the Effect on a counterexample. A failed Effect exits non-zero.
- `verify` is not part of `check` or `test`, and turbo never caches it. Run `pnpm verify` before you commit a change to the rules a script covers.
- `apps/room-server` is the exception. Its probes need a deployed Worker, and only the `@alchemy.run/test` harness deploys one to local workerd, so its `verify` runs `scripts/*.verify.ts` through `vitest.verify.config.ts`. Each probe fails its Effect with a tagged error on a counterexample. `scripts/soak.verify.ts` plays at least 1,000 hands across at least 10 rooms. Set `SOAK_SEED`, `SOAK_HANDS`, and `SOAK_ROOMS` to replay or resize it. A failed room prints its seed and code and saves its stored log to a temporary directory, with a timeline beside it: the night's own steps and, for each client bot, its connection phases, its lines, every frame it sent, swallowed, or got, and each command with its outcome. Set `SOAK_KEEP_LOGS=true` to save every room's log and timeline. `scripts/hibernation.verify.ts` pings through a 30-second idle and checks the room still hibernates. `scripts/silence.verify.ts` waits about 60 seconds for a quiet socket to be closed as `Unresponsive` while a pinging one stays.
- Integration tests that start workerd cost seconds on every commit through the hook. Keep `pnpm test` for the room server under about 30 seconds: one `beforeAll(deploy(ToyStack))` per file, files in parallel workers, and slow probes such as the hibernation idle and the 60-second silence limit in `verify`.

## Fence

The fence makes cheating uncomfortable. If a hook fails, fix the failure. Do not disable the fence.

- Lefthook pre-commit runs `pnpm check` and `pnpm test`.
- Never skip the hooks: no `--no-verify`, no `commit -n`, no `LEFTHOOK=0`, no `core.hooksPath` override. The Claude Code hook in `.claude/settings.json` denies these commands. The policy lives in `scripts/vcs-command-policy.js`.
- `tsconfig.base.json` owns the Effect diagnostic severities. A package tsconfig may add an exact `allowedUnstableApis` entry only for a module the checker warns about. `engine` and `ledger` already allow `@effect/vitest` and `effect/Arbitrary`, because every test needs them. `apps/room-server` also allows the `effect/http` modules it uses, and `effect/FileSystem` and `@effect/platform-node/NodeFileSystem` for the soak's saved logs.
- Some rules collide with common Effect forms. Use the form that passes both:
  - `unicorn/no-array-method-this-argument` reads any two-argument `.map`, `.filter`, or `.forEach` as an array call with `thisArg`. `Option.map(option, f)` and `Effect.forEach(items, f)` trip it. Write `option.pipe(Option.map(f))` and `pipe(items, Effect.forEach(f))`. `Effect.forEach(f, { concurrency })` trips it too, so write `Effect.all(items.map(f), { concurrency })`.
  - `anti-slop-effect/no-service-constructor-imports` rejects importing any `make<Name>` outside a test file. Name a factory for what it returns, such as `hostRoom` or `roomObject`.
  - `no-empty-object-type` rejects an empty `Data.TaggedEnum` variant. Give every variant a field that says something.
  - `anti-slop-effect/no-manual-tagged-construction` rejects a `_tag` in an object literal, test fixtures included. Compare wire frames as JSON text when a test needs the literal form.
  - The Effect diagnostic `missingReturnYieldStar` wants `return yield*` on an Effect that never succeeds, and `consistent-return` rejects a generator that mixes `return;` with `return yield* ...`. Collect the outcome in a variable, leave the loop, and end with one `return yield* Option.match(outcome, { onNone: () => Effect.void, onSome: (problem) => Effect.fail(...) })`.
  - `promise/prefer-await-to-then` reads `Effect.catch` as a promise `.catch`, and `promise/prefer-await-to-callbacks` reads a callback whose parameter is named `error` as a Node callback. Use `Effect.mapError` or `Effect.catchTag`, and name the parameter `failure`.
  - `anti-slop/no-shape-in-symbol-names` rejects any name containing "shape". Name the thing for what it holds, such as `recipe` or `plan`.
  - A room view or rejection holds `Option` values, which plain `JSON.stringify` cannot carry. Wrap a core's schemas in `Schema.toCodecJson` before `Schema.fromJsonString`. `HostedRoom` and `ClientSchemas` take a `WireCodec`, whose encoded side is `Schema.Json`, so a schema that skips this does not typecheck.
  - `typescript/no-unsafe-type-assertion` rejects a narrowing assertion even with a `SAFETY:` comment. Narrow with a type predicate instead, as `src/workerd.ts` does for the globals only workerd defines.
  - A type-level test uses `expectTypeOf` from `@effect/vitest`, not `@ts-expect-error`, because every directive counts as debt.
- `xstate-effect/no-inline-effect` rejects an Effect returned from an inline `enq` callback and inline Effect logic passed to `enq.spawn`. Declare Effect work in `setupEffect({ actors })`.
- CI runs `pnpm install --frozen-lockfile` and then `pnpm turbo run check test build`.

## Project law

- Chips are integers. No floating point anywhere near a chip amount. Model amounts with an integer Schema. Never divide chips with `/`, and never repair a result with `Math.round`. Every split names its rule for the remainder.
- Pure domain packages (`engine`, `ledger`) do no I/O and read no clock or randomness. Inputs such as the shuffled deck arrive as data. The Effect diagnostics `globalDate`, `globalRandom`, `globalTimers`, `globalConsole`, `globalFetch`, `cryptoRandomUUID`, and `nodeBuiltinImport` are errors, and `nostakes-patterns/no-module-level-mutable-state` bans module-level `let` and `var`.
- Errors are part of the interface. Define each one as a `Schema.TaggedError`, for example `class SeatTaken extends Schema.TaggedError<SeatTaken>()("SeatTaken", { seat: Schema.Int }) {}`. Name the failure, keep its context, and say how to fix it.
- Schemas are the contract. Parse unknown input with Effect `Schema` at the boundary. Trust internal types after that. Do not validate the same value twice.
- No comments in code. `no-comments/no-comments` bans them. Agents copy comments, and a comment that explains a workaround spreads the workaround. Say it in a name, a type, a test, or the commit message. Three kinds survive:
  - A tool directive with its reason after `--`: `// oxlint-disable-next-line <rule> -- <reason>`, `// @effect-diagnostics-next-line <rule>:off -- <reason>`, or `// @ts-expect-error -- <reason>`
  - A one-line `SAFETY:` comment above a type assertion that names the invariant it relies on
  - A JSDoc block made only of type tags in a plain JS file
- Credit for borrowed code lives in `PROVENANCE.md`.
- Tests prove behaviour. Write Effect tests with `it.effect` and `it.layer` from `@effect/vitest`. `Effect.run*` and `ManagedRuntime.make` in a test file fail lint.
- Prefer properties and models. A domain rule is an `it.prop` or `it.effect.prop` over Schema or `effect/Arbitrary` inputs. Anything with history, such as a hand or a session, is a model checked over generated command sequences. Keep example tests for seams.
- Plant a bug before you trust a new test. The test must fail, then pass once you restore the code. Tautological tests and change-detector tests are harmful.
- Delete `passWithNoTests` from a package's `vitest.config.ts` when its first test lands.
- Lint baselines only shrink. Add a lint rule before you clean up a bad pattern.

## Architecture

- Dependencies run from `apps` to `packages`. `nostakes-boundaries/no-cross-layer-imports` stops a package from importing app code.
- `engine` owns the rules of a hand. `ledger` owns the money across a session. Neither imports the other yet.
- Pure domain state machines are plain reducers over tagged unions. `decide(state, command)` returns the events the command causes, or fails with a tagged error. `evolve(state, event)` returns the next state. Branch with `Match.tagsExhaustive` or a `Data.taggedEnum` `$match`. A `switch` on `_tag` fails lint (`anti-slop-effect/no-manual-tag-comparison`).
- `protocol` owns the wire, including the close reasons and their codes, the ping and pong texts, the ping interval, and the server's silence limit. `room-server` owns identity, storage, delivery, and limits, and depends on `protocol`. The pure room core plugs into the server through `HostedRoom` in one module and never sees a socket, a token, or a sequence number.
- Lifecycles with side effects are XState machines. This is a deliberate reading of rat-stack's "lifecycles are machines" rule. A pure reducer has no side effect to retry, cancel, or resume, so it needs no actor. A lifecycle that waits, times out, or talks to the network gets a machine.
- The room server has no XState machine. Its only lifecycle is "wait until a deadline, then act", and that deadline is data in the core's state (`nextDeadline`), re-read on every start and after every commit and armed as the Durable Object alarm. There is no hidden state for a machine to own. Every change to a room goes through one synchronous commit function in `src/room-host.ts` that cannot await.
- The client's connection lifecycle has hidden state and side effects, so it is one XState machine, `roomClientMachine` in `packages/client/src/machine.ts`. XState owns the states (Idle, Connecting, Greeting, Live, Waiting, Refused, Stopped) and which transitions are legal. Declared Effect actors own the work. The Online state invokes the connection actor, so the socket lives exactly as long as Online. Time, backoff jitter, and the socket are the Effect services `Clock`, `Random`, and `Transport`, each with a live and a test layer. The embedding app sends `wake` when the page becomes visible or the network returns.
- Arm a machine timer as a named delayed event with an id, and cancel it on exit. XState's built-in `xstate.after` and `xstate.done.actor` events are not in a machine's event type, so a pure model test could only fire them through an unsafe cast. For the same reason a child actor relays named events to its parent instead of finishing with output.
- `Effect.sleep` inside a loop fails lint (`nostakes-patterns/no-sleep-in-loop`). Waiting belongs in a machine.

## Source control

- Trunk-based development. Commit small atomic changes straight to `main`. Every commit passes `pnpm check` and `pnpm test` through the hook.
- Use a conventional prefix (`feat:`, `fix:`, `test:`, `build:`, `ci:`, `docs:`, `chore:`) and an imperative subject under 72 characters. Add a body when the why is not obvious.
- Stage only the files your change touched. Never commit `dist`, `.turbo`, or secrets.

## Boundaries and sign-off

- Safe by default: code and tests inside a package, a new or tighter test or lint rule, a targeted override with a written reason, an `allowedUnstableApis` entry the checker asks for, a new verification script, and edits to `AGENTS.md` and `README.md`.
- Needs owner sign-off: adding, removing, or bumping any dependency, because pins are exact and CI installs cold. Any edit that loosens `oxlint.config.ts`, the diagnostics in `tsconfig.base.json`, `lefthook.yml`, `.claude/settings.json`, or `scripts/vcs-command-policy.js`. A new package or app. Anything that brings I/O, a clock, or randomness into `engine` or `ledger`.
