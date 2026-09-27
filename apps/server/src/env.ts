import type { Presence } from "./presence";
import type { Room } from "./room";

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  PRESENCE: DurableObjectNamespace<Presence>;
  DB: D1Database;
  /** Per address: presence connections, and rooms created. */
  PRESENCE_LIMIT: RateLimit;
  ROOM_LIMIT: RateLimit;
  REPORT_LIMIT: RateLimit;
  /** Room connections (joins and reconnects). */
  JOIN_LIMIT: RateLimit;
}
