import type { CommunityStats, StatsEntry } from "@whizard/protocol";
import type { RequestContext } from "./http";
import { asAvatar } from "./sessions";

/** The numbers are the same for everyone, so they're worked out at most this often. */
const CACHE_SECONDS = 120;
const DAY_MS = 24 * 60 * 60 * 1000;
const TOP = 8;
const TRENDING = 5;
export const LEADERBOARD_SIZE = 20;

type Row = Record<string, unknown>;

const num = (value: unknown) => Number(value ?? 0);

function entries(rows: Row[] | undefined): StatsEntry[] {
  return (rows ?? []).map((r) => ({ name: String(r.name), count: num(r.count) }));
}

async function buildCommunityStats(db: D1Database, now: number): Promise<CommunityStats> {
  const [totals, rooms, games, topics, countries, trending, leaders] = await db.batch<Row>([
    db.prepare(
      `SELECT COUNT(*) AS games, SUM(player_count) AS players,
              SUM(CASE WHEN game = 'quiz' THEN rounds * player_count ELSE 0 END) AS questions
         FROM matches`,
    ),
    db.prepare("SELECT SUM(count) AS n FROM daily_counts WHERE metric = 'rooms_created'"),
    db.prepare(
      `SELECT game AS name, COUNT(*) AS count FROM matches
        GROUP BY game ORDER BY count DESC LIMIT ${TOP}`,
    ),
    db.prepare(
      `SELECT category AS name, COUNT(*) AS count FROM matches
        WHERE game = 'quiz' AND category IS NOT NULL
        GROUP BY category ORDER BY count DESC LIMIT ${TOP}`,
    ),
    db.prepare(
      `SELECT substr(metric, 9) AS name, SUM(count) AS count FROM daily_counts
        WHERE metric LIKE 'country:%' GROUP BY metric ORDER BY count DESC`,
    ),
    db
      .prepare(
        `SELECT game, CASE WHEN game = 'quiz' THEN category END AS category, COUNT(*) AS count
           FROM matches
          WHERE finished_at >= ? GROUP BY 1, 2
          ORDER BY count DESC LIMIT ${TRENDING}`,
      )
      .bind(now - DAY_MS),
    db.prepare(
      `SELECT u.username, u.display_name, u.avatar, COUNT(*) AS wins
         FROM match_players mp
         JOIN matches m ON m.id = mp.match_id
         JOIN users u ON u.id = mp.user_id
        WHERE mp.placing = 1 AND m.player_count >= 2 AND u.public_leaderboard = 1
          AND u.suspended_at IS NULL
        GROUP BY u.id
        ORDER BY wins DESC, MIN(m.finished_at) ASC
        LIMIT ${LEADERBOARD_SIZE}`,
    ),
  ]);

  const total = totals?.results?.[0] ?? {};
  const allCountries = entries(countries?.results);
  return {
    totals: {
      gamesPlayed: num(total.games),
      playersJoined: num(total.players),
      roomsCreated: num(rooms?.results?.[0]?.n),
      questionsPlayed: num(total.questions),
    },
    games: entries(games?.results),
    topics: entries(topics?.results),
    countries: allCountries.slice(0, TOP),
    countriesTotal: allCountries.reduce((sum, c) => sum + c.count, 0),
    trending: (trending?.results ?? []).map((r) => ({
      game: String(r.game),
      topic: r.category === null || r.category === undefined ? null : String(r.category),
      games: num(r.count),
    })),
    leaderboard: (leaders?.results ?? []).map((r) => ({
      username: String(r.username),
      displayName: String(r.display_name),
      avatar: asAvatar(r.avatar as string | null),
      wins: num(r.wins),
    })),
  };
}

/** `GET /api/community`: the public stats page's numbers. */
export async function getCommunityStats({ env, url, ctx }: RequestContext): Promise<Response> {
  const cacheKey = new Request(`${url.origin}/api/community`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const stats = await buildCommunityStats(env.DB, Date.now());
  const response = Response.json(stats, {
    headers: { "Cache-Control": `public, max-age=${CACHE_SECONDS}` },
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
