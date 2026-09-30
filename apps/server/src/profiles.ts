import type { PlayerProfile, SharedMatch } from "@whizard/protocol";
import { requireUser } from "./account";
import type { Env } from "./env";
import { findUser, relationBetween, toPublic } from "./friends";
import type { RequestContext } from "./http";

/** How many of the latest games you both played the page lists. */
const TOGETHER_LIMIT = 10;

/**
 * Someone's profile as `viewerId` sees it. Anyone signed in gets their name, avatar and how
 * you're connected; their games and record are for friends only.
 */
export async function playerProfile(
  env: Env,
  viewerId: string,
  username: string,
): Promise<PlayerProfile> {
  const other = await findUser(env, username);
  const relation = await relationBetween(env, viewerId, other.id);
  const user = toPublic(other);
  if (relation !== "friend") return { user, relation, friend: null };

  const db = env.DB;
  const [link, record, stats, top, together] = await db.batch<
    Record<string, number | string | null>
  >([
    db
      .prepare("SELECT created_at, muted FROM friends WHERE user_id = ? AND friend_id = ?")
      .bind(viewerId, other.id),
    // Games you both finished: whoever placed higher won it.
    db
      .prepare(
        `SELECT COUNT(*) AS games,
                COALESCE(SUM(me.placing < them.placing), 0) AS wins,
                COALESCE(SUM(me.placing > them.placing), 0) AS losses
           FROM match_players me
           JOIN match_players them ON them.match_id = me.match_id AND them.user_id = ?2
          WHERE me.user_id = ?1`,
      )
      .bind(viewerId, other.id),
    db
      .prepare(
        `SELECT COUNT(*) AS played,
                COALESCE(SUM(m.player_count > 1 AND mp.placing = 1), 0) AS wins
           FROM match_players mp JOIN matches m ON m.id = mp.match_id
          WHERE mp.user_id = ?`,
      )
      .bind(other.id),
    db
      .prepare(
        `SELECT m.game, COUNT(*) AS played
           FROM match_players mp JOIN matches m ON m.id = mp.match_id
          WHERE mp.user_id = ?
          GROUP BY m.game
          ORDER BY played DESC, MAX(m.finished_at) DESC
          LIMIT 1`,
      )
      .bind(other.id),
    db
      .prepare(
        `SELECT m.id, m.game, m.category, m.difficulty, m.mode, m.finished_at, m.player_count,
                me.placing AS my_placing, them.placing AS their_placing
           FROM match_players me
           JOIN match_players them ON them.match_id = me.match_id AND them.user_id = ?2
           JOIN matches m ON m.id = me.match_id
          WHERE me.user_id = ?1
          ORDER BY m.finished_at DESC
          LIMIT ${TOGETHER_LIMIT}`,
      )
      .bind(viewerId, other.id),
  ]);

  const friendship = link?.results[0] ?? {};
  const counts = record?.results[0] ?? {};
  const totals = stats?.results[0] ?? {};
  const topGame = top?.results[0]?.["game"];
  return {
    user,
    relation,
    friend: {
      since: Number(friendship["created_at"] ?? 0),
      muted: Number(friendship["muted"] ?? 0) === 1,
      record: {
        games: Number(counts["games"] ?? 0),
        wins: Number(counts["wins"] ?? 0),
        losses: Number(counts["losses"] ?? 0),
      },
      stats: {
        played: Number(totals["played"] ?? 0),
        wins: Number(totals["wins"] ?? 0),
        topGame: typeof topGame === "string" ? topGame : null,
      },
      together: (together?.results ?? []).map((m): SharedMatch => ({
        id: String(m["id"]),
        game: String(m["game"]),
        category: m["category"] === null ? null : String(m["category"]),
        difficulty: m["difficulty"] === null ? null : String(m["difficulty"]),
        mode: m["mode"] === null ? null : String(m["mode"]),
        finishedAt: Number(m["finished_at"]),
        playerCount: Number(m["player_count"]),
        myPlacing: Number(m["my_placing"]),
        theirPlacing: Number(m["their_placing"]),
      })),
    },
  };
}

export async function getProfile(context: RequestContext): Promise<Response> {
  const { user } = await requireUser(context);
  const profile = await playerProfile(
    context.env,
    user.id,
    decodeURIComponent(context.params[0] ?? ""),
  );
  return Response.json(profile, { headers: { "Cache-Control": "no-store" } });
}
