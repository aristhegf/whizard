import { randomToken, type FinishedGame } from "@whizard/game-core";
import type { CategoryStat, MatchPlayer, MatchRecord, PlayerStats } from "@whizard/protocol";
import { requireUser } from "./account";
import type { Env } from "./env";
import type { RequestContext } from "./http";
import { asAvatar } from "./sessions";
import { dayOf, NETWORK_MATCH_DAYS } from "./analytics";
import { SEEN_KEEP_MS } from "./seen";

/** How long a guest's games can still be claimed by an account they create. */
export const GUEST_CLAIM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 20;

interface MatchRow {
  id: string;
  game: string;
  category: string | null;
  difficulty: string | null;
  mode: string | null;
  rounds: number;
  player_count: number;
  started_at: number;
  finished_at: number;
}

interface MatchPlayerRow {
  match_id: string;
  placing: number;
  user_id: string | null;
  username: string | null;
  avatar: string | null;
  nickname: string;
  score: number;
  correct: number | null;
}

/** Saves a finished game. Players who left before the end aren't included. */
export async function recordMatch(env: Env, result: FinishedGame, finishedAt: number) {
  const { summary, roster } = result;
  if (summary.players.length === 0 || roster.length === 0) return;
  const id = randomToken(12);
  const statements = [
    env.DB.prepare(
      `INSERT INTO matches
         (id, game, category, difficulty, mode, rounds, player_count, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      result.gameId,
      summary.category,
      summary.difficulty,
      summary.mode,
      summary.rounds,
      summary.players.length,
      result.startedAt,
      finishedAt,
    ),
  ];
  for (const player of summary.players) {
    const entry = roster.find((r) => r.playerId === player.playerId);
    if (!entry) continue;
    statements.push(
      env.DB.prepare(
        `INSERT INTO match_players (match_id, placing, user_id, guest_id, nickname, score, correct)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        player.placing,
        entry.account?.userId ?? null,
        entry.account ? null : entry.guestId,
        entry.nickname,
        player.score,
        player.correct,
      ),
    );
  }
  await env.DB.batch(statements);
}

