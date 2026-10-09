import { questionCounts } from "@whizard/content";
import { GAME_IDS } from "@whizard/game-core";
import type { AdminGames } from "@whizard/protocol";
import { requireAdmin } from "./admin";
import { dayOf } from "./analytics";
import { loadBank } from "./bank";
import type { RequestContext } from "./http";
import { outOfPlay } from "./reports";
import { forgetSettings, siteSettings } from "./settings";
import { getTopics } from "./topics";

const DAY_MS = 24 * 60 * 60 * 1000;

/** `GET /api/admin/games`: the switches, and how much each game and topic is played. */
export async function getAdminGames(context: RequestContext): Promise<Response> {
  await requireAdmin(context);
  const { env } = context;
  const now = Date.now();
  forgetSettings();
  const bank = await loadBank(env);
  const [settings, out, topics, { results }] = await Promise.all([
    siteSettings(env),
    outOfPlay(env, bank),
    getTopics(env),
    env.DB.prepare(
      `SELECT day, metric, count FROM daily_counts
        WHERE day >= ? AND (metric LIKE 'game:%' OR metric LIKE 'topic:%')`,
    )
      .bind(dayOf(now - 29 * DAY_MS))
      .all<{ day: string; metric: string; count: number }>(),
  ]);
  const weekStart = dayOf(now - 6 * DAY_MS);
  const sum = (metric: string, since?: string) =>
    results
      .filter((r) => r.metric === metric && (!since || r.day >= since))
      .reduce((total, r) => total + r.count, 0);
  const inPlay = questionCounts(bank.questions.filter((q) => !out.has(q.id)));
  const gameIds = [
    ...new Set(results.filter((r) => r.metric.startsWith("game:")).map((r) => r.metric.slice(5))),
  ];

  const body: AdminGames = {
    settings,
    // Every playable game, so it can be switched off before anyone has played it.
    games: [...new Set([...GAME_IDS, ...gameIds])].map((id) => ({
      id,
      last30: sum(`game:${id}`),
      last7: sum(`game:${id}`, weekStart),
    })),
    // The live catalogue, so topics admins add show up with their counts.
    topics: topics.map((topic) => {
      const levels = inPlay[topic.id];
      return {
        id: topic.id,
        questions: levels ? levels.easy + levels.medium + levels.hard : 0,
        last30: sum(`topic:${topic.id}`),
      };
    }),
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
