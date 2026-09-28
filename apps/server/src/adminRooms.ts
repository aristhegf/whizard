import { normalizeRoomCode, ROOM_IDLE_TTL_MS } from "@whizard/game-core";
import type { AdminRooms, LiveRoom } from "@whizard/protocol";
import { logAdmin, requireAdmin } from "./admin";
import { HttpError, requireSameOrigin, type RequestContext } from "./http";
import { removeLiveRoom } from "./liveRooms";

const SHOWN = 100;

interface Row extends Omit<LiveRoom, "nicknames" | "createdAt" | "updatedAt"> {
  nicknames: string;
  created_at: number;
  updated_at: number;
}

/** `GET /api/admin/rooms`: rooms open right now, games in progress first. */
export async function getAdminRooms(context: RequestContext): Promise<Response> {
  await requireAdmin(context);
  const db = context.env.DB;
  // An empty room closes after it's been idle this long; one past it is on its way out.
  const stale = Date.now() - ROOM_IDLE_TTL_MS;
  const { results } = await db
    .prepare(
      `SELECT * FROM live_rooms
        WHERE online > 0 OR updated_at >= ?
        ORDER BY phase = 'playing' DESC, online DESC, updated_at DESC`,
    )
    .bind(stale)
    .all<Row>();
  const rooms: LiveRoom[] = results.map((r) => ({
    code: r.code,
    game: r.game,
    topic: r.topic,
    difficulty: r.difficulty,
    questions: r.questions,
    phase: r.phase,
    players: r.players,
    online: r.online,
    host: r.host,
    nicknames: JSON.parse(r.nicknames) as string[],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
  const body: AdminRooms = {
    totals: {
      open: rooms.length,
      waiting: rooms.filter((r) => r.phase === "lobby").length,
      playing: rooms.filter((r) => r.phase === "playing").length,
      online: rooms.reduce((sum, r) => sum + r.online, 0),
    },
    rooms: rooms.slice(0, SHOWN),
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}

/** `POST /api/admin/rooms/:code/close`: sends everyone away and deletes the room. */
export async function closeRoom(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireAdmin(context);
  const { env, params } = context;
  const code = normalizeRoomCode(decodeURIComponent(params[0] ?? ""));
  if (!code) throw new HttpError(400, "invalid_room_code", "That isn't a valid room code");
  const closed = await env.ROOMS.getByName(code).closeByAdmin();
  // Also clears a listing whose room is already gone.
  await removeLiveRoom(env, code);
  await logAdmin(env.DB, user.id, "room:close", code).run();
  return Response.json({ ok: true, closed });
}
