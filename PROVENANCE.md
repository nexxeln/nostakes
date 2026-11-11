# Provenance

nostakes bans comments in code (see `AGENTS.md`). Credit for borrowed code lives here instead.

| Code | Origin | Notes |
| --- | --- | --- |
| `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `tsconfig.json`, `oxlint.config.ts`, `oxfmt.config.ts`, `lefthook.yml`, `.claude/settings.json`, `scripts/hooks/`, `scripts/vcs-command-policy.*`, `scripts/oxlint-*.ts`, `.github/workflows/ci.yml`, `tools/fence/test/`, the config files in `packages/*/`, the shape of `AGENTS.md` | [joelhooks/rat-stack](https://github.com/joelhooks/rat-stack) at `54bf778`, MIT, Copyright (c) 2026 Joel Hooks | Copied, then cut to what does not depend on rat-stack's package layout. The changes are listed below. |
| `scripts/oxlint-plugin-effect-tests.ts` | [t3code](https://github.com/pingdotgg/t3code) `oxlint-plugin-t3code/rules/no-manual-effect-runtime-in-tests.ts`, through rat-stack | Unchanged from rat-stack's adaptation. |
| `tools/oxlint/anti-slop/` | [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop) at `c44ef22`, MIT, through rat-stack | Vendored and owned. See `LICENSE` and `UPSTREAM.md` there. Its files keep upstream's comments. |
| `packages/avatar/src/draw.ts`, `packages/avatar/src/palette.ts` | Original, drawn for nostakes | No third-party art. DiceBear's Big Smile, Toon Head, and Lorelei were compared on a design sheet and none of their parts is in the repo. |
| `apps/web/src/client/fonts/figtree.woff2` | [Figtree](https://github.com/erikdkennedy/figtree) 2.002, SIL Open Font License 1.1, Copyright 2022 The Figtree Project Authors | Subset with fontTools to Basic Latin, Latin-1, Latin Extended-A, and the punctuation the app shows, with the weight axis cut to 400 to 800. The licence is `Figtree-OFL.txt` beside it. The font declares no Reserved Font Name. |
| `apps/web/src/client/fonts/dm-sans.woff2` | [DM Sans](https://github.com/googlefonts/dm-fonts) 4.004, SIL Open Font License 1.1, Copyright 2014 The DM Sans Project Authors | Subset the same way, with the weight axis cut to 700 to 800 and the optical-size axis to 14 to 40. The licence is `DMSans-OFL.txt` beside it. The font declares no Reserved Font Name. |
| `apps/web/src/features/moments/mp4.ts` | ISO/IEC 14496-12 (ISO base media file format), 14496-14 (the `esds` box), 14496-15 (the `avcC` box), and 14496-3 (`AudioSpecificConfig`) | Written from the specifications. No muxer's code was copied. |
| `apps/web/src/features/moments/sps.ts`, `apps/web/src/features/moments/i420.ts` | ITU-T H.264 (sequence parameter set and VUI syntax, Exp-Golomb codes, colour description code points) and ITU-R BT.709 (luma and colour-difference coefficients, limited-range quantisation) | Written from the specifications. No decoder's code was copied. |
| `packages/room/src/names.ts` (`LOOK_ALIKES`) | Unicode Technical Standard #39, `confusables.txt`, Unicode License v3 | 53 pairs chosen by hand from the Latin, Greek, and Cyrillic look-alikes that `confusables.txt` lists, each mapped to the plain Latin letter it reads as, with a capital I read as a small l as the file does. Not the data file, and no other script. |
| `mediabunny` `1.65.2`, an npm dependency of `apps/web` | [Vanilagy/mediabunny](https://github.com/Vanilagy/mediabunny), MPL-2.0 | Used unmodified, only through `apps/web/src/client/moments/mediabunny/`. MPL-2.0 is file-level copyleft: a change to one of its files would have to be published under MPL-2.0. We change none. |
| `@mediabunny/aac-encoder` `1.65.2`, an npm dependency of `apps/web` | The same repository, MPL-2.0, with a WASM build of [FFmpeg](https://ffmpeg.org/)'s AAC encoder under LGPL-2.1-or-later (the licence is in the package's `licenses/ffmpeg/`) | Loaded only where the browser has no AAC encoder. The package's README names the source: FFmpeg commit [`60a2818f76dcd1fee3155b1791304af104a0fc1b`](https://github.com/FFmpeg/FFmpeg/commit/60a2818f76dcd1fee3155b1791304af104a0fc1b) (`n9.1-dev-2902-g60a2818f76d`), unmodified, built with Emscripten 4.0.21, WASM SHA-256 `4123d56ed650255a14535d8438680a78df67ae9324e4874a88becfb37bf18c66`. The build writes `assets/mediabunny-aac-encoder-notice.txt` beside the chunk (`aacNotice` in `apps/web/vite.config.ts`): which file it is, the copyright, that source and the package's build steps from its README, and the LGPL 2.1, FFmpeg's licence note, and the MPL 2.0 in full; `/terms` links to it. The FFmpeg part is served unmodified: the build fails unless the chunk holds the package's encoder worker, the Emscripten glue with the WASM inside, byte for byte. The package's own JavaScript around it is minified by our build and imports Mediabunny from the clip worker's chunk. |
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
- `scripts/vcs-command-policy.js` is rat-stack's later policy from its commit `2417db8` ("fence: block every hook bypass, not only --no-verify"), unchanged: it reads the command with shell quoting and blocks `--no-verify` and its abbreviations, `commit -n`, `LEFTHOOK=0`, `LEFTHOOK_EXCLUDE`, `HUSKY=0`, `core.hooksPath` overrides, `lefthook uninstall`, and writes under `.git/hooks`, also inside `sh -c`. `tools/fence/test/vcs-command-policy.test.ts` holds rat-stack's cases and properties with ours added.
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
