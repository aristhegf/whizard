import type { QuizCategory, QuizDifficulty } from "@whizard/game-core";
import type { SiteStats, StatsRange } from "@whizard/protocol";

/** Makes a room, optionally with game settings already chosen (such as a topic). */
export async function createRoom(settings?: Record<string, unknown>): Promise<string> {
  const response = await fetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings ? { settings } : {}),
  });
  if (!response.ok) throw new Error(`Could not create a room (${response.status})`);
  const body = (await response.json()) as { code: string };
  return body.code;
}

export function roomSocketUrl(code: string): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/api/rooms/${encodeURIComponent(code)}/ws`;
}

export async function fetchSiteStats(range: StatsRange): Promise<SiteStats> {
  const response = await fetch(`/api/stats?range=${range}`);
  if (!response.ok) throw new Error(`Could not load stats (${response.status})`);
  return (await response.json()) as SiteStats;
}

export interface QuizCategoryInfo {
  id: QuizCategory;
  name: string;
  questions: Record<QuizDifficulty, number>;
}

export async function fetchQuizCategories(): Promise<QuizCategoryInfo[]> {
  const response = await fetch("/api/quiz/categories");
  if (!response.ok) throw new Error(`Could not load categories (${response.status})`);
  const body = (await response.json()) as { categories: QuizCategoryInfo[] };
  return body.categories;
}
