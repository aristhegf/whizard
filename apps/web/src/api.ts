import type { QuizCategory, QuizDifficulty } from "@whizard/game-core";
import type {
  ActivityItem,
  AdminAnalytics,
  AdminOverview,
  AdminRooms,
  AdminUsers,
  CommunityStats,
  ReportAction,
  ReportedQuestion,
  ReportReason,
  SiteStats,
  StatsRange,
  UserAction,
  UserSort,
} from "@whizard/protocol";
import { guestId } from "./storage";

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

export interface RoomStatus {
  code: string;
  phase: "lobby" | "playing" | "finished";
  online: number;
}

/** A room's status, or null if it no longer exists. */
export async function fetchRoomStatus(code: string): Promise<RoomStatus | null> {
  const response = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not check the room (${response.status})`);
  return (await response.json()) as RoomStatus;
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

export async function fetchCommunityStats(): Promise<CommunityStats> {
  const response = await fetch("/api/community");
  if (!response.ok) throw new Error(`Could not load stats (${response.status})`);
  return (await response.json()) as CommunityStats;
}

/** Reports a question. Signed-in players are known by their account; guests by their browser ID. */
export async function reportQuestion(questionId: string, reason: ReportReason): Promise<void> {
  const response = await fetch(`/api/questions/${encodeURIComponent(questionId)}/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason, guestId: guestId() }),
  });
  if (!response.ok) throw new Error(`Could not send the report (${response.status})`);
}

async function adminGet<T>(path: string): Promise<T> {
  const response = await fetch(`/api/admin/${path}`);
  if (!response.ok) throw new Error(`Could not load (${response.status})`);
  return (await response.json()) as T;
}

export const fetchAdminOverview = (range: StatsRange) =>
  adminGet<AdminOverview>(`overview?range=${range}`);
export const fetchAdminActivity = () =>
  adminGet<{ items: ActivityItem[] }>("activity").then((r) => r.items);
export const fetchAdminReports = () =>
  adminGet<{ questions: ReportedQuestion[] }>("reports").then((r) => r.questions);

export const fetchAdminUsers = (q: string, sort: UserSort, offset: number) =>
  adminGet<AdminUsers>(
    `users?${new URLSearchParams({ q, sort, offset: String(offset) }).toString()}`,
  );
export const fetchAdminRooms = () => adminGet<AdminRooms>("rooms");
export const fetchAdminAnalytics = (range: StatsRange) =>
  adminGet<AdminAnalytics>(`analytics?range=${range}`);

/** An admin action; throws with the server's message when it's refused. */
async function adminPost(path: string, body: unknown): Promise<void> {
  const response = await fetch(`/api/admin/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? `Could not save that (${response.status})`);
  }
}

export const decideReport = (questionId: string, action: ReportAction) =>
  adminPost(`reports/${encodeURIComponent(questionId)}`, { action });
export const manageUser = (userId: string, action: UserAction) =>
  adminPost(`users/${encodeURIComponent(userId)}`, { action });
export const closeRoom = (code: string) => adminPost(`rooms/${encodeURIComponent(code)}/close`, {});

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
