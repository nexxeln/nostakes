# Deploying

The owner approves every `production` deploy, each time.

The site is one Cloudflare Worker on one origin. It serves the built web app as static assets and runs the room routes first for `/rooms` and `/rooms/*`, so the page, its HTTP calls, and its WebSocket share an origin. Each room is a Durable Object with SQLite storage. `apps/room-server/scripts/production.run.ts` declares it with Alchemy.

| Stage        | Address                         | Worker                |
| ------------ | ------------------------------- | --------------------- |
| `production` | `https://nostakes.club`         | `nostakes-production` |
| `preview`    | `https://preview.nostakes.club` | `nostakes-preview`    |

Each stage accepts only its own origin, and workers.dev stays off. For `production`, a second Worker answers `www.nostakes.club` with a redirect to the apex. Alchemy keeps its state in a Cloudflare state store Worker, `nostakes-state`, which the first deploy creates. Its access token is cached in `~/.alchemy`.

## Credentials

The commands read `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from the environment, or else from `cloudflare-api-token` and `cloudflare-account-id` in `~/.config/nostakes/`. Set `NOSTAKES_CREDENTIALS` to use another directory. They never print either value. The token needs:

- Account: Workers Scripts Edit, and Secrets Store Edit for the state store
- Zone `nostakes.club`: Workers Routes Edit, DNS Edit, and Zone Read

`pnpm stats` only reads, and its token needs Account Analytics Read.

## Plan, then deploy

```sh
pnpm plan:production --first
```

This builds everything and prints what the first deploy would create, planned against empty state. It never writes to Cloudflare. After the first deploy, drop `--first` to plan against the stored state.

```sh
pnpm deploy:production --confirm=production
```

This refuses to run without `--confirm` naming the same stage. It empties the web build folder, runs `pnpm turbo run check test build`, then `alchemy deploy`, which shows the plan and asks once more, then the smoke check against the stage. Use `pnpm plan:preview` and `pnpm deploy:preview --confirm=preview` for the preview stage.

## Limits and lifetime

- Each address may open 10 rooms, join 30 times, and open 120 sockets a minute. Past that, opening or joining answers 429 with a `retry-after` header, and a socket is accepted and closed as `TooManySockets`.
- A room keeps its log, and a closed room keeps serving its settlement, for 30 days after its last event. Then it deletes all of its storage.

[`AGENTS.md`](../AGENTS.md) holds the caps inside a room.

## Roll back

A deploy replaces the Worker's code, not the rooms' storage. If the smoke check fails after a deploy, open the Worker in the Cloudflare dashboard, choose Deployments, and roll back to the previous version. Or check out the last good commit and deploy it again.
