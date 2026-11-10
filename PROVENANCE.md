# Provenance

nostakes bans comments in code (see `AGENTS.md`). Credit for borrowed code lives here instead.

| Code | Origin | Notes |
| --- | --- | --- |
| `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `tsconfig.json`, `oxlint.config.ts`, `oxfmt.config.ts`, `lefthook.yml`, `.claude/settings.json`, `scripts/hooks/`, `scripts/vcs-command-policy.*`, `scripts/oxlint-*.ts`, `.github/workflows/ci.yml`, `tools/fence/test/`, the config files in `packages/*/`, the shape of `AGENTS.md` | [joelhooks/rat-stack](https://github.com/joelhooks/rat-stack) at `54bf778`, MIT, Copyright (c) 2026 Joel Hooks | Copied, then cut to what does not depend on rat-stack's package layout. The changes are listed below. |
| `scripts/oxlint-plugin-effect-tests.ts` | [t3code](https://github.com/pingdotgg/t3code) `oxlint-plugin-t3code/rules/no-manual-effect-runtime-in-tests.ts`, through rat-stack | Unchanged from rat-stack's adaptation. |
| `tools/oxlint/anti-slop/` | [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop) at `c44ef22`, MIT, through rat-stack | Vendored and owned. See `LICENSE` and `UPSTREAM.md` there. Its files keep upstream's comments. |
| `packages/avatar/src/draw.ts`, `packages/avatar/src/palette.ts` | Original, drawn for nostakes | No third-party art. DiceBear's Big Smile, Toon Head, and Lorelei were compared on a design sheet and none of their parts is in the repo. |
| `patches/xstate@6.0.0-beta.1.patch` | [statelyai/xstate](https://github.com/statelyai/xstate) commits `0ebc5503111cd2787de6ded1a7de6fd6d25c6546` ([#5874](https://github.com/statelyai/xstate/pull/5874)) and `c558afa20cb7bda22ac24aaa7f250b523d490ade` ([#5889](https://github.com/statelyai/xstate/pull/5889)), MIT, Copyright (c) 2015 David Khourshid | A hand backport of their changes to `packages/core/src/inertActorScope.ts`, `snapshotActorRef.ts`, and `durable/index.ts` into the built files of the published `xstate@6.0.0-beta.1`: the four `dist/createActor-*` chunks and the four `dist/xstate-durable.*` entries. The patch keeps upstream's comments. Left out: #5889's checkpointed inbox (`checkpoint()`, inbox restore) and both pull requests' tests, and the UMD bundles, which nothing here loads. Drop it when a published xstate contains both commits. |
| `packages/avatar/src/random.ts` | The Park-Miller minimal standard generator (Park and Miller, "Random number generators: good ones are hard to find", CACM 1988, with the 48271 multiplier from their 1993 note) | A textbook algorithm, written from the paper's constants. |

## Changes from rat-stack

Unchanged: `tsconfig.base.json`, `.nvmrc`, `.claude/settings.json`, `scripts/hooks/block-git-no-verify.mjs`, `scripts/vcs-command-policy.d.ts`, `scripts/oxlint-plugin-no-comments.ts`, `scripts/oxlint-plugin-effect-tests.ts`, the anti-slop rule files, `packages/*/tsconfig.build.json`, and the no-comments, unknown-parameters, and fence-message tests.

Adapted:

- `package.json`: scripts for rat-stack's apps, deploys, content, Pi, and varlock are gone. `test` no longer runs the security-audit skill tests. `debt` and `verify` are new.
- `pnpm-workspace.yaml`: adds `tools/fence`. Only `lefthook` may run install scripts. No release-age exclusions or overrides, because none of our pins needs one.
- `turbo.json`: no site, web, or infra tasks and no signed remote cache. Adds `verify` and the root inputs the fence tests read.
- `tsconfig.json`: no `allowedUnstableApis`, because no root script uses Effect.
- `oxfmt.config.ts`: no site ignores or overrides.
- `oxlint.config.ts`: no Foldkit or `@xstate/effect` plugins, no site or web overrides, and the dropped rules below.
- `scripts/oxlint-plugin-patterns.ts` is `nostakes-patterns`. `scripts/oxlint-plugin-boundaries.ts` is `nostakes-boundaries`. `scripts/oxlint-plugin-debt-ledger.ts` is `nostakes-debt`, read by `pnpm debt` instead of a site page.
- `nostakes-boundaries/no-cross-layer-imports` keeps only the rule that a package cannot import app code.
- `scripts/vcs-command-policy.js` also blocks `commit -n`, `LEFTHOOK=0`, and `core.hooksPath` overrides.
- `lefthook.yml` drops its header comments.
- `.github/workflows/ci.yml` drops the remote cache, the source fetch, the concurrency cap, and the full-history checkout.
- The patterns and boundaries tests keep the cases for the kept rules, with nostakes paths.
- `tools/fence/test/effect-tests-rule.test.ts`, `anti-slop-rules.test.ts`, and `debt-ledger-rule.test.ts` are new. rat-stack has no fixture tests for those rules.

Dropped, because each depends on rat-stack's packages or apps:

- `contract-binding-matches-name`: rat-stack's `defineContract`
- `watch-effect-actors`: rat-stack's devtools `watchActor`
- `learn-snippet-idiom`: rat-stack's `.brain` learn cards
- `audited-content-regex`: rat-stack's site content pipeline
- `flag-removal-date`: rat-stack's flags package
- `no-browser-server-imports`: rat-stack's browser-safe contract modules
- `no-feature-transport`: rat-stack's Foldkit feature layout. Revisit with the Foldkit phase.
- `no-core-adapters`: rat-stack's `packages/core`
- `no-devtools-in-production`: rat-stack's devtools and auth packages
- `no-code-snippets-in-runtime`: rat-stack's `packages/code-snippets`
- `no-hand-rolled-surface`: rat-stack's `packages/capability` projections

Also dropped: the Foldkit and `@xstate/effect` lint plugins until those phases, the checker bump and parity tooling, the lockfile guard test (it needs `@effect/platform-node`; `lockfile:check` itself stays in `check`), the Pi and Cursor hooks, the skills, `VISION.md`, and the agent source mirrors.

## rat-stack license

MIT License

Copyright (c) 2026 Joel Hooks

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
