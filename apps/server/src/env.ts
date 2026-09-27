import type { Presence } from "./presence";
import type { Room } from "./room";

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  PRESENCE: DurableObjectNamespace<Presence>;
  DB: D1Database;
}
