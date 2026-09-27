import type { Room } from "./room";

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  DB: D1Database;
}
