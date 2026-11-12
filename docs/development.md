# Development

How to set up nostakes, play it locally, and run its checks. [`AGENTS.md`](../AGENTS.md) is the law for changing code and describes every command in full. Read it before you change anything.

## Install

nostakes needs Node `24.22.1` or later and pnpm `11.28.11`. pnpm 10 switches to `11.28.11` on its own through the `packageManager` field. Without pnpm, run `corepack enable` first. Do not install with npm or Bun.

```sh
pnpm install
```

The install also patches TypeScript for the Effect diagnostics and installs the git hooks.

## Play locally

```sh
pnpm dev
```

This starts the room server on local workerd at `http://localhost:1337`, or the next free port, and the web app at `http://localhost:5173`. Nothing is deployed and no Cloudflare account is needed. A room survives restarting the room server.

To play a hand with yourself:

1. Open `http://localhost:5173`, type a name, pick a face, and open a room. The page moves to the room link, `http://localhost:5173/r/<CODE>`.
2. Open the same link in a private window, so it keeps its own pass, and join as a second player.
3. In each window, tap an empty seat, then sit down.
4. In the first window, start the game.
5. Play with the table itself. Hold or hover your cards to see them. Tap the chip to check or call. Drag the chip up to bet or raise. Flick your cards up to fold. On a keyboard: Space peeks, **C** checks or calls, **R** opens the raise (type an amount or use the arrows, then Enter), **F** folds.

Everything else is under **Menu**: your seat, the host's controls, the house rules, who is here, sound, and the light or dark theme. A refresh puts a player back in their seat.

## The checks

Every commit passes `pnpm check` and `pnpm test` through the pre-commit hook. Never skip the hook. If it fails, fix the failure.

```sh
pnpm check
pnpm test
```

Run one package's tests through turbo, which builds what the tests need first:

```sh
pnpm turbo run test --filter=@nostakes/engine
```

Long-running checks are `verify` scripts: simulators, the comparison against PokerKit, bots playing whole nights, and the browser checks. CI runs them on every push to `main`, after the commit has landed.

```sh
pnpm verify
pnpm verify:status
```

`pnpm verify:status` prints the outcome of CI and of each Verify job for the last ten commits. Run it after you push.

### The browser checks

The web app's `verify` plays a whole hand in two windows with the real gestures and keys, in headless, muted Chromium. Install the browser once:

```sh
pnpm --filter @nostakes/web exec playwright-core install --only-shell chromium
pnpm --filter @nostakes/web verify
```

Every automated browser in this repository is headless and muted.

### The smoke check

The smoke check plays one short night against any running copy of the site. It loads the home page and a room link, opens a room, joins a second player, connects both sockets, plays one hand, closes the room, and reads the settlement twice.

```sh
pnpm smoke <base-url>
```

It sends the base URL's own origin unless you pass `--origin=<origin>`. To run it against the production Worker on local workerd, as CI does:

```sh
pnpm build
cd apps/room-server
CLOUDFLARE_ACCOUNT_ID=00000000000000000000000000000000 pnpm exec alchemy dev --stage preview scripts/production.run.ts
```

Then, from the repository root in a second terminal, with the port that `alchemy dev` prints:

```sh
pnpm smoke http://localhost:1337 --origin=https://preview.nostakes.club
```

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run the room server and the web app locally |
| `pnpm check` | Lockfile check, strict typecheck, type-aware lint, and format check |
| `pnpm test` | Build each package and run every test suite once |
| `pnpm build` | Compile each package |
| `pnpm fix` | Apply the formatter and the safe lint fixes |
| `pnpm verify` | Run the long-running verification scripts |
| `pnpm verify:status` | Show CI and Verify results for the last ten commits |
| `pnpm smoke <base-url>` | Play one hand against a running site |
| `pnpm stats [stage] [range]` | Print the funnel and health counts from a stage's analytics. Read only |
| `pnpm plan:<stage>` | Show what a deploy would change. Never writes |
| `pnpm deploy:<stage> --confirm=...` | Check, test, build, deploy, and smoke a stage |
| `pnpm turbo run check test build` | The full gate |

Deploys are described in [`deploying.md`](deploying.md).
