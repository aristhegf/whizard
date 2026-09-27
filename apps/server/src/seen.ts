import type { QuestionSeen } from "@whizard/content";
import type { RosterEntry } from "@whizard/game-core";
import type { Env } from "./env";

/** How long a player's history keeps a question out of their games. */
export const SEEN_KEEP_MS = 60 * 24 * 60 * 60 * 1000;

/** The key a player's history is kept under: their account, or else their browser's guest ID. */
export function viewerKey(player: Pick<RosterEntry, "account" | "guestId">): string | null {
  if (player.account) return `u:${player.account.userId}`;
  if (player.guestId) return `g:${player.guestId}`;
  return null;
}

/**
 * For each question in a category, how many of these players have seen it and when. A
 * failure returns nothing, so a game still starts, just without the history.
 */
export async function loadSeen(
  env: Env,
  viewers: string[],
  category: string,
): Promise<Map<string, QuestionSeen>> {
  const seen = new Map<string, QuestionSeen>();
  if (viewers.length === 0) return seen;
  try {
    const { results } = await env.DB.prepare(
      `SELECT question_id, COUNT(*) AS players, MAX(seen_at) AS last_seen_at
         FROM seen_questions
        WHERE category = ? AND viewer IN (${viewers.map(() => "?").join(", ")})
        GROUP BY question_id`,
    )
      .bind(category, ...viewers)
      .all<{ question_id: string; players: number; last_seen_at: number }>();
    for (const row of results) {
      seen.set(row.question_id, { players: row.players, lastSeenAt: row.last_seen_at });
    }
  } catch (error) {
    console.error("Couldn’t load question history", error);
  }
  return seen;
}

/** Remembers that these players were asked these questions. */
export async function recordSeen(
  env: Env,
  viewers: string[],
  category: string,
  questionIds: string[],
  now: number,
) {
  if (viewers.length === 0 || questionIds.length === 0) return;
  // One statement per player keeps each under D1's limit of 100 bound values.
  const ids = questionIds.slice(0, 24);
  const statements = viewers.map((viewer) =>
    env.DB.prepare(
      `INSERT INTO seen_questions (viewer, question_id, category, seen_at)
       VALUES ${ids.map(() => "(?, ?, ?, ?)").join(", ")}
       ON CONFLICT (viewer, question_id) DO UPDATE SET seen_at = excluded.seen_at`,
    ).bind(...ids.flatMap((id) => [viewer, id, category, now])),
  );
  try {
    await env.DB.batch(statements);
  } catch (error) {
    console.error("Couldn’t save question history", error);
  }
}