/** Moves recent games played as a guest in this browser onto the account. */
export async function claimGuestGames(env: Env, guestId: string, userId: string) {
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE match_players SET user_id = ?1, guest_id = NULL
        WHERE guest_id = ?2 AND user_id IS NULL
          AND match_id NOT IN (SELECT match_id FROM match_players WHERE user_id = ?1)`,
    ).bind(userId, guestId),
    // The questions they were asked as a guest follow them too.
    env.DB.prepare("UPDATE OR IGNORE seen_questions SET viewer = ?1 WHERE viewer = ?2").bind(
      `u:${userId}`,
      `g:${guestId}`,
    ),
    env.DB.prepare("DELETE FROM seen_questions WHERE viewer = ?").bind(`g:${guestId}`),
    env.DB.prepare("UPDATE OR IGNORE player_days SET viewer = ?1 WHERE viewer = ?2").bind(
      `u:${userId}`,
      `g:${guestId}`,
    ),
    env.DB.prepare("DELETE FROM player_days WHERE viewer = ?").bind(`g:${guestId}`),
  ]);
}

async function matchesFor(
  env: Env,
  userId: string,
  before: number,
  limit: number,
): Promise<MatchRecord[]> {
  const { results: matches } = await env.DB.prepare(
    `SELECT m.*, mp.correct AS my_correct FROM matches m
       JOIN match_players mp ON mp.match_id = m.id
      WHERE mp.user_id = ? AND m.finished_at < ?
      ORDER BY m.finished_at DESC LIMIT ?`,
  )
    .bind(userId, before, limit)
    .all<MatchRow & { my_correct: number | null }>();
  if (matches.length === 0) return [];

  const ids = matches.map((m) => m.id);
  const { results: players } = await env.DB.prepare(
    `SELECT mp.match_id, mp.placing, mp.user_id, u.username, u.avatar, mp.nickname, mp.score
       FROM match_players mp LEFT JOIN users u ON u.id = mp.user_id
      WHERE mp.match_id IN (${ids.map(() => "?").join(", ")})
      ORDER BY mp.placing`,
  )
    .bind(...ids)
    .all<MatchPlayerRow>();

  return matches.map((m) => ({
    id: m.id,
    game: m.game,
    category: m.category,
    difficulty: m.difficulty,
    mode: m.mode,
    rounds: m.rounds,
    finishedAt: m.finished_at,
    myCorrect: m.my_correct,
    players: players
      .filter((p) => p.match_id === m.id)
      .map((p): MatchPlayer => ({
        nickname: p.nickname,
        avatar: asAvatar(p.avatar),
        username: p.username,
        placing: p.placing,
        score: p.score,
        isMe: p.user_id === userId,
      })),
  }));
}

export async function getMatches(context: RequestContext): Promise<Response> {
  const { user } = await requireUser(context);
  const before = Number(context.url.searchParams.get("before")) || Number.MAX_SAFE_INTEGER;
  const matches = await matchesFor(context.env, user.id, before, PAGE_SIZE);
  return Response.json({ matches, more: matches.length === PAGE_SIZE });
}

export async function getStats(context: RequestContext): Promise<Response> {
  const { user } = await requireUser(context);
  const db = context.env.DB;
  const [totals, categories] = await db.batch<Record<string, number | string | null>>([
    db
      .prepare(
        `SELECT COUNT(*) AS played,
                COALESCE(SUM(m.player_count > 1), 0) AS group_games,
                COALESCE(SUM(m.player_count > 1 AND mp.placing = 1), 0) AS wins
           FROM match_players mp JOIN matches m ON m.id = mp.match_id
          WHERE mp.user_id = ?`,
      )
      .bind(user.id),
    db
      .prepare(
        `SELECT m.category, COUNT(*) AS games,
                CAST(SUM(mp.correct) AS REAL) / SUM(m.rounds) AS accuracy
           FROM match_players mp JOIN matches m ON m.id = mp.match_id
          WHERE mp.user_id = ? AND m.category IS NOT NULL AND mp.correct IS NOT NULL
          GROUP BY m.category
          ORDER BY accuracy DESC, games DESC`,
      )
      .bind(user.id),
  ]);
  const row = totals?.results[0] ?? {};
  const stats: PlayerStats = {
    played: Number(row["played"] ?? 0),
    groupGames: Number(row["group_games"] ?? 0),
    wins: Number(row["wins"] ?? 0),
    categories: (categories?.results ?? []).map((c): CategoryStat => ({
      category: String(c["category"]),
      games: Number(c["games"]),
      accuracy: Number(c["accuracy"] ?? 0),
    })),
  };
  return Response.json({ stats }, { headers: { "Cache-Control": "no-store" } });
}

export async function exportMatches(env: Env, userId: string): Promise<MatchRecord[]> {
  // Page through, since D1 caps how many values one query can bind.
  const all: MatchRecord[] = [];
  let before = Number.MAX_SAFE_INTEGER;
  for (;;) {
    const page = await matchesFor(env, userId, before, 50);
    all.push(...page);
    if (page.length < 50) return all;
    before = page[page.length - 1]!.finishedAt;
  }
}

/** Daily tidy-up: expired sign-ins, and guest details past the claim window. */
export async function cleanUp(env: Env, now: number) {
  const cutoff = now - GUEST_CLAIM_WINDOW_MS;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
    env.DB.prepare("DELETE FROM auth_challenges WHERE expires_at < ?").bind(now),
    env.DB.prepare("DELETE FROM seen_questions WHERE seen_at < ?").bind(now - SEEN_KEEP_MS),
    env.DB.prepare("DELETE FROM activity WHERE at < ?").bind(now - 7 * 24 * 60 * 60 * 1000),
    env.DB.prepare("DELETE FROM recent_names WHERE at < ?").bind(now - 7 * 24 * 60 * 60 * 1000),
    // Rooms remove themselves when they close; this catches any that couldn't.
    env.DB.prepare("DELETE FROM live_rooms WHERE updated_at < ?").bind(now - 24 * 60 * 60 * 1000),
    env.DB.prepare("DELETE FROM player_days WHERE day < ?").bind(
      dayOf(now - 400 * 24 * 60 * 60 * 1000),
    ),
    env.DB.prepare("DELETE FROM question_reports WHERE created_at < ?").bind(
      now - 365 * 24 * 60 * 60 * 1000,
    ),
    // Network codes stop matching after a while (addresses get reused), so drop them then.
    env.DB.prepare("DELETE FROM visitor_networks WHERE last_day < ?").bind(
      dayOf(now - NETWORK_MATCH_DAYS * 24 * 60 * 60 * 1000),
    ),
    // Games nobody with an account played aren't anyone's history.
    env.DB.prepare(
      `DELETE FROM matches WHERE finished_at < ?
          AND NOT EXISTS (
            SELECT 1 FROM match_players WHERE match_id = matches.id AND user_id IS NOT NULL
          )`,
    ).bind(cutoff),
    env.DB.prepare(
      `UPDATE match_players SET guest_id = NULL
        WHERE guest_id IS NOT NULL
          AND match_id IN (SELECT id FROM matches WHERE finished_at < ?)`,
    ).bind(cutoff),
  ]);
}
