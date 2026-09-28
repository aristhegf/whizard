import { phaseOf, type ConnectedIds, type RoomState } from "@whizard/game-core";
import type { LiveRoom } from "@whizard/protocol";
import type { Env } from "./env";

/** What the admin Rooms page shows about a room, without the time it was written. */
export function liveRoomOf(state: RoomState, connected: ConnectedIds): Omit<LiveRoom, "updatedAt"> {
  const settings = (state.game.settings ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : null);
  return {
    code: state.code,
    game: state.game.id,
    topic: text(settings.category),
    difficulty: text(settings.difficulty),
    questions: typeof settings.count === "number" ? settings.count : null,
    phase: phaseOf(state),
    players: state.players.length,
    online: state.players.filter((p) => connected.has(p.id)).length,
    host: state.players.find((p) => p.id === state.hostId)?.nickname ?? null,
    nicknames: state.players.map((p) => p.nickname),
    createdAt: state.createdAt,
  };
}

export async function saveLiveRoom(env: Env, room: Omit<LiveRoom, "updatedAt">, now: number) {
  await env.DB.prepare(
    `INSERT INTO live_rooms (code, game, topic, difficulty, questions, phase, players, online,
                             host, nicknames, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (code) DO UPDATE SET
       game = excluded.game, topic = excluded.topic, difficulty = excluded.difficulty,
       questions = excluded.questions, phase = excluded.phase, players = excluded.players,
       online = excluded.online, host = excluded.host, nicknames = excluded.nicknames,
       updated_at = excluded.updated_at`,
  )
    .bind(
      room.code,
      room.game,
      room.topic,
      room.difficulty,
      room.questions,
      room.phase,
      room.players,
      room.online,
      room.host,
      JSON.stringify(room.nicknames),
      room.createdAt,
      now,
    )
    .run();
}

export async function removeLiveRoom(env: Env, code: string) {
  await env.DB.prepare("DELETE FROM live_rooms WHERE code = ?").bind(code).run();
}
