# nostakes

Poker night with friends, in the browser. Lives at nostakes.club.

A group of friends opens a room, up to 9 players, and plays no-limit hold'em. nostakes keeps the chip count exact and says who owes whom at the end of the night.

## Install

nostakes needs Node `24.18.0` or later and pnpm `11.3.0`. pnpm 10 switches to `11.3.0` on its own through the `packageManager` field. Without pnpm, run `corepack enable` first.

```sh
pnpm install
```

## Play locally

```sh
pnpm dev
```

This starts the room server on local workerd and the web app. Open `http://localhost:5173`, create a room, and open the room link in a second window to join as another player. Nothing is deployed and no Cloudflare account is needed.

## Commands

- `pnpm dev`: run the room server and the web app locally

- `pnpm check`: typecheck, lint, and format check
- `pnpm test`: build and run every test suite
- `pnpm verify`: run the long-running verification scripts
- `pnpm turbo run check test build`: the full gate that CI runs

Read `AGENTS.md` before you change anything.
