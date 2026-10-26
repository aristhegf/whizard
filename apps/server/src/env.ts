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
  /** Bank and question writes: create, rename, add, edit, delete. */
  BANK_LIMIT: RateLimit;
  /** Google Gemini, for answering key-less CSV imports. Absent when not configured. */
  GEMINI_API_KEY?: string;
  /** Which Gemini model answers imports; defaults to a current Flash model. */
  GEMINI_MODEL?: string;
  /** Bachs API key (sk_live_... or sk_sandbox_...) for checkout sessions. */
  BACHS_API_KEY?: string;
  /** Bachs webhook secret for verifying incoming webhook signatures. */
  BACHS_WEBHOOK_SECRET?: string;
  /** Optional override for Bachs API base URL. */
  BACHS_API_URL?: string;
}
