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

This starts the room server on local workerd at `http://localhost:1337` and the web app at `http://localhost:5173`. Nothing is deployed and no Cloudflare account is needed.

To play a hand with yourself:

1. Open `http://localhost:5173`, type a name, pick a face, and select **Open a room**. The page moves to the room link, `http://localhost:5173/r/<CODE>`.
2. Open the same link in a private window, so it keeps its own pass, and join as a second player.
3. In each window, select **Sit** on an empty seat, then **Sit down**.
4. In the first window, select **Start the game**.

A refresh puts a player back in their seat.

The two-window check that CI runs plays the same steps in headless, muted Chromium:

```sh
pnpm --filter @nostakes/web exec playwright-core install --only-shell chromium
pnpm --filter @nostakes/web verify
```

## Commands

- `pnpm dev`: run the room server and the web app locally

- `pnpm check`: typecheck, lint, and format check
- `pnpm test`: build and run every test suite
- `pnpm verify`: run the long-running verification scripts
- `pnpm turbo run check test build`: the full gate that CI runs

Read `AGENTS.md` before you change anything.
