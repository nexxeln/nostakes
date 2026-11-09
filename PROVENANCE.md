# Provenance

nostakes bans comments in code (see `AGENTS.md`). Credit for borrowed code lives here instead.

| Code | Origin | Notes |
| --- | --- | --- |
| `tsconfig.base.json`, `oxlint.config.ts`, `oxfmt.config.ts`, `lefthook.yml`, `.claude/settings.json`, `scripts/hooks/`, `scripts/vcs-command-policy.*`, `scripts/oxlint-*.ts`, `.github/workflows/ci.yml`, `tools/fence/test/` | [joelhooks/rat-stack](https://github.com/joelhooks/rat-stack) at `54bf778`, MIT, Copyright (c) 2026 Joel Hooks | Copied, then cut to the rules that do not depend on rat-stack's package layout. `AGENTS.md` lists every change. |
| `scripts/oxlint-plugin-effect-tests.ts` | [t3code](https://github.com/pingdotgg/t3code) `oxlint-plugin-t3code/rules/no-manual-effect-runtime-in-tests.ts`, through rat-stack | Unchanged from rat-stack's adaptation. |
| `tools/oxlint/anti-slop/` | [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop) at `c44ef22`, MIT, through rat-stack | Vendored and owned. See `LICENSE` and `UPSTREAM.md` there. Its files keep upstream's comments. |

## rat-stack license

MIT License

Copyright (c) 2026 Joel Hooks

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
