import * as Cloudflare from "@alchemy.run/cloudflare";

import { configuredOrigins, serveRooms } from "./serve-rooms.js";

export default class RoomWorker extends Cloudflare.Worker<RoomWorker>()(
  "RoomWorker",
  {
    compatibility: { date: "2026-05-28" },
    main: import.meta.url,
  },
  serveRooms(configuredOrigins)
) {}
