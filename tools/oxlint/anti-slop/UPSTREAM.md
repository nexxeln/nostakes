# Upstream

nostakes copied this directory from [joelhooks/rat-stack](https://github.com/joelhooks/rat-stack) at `54bf778`. The rule files are unchanged. Only the test paths below changed.

Vendored from [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop) at commit `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b` (2026-09-10), using that commit's `install-anti-slop` skill assets. MIT licensed; see `LICENSE`.

These files are ours now. Change a rule when it stops matching how nostakes works, and record the change here. To take upstream fixes, follow the upstream `install-anti-slop` skill's update procedure: stage the new revision beside this copy and merge, never overwrite.

## Local changes

- 2026-11-16, `effect/rules/prefer-tagged-error-handling.ts`: taken from rat-stack at `8f05acb`, which merged it from K-Mistele/anti-slop at `b7c1619` (MIT) and rewrote its messages. Unchanged here. It found nothing in nostakes and guards new code. Fixture: `tools/fence/test/anti-slop-rules.test.ts`.
- 2026-11-16, `effect/rules/no-manual-tagged-type.ts`: taken from rat-stack at `8f05acb`, which merged it from [K-Mistele/anti-slop](https://github.com/K-Mistele/anti-slop) at `b7c1619` (MIT) and rewrote its message. Unchanged here. Its 24 findings were 19 `Extract<U, { _tag }>`, now `Types.ExtractTag`, two seat interfaces in `packages/engine/src/state.ts`, now derived from `Schema.TaggedStruct`, and three hand-written `_tag` constraints, now the types they stood for. Fixture: `tools/fence/test/anti-slop-rules.test.ts`.
- 2026-09-24, `rules/no-unknown-parameters.ts`: the first parameter of a promise rejection handler (the second argument to `.then`, or the argument to `.catch`) is exempt, whatever its name. It is the function form of a `catch` clause and receives `unknown` by nature. Without this, the rule (which exempted only `cause`) and Ultracite's `unicorn/catch-error-name` (which requires `error`) could not both pass. Tests: `tools/fence/test/unknown-parameters-rule.test.ts`.
- 2026-09-24, `shared/dictionary-types.ts`: the intersection branch returns its first unsafe member through a destructured binding, so it typechecks under `noUncheckedIndexedAccess`. Behavior unchanged. The whole `tools/oxlint` tree is now in the root `//#typecheck-scripts` gate. Found by drovr.
- 2026-11-02, every rule message: each message says what is wrong, why it matters, and `Fix:` with a concrete step in a code span. `require-readable-spacing` overrides the vendored eslint-stylistic messages the same way. Rule ids, rule logic, and fixers are unchanged. Taking an upstream message verbatim fails `tools/fence/test/fence-messages.test.ts`; rewrite it in this form when merging.
