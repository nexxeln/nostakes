# Agent instructions

This file is the repo law for agents and contributors. It holds the commands, the validation rules, the architecture constraints, and the stop rules. The fence (types, lint, hooks, CI) enforces most of it. Fence wins over prose.

nostakes is a web app where groups of friends play poker online, at most 9 players per room. Chip accounting must be exactly right.

## Stack contract

Workspace `package.json` files declare the pinned stack. Keep every dependency exact. Record drift instead of migrating silently.

- pnpm workspaces and Turborepo `2.11.10`: `packages/*`, `tools/fence`, and `apps/*` (reserved)
- Node `>=24.18.0` (`.nvmrc` holds `24.18.0`) and pnpm `11.3.0`. Do not install with npm or Bun.
- Effect `4.1.2` and `@effect/vitest` `4.1.2`. Every package resolves the same Effect runtime.
- TypeScript `7.0.2` in strict mode, patched by `@effect/tsgo` `0.67.5` in `prepare` so the Effect diagnostics fail `tsc` too
- `@yielded/effect-tsrs` `0.2.3` runs `typecheck` and `check` with `diagnostics --strict --type-check`. `--strict` makes Effect warnings fail.
- tsrs `0.23.0-ts7.1.0-beta` runs `typecheck:fast`. It has no Effect diagnostics.
- Vitest `5.1.0`
- Oxlint `1.92.0` with `oxlint-tsgolint` `7.0.2006` for type-aware rules, `@oxlint/plugins` `1.92.0`, Ultracite `8.1.1`, and Oxfmt `0.77.0`
- Lefthook `2.2.2` and `@types/node` `24.19.2`

Cloudflare Workers, a Durable Object per room, Alchemy, XState, and Foldkit arrive in later phases, each with the owner's sign-off.

## Packages

- `@nostakes/engine` (`packages/engine`): pure no-limit hold'em rules
- `@nostakes/ledger` (`packages/ledger`): buy-ins, cash-outs, and settle-up transfers
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

## Fence

The fence makes cheating uncomfortable. If a hook fails, fix the failure. Do not disable the fence.

- Lefthook pre-commit runs `pnpm check` and `pnpm test`.
- Never skip the hooks: no `--no-verify`, no `commit -n`, no `LEFTHOOK=0`, no `core.hooksPath` override. The Claude Code hook in `.claude/settings.json` denies these commands. The policy lives in `scripts/vcs-command-policy.js`.
- `tsconfig.base.json` owns the Effect diagnostic severities. A package tsconfig may add an exact `allowedUnstableApis` entry only for a module the checker warns about. `engine` and `ledger` already allow `@effect/vitest` and `effect/Arbitrary`, because every test needs them.
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
- Lifecycles with side effects are XState machines. They arrive in a later phase with the room server. This is a deliberate reading of rat-stack's "lifecycles are machines" rule. A pure reducer has no side effect to retry, cancel, or resume, so it needs no actor. A lifecycle that waits, times out, or talks to the network gets a machine.
- `Effect.sleep` inside a loop fails lint (`nostakes-patterns/no-sleep-in-loop`). Waiting belongs in a machine.

## Source control

- Trunk-based development. Commit small atomic changes straight to `main`. Every commit passes `pnpm check` and `pnpm test` through the hook.
- Use a conventional prefix (`feat:`, `fix:`, `test:`, `build:`, `ci:`, `docs:`, `chore:`) and an imperative subject under 72 characters. Add a body when the why is not obvious.
- Stage only the files your change touched. Never commit `dist`, `.turbo`, or secrets.

## Boundaries and sign-off

- Safe by default: code and tests inside a package, a new or tighter test or lint rule, a targeted override with a written reason, an `allowedUnstableApis` entry the checker asks for, a new verification script, and edits to `AGENTS.md` and `README.md`.
- Needs owner sign-off: adding, removing, or bumping any dependency, because pins are exact and CI installs cold. Any edit that loosens `oxlint.config.ts`, the diagnostics in `tsconfig.base.json`, `lefthook.yml`, `.claude/settings.json`, or `scripts/vcs-command-policy.js`. A new package or app. Anything that brings I/O, a clock, or randomness into `engine` or `ledger`.
