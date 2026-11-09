# nostakes

Poker night with friends, in the browser. Lives at nostakes.club.

A group of friends opens a room, up to 9 players, and plays no-limit hold'em. nostakes keeps the chip count exact and says who owes whom at the end of the night.

## Install

nostakes needs Node `24.18.0` or later and pnpm `11.3.0`. pnpm 10 switches to `11.3.0` on its own through the `packageManager` field. Without pnpm, run `corepack enable` first.

```sh
pnpm install
```

## Commands

- `pnpm check`: typecheck, lint, and format check
- `pnpm test`: build and run every test suite
- `pnpm verify`: run the long-running verification scripts
- `pnpm turbo run check test build`: the full gate that CI runs

Read `AGENTS.md` before you change anything.
