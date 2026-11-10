import type { Result } from "effect";

import type { RoomEvent } from "./events.js";
import type { RoomRejection } from "./rejection.js";

export type Decision = Result.Result<readonly RoomEvent[], RoomRejection>;
