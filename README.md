# nostakes

Poker night with friends, in the browser. Lives at nostakes.club.

A group of friends opens a room, up to 9 players, and plays no-limit hold'em. nostakes keeps the chip count exact and says who owes whom at the end of the night.

## Install

nostakes needs Node `24.18.0` or later and pnpm `11.28.11`. pnpm 10 switches to `11.28.11` on its own through the `packageManager` field. Without pnpm, run `corepack enable` first.

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
3. In each window, tap an empty seat (a dashed **Sit**), then select **Sit down**.
4. In the first window, select **Start the game** in the middle of the table.
5. Play with the table itself. Hold or hover your cards to see them. Tap the chip to check or call. Drag the chip up to bet or raise. Flick your cards up to fold. On a keyboard: Space peeks, **C** checks or calls, **R** opens the raise (type an amount or use the arrows, then Enter), **F** folds.

Everything else is under **Menu**: your seat, the host's controls, who is here, sound, and the light or dark theme. A refresh puts a player back in their seat.

The two-window check that CI runs plays a whole hand with those gestures and keys in headless, muted Chromium:

```sh
pnpm --filter @nostakes/web exec playwright-core install --only-shell chromium
pnpm --filter @nostakes/web verify
```

## Smoke check

The smoke check plays one short night against any running copy of the site: it loads the home page and a room link, opens a room, joins a second player, connects both sockets, plays one hand, closes the room, and reads the settlement twice.

```sh
pnpm smoke https://nostakes.club
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

## Deploy

Only the owner deploys. The site is one Cloudflare Worker on one origin. It serves the built web app as static assets and runs the room routes first for `/rooms` and `/rooms/*`, so the page, its HTTP calls, and its WebSocket share an origin. Each room is a Durable Object with SQLite storage. `apps/room-server/scripts/production.run.ts` declares it with Alchemy.

| Stage        | Address                         | Worker                |
| ------------ | ------------------------------- | --------------------- |
| `production` | `https://nostakes.club`         | `nostakes-production` |
| `preview`    | `https://preview.nostakes.club` | `nostakes-preview`    |

Each stage accepts only its own origin, and workers.dev stays off. Alchemy keeps its state in a Cloudflare state store Worker, `nostakes-state`, which the first deploy creates. Its access token is cached in `~/.alchemy`.

### Credentials

The commands read `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from the environment, or else from `cloudflare-api-token` and `cloudflare-account-id` in `~/.config/nostakes/`. Set `NOSTAKES_CREDENTIALS` to use another directory. They never print either value. The token needs:

- Account: Workers Scripts Edit, and Secrets Store Edit for the state store
- Zone `nostakes.club`: Workers Routes Edit, DNS Edit, and Zone Read

### Plan, then deploy

```sh
pnpm plan:production --first
```

This builds everything and prints what the first deploy would create, planned against empty state. It never writes to Cloudflare. After the first deploy, drop `--first` to plan against the stored state.

```sh
pnpm deploy:production --confirm=production
```

This refuses to run without `--confirm` naming the same stage. It runs `pnpm turbo run check test build`, then `alchemy deploy`, which shows the plan and asks once more, then `pnpm smoke https://nostakes.club`. Use `pnpm plan:preview` and `pnpm deploy:preview --confirm=preview` for the preview stage.

### Limits and lifetime

- Each address may open 10 rooms, join 30 times, and open 120 sockets a minute. Past that, opening or joining answers 429 and a socket closes as `TooManySockets`. The existing caps stay: 64 members and 64 sockets a room, and the frame limits.
- A room keeps its log, and a closed room keeps serving its settlement, for 30 days after its last event. Then its alarm closes any open socket and deletes all of its storage.

### Roll back

A deploy replaces the Worker's code, not the rooms' storage. If the smoke check fails after a deploy, open the Worker in the Cloudflare dashboard, choose Deployments, and roll back to the previous version. Or check out the last good commit and deploy it again.

## Commands

- `pnpm dev`: run the room server and the web app locally

- `pnpm check`: typecheck, lint, and format check
- `pnpm test`: build and run every test suite
- `pnpm verify`: run the long-running verification scripts
- `pnpm smoke <base-url>`: play one hand against a running site
- `pnpm plan:production --first`: show what the first deploy would create
- `pnpm deploy:production --confirm=production`: check, test, build, deploy, and smoke nostakes.club
- `pnpm turbo run check test build`: the full gate that CI runs

Read `AGENTS.md` before you change anything.
