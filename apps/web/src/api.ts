import type { QuizCategory, QuizDifficulty } from "@whizard/game-core";
import type {
  ActivityItem,
  AdminAnalytics,
  AdminGames,
  AdminModeration,
  AdminPayments,
  PaymentMethod,
  AdminSettings,
  NameAction,
  SiteSettings,
  AdminOverview,
  AdminQuestionDetail,
  AdminQuestionList,
  AdminQuestionsSummary,
  NewQuestionInput,
  QuestionFilter,
  QuestionInput,
  QuestionSort,
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

/** The server said no and said why, e.g. "New rooms are paused for a little while." */
export class ServerRefusal extends Error {}

/** Makes a room, optionally with game settings already chosen (such as a topic). */
/** Opens a room for a game (the quiz unless named), optionally with its settings preset. */
export async function createRoom(
  settings?: Record<string, unknown>,
  game?: string,
): Promise<string> {
  const response = await fetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...(game ? { game } : {}), ...(settings ? { settings } : {}) }),
  });
  if (!response.ok) {
    const refusal = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    if (response.status !== 429 && refusal?.error?.message) {
      throw new ServerRefusal(refusal.error.message);
    }
    throw new Error(`Could not create a room (${response.status})`);
  }
  const body = (await response.json()) as { code: string };
  return body.code;
}

export interface RoomStatus {
  code: string;
  phase: "lobby" | "playing" | "finished";
  online: number;
  /** No room for anyone new. */
  full: boolean;
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

export const fetchQuestionsSummary = () => adminGet<AdminQuestionsSummary>("questions/summary");
export const fetchAdminQuestions = (query: {
  category: string;
  difficulty: string;
  q: string;
  filter: QuestionFilter;
  sort: QuestionSort;
  offset: number;
}) =>
  adminGet<AdminQuestionList>(
    `questions?${new URLSearchParams({ ...query, offset: String(query.offset) }).toString()}`,
  );
export const fetchAdminQuestion = (id: string) =>
  adminGet<AdminQuestionDetail>(`questions/${encodeURIComponent(id)}`);

/** An admin action; throws with the server's message when it's refused. */
async function adminPost<T = unknown>(path: string, body: unknown, method = "POST"): Promise<T> {
  const response = await fetch(`/api/admin/${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? `Could not save that (${response.status})`);
  }
  return (await response.json()) as T;
}

export const decideReport = (questionId: string, action: ReportAction) =>
  adminPost(`reports/${encodeURIComponent(questionId)}`, { action });
export const manageUser = (userId: string, action: UserAction) =>
  adminPost(`users/${encodeURIComponent(userId)}`, { action });
export const closeRoom = (code: string) => adminPost(`rooms/${encodeURIComponent(code)}/close`, {});
export const saveQuestion = (id: string, input: QuestionInput) =>
  adminPost<{ id: string }>(`questions/${encodeURIComponent(id)}`, input, "PATCH");
export const addQuestion = (input: NewQuestionInput) =>
  adminPost<{ id: string }>("questions", input);
export const fetchModeration = () => adminGet<AdminModeration>("moderation");
export const addBlockedWord = (word: string, anywhere: boolean) =>
  adminPost("moderation/words", { word, anywhere });
export const removeBlockedWord = (word: string) =>
  adminPost(`moderation/words/${encodeURIComponent(word)}`, undefined, "DELETE");
export const actOnName = (id: number, action: NameAction) =>
  adminPost(`moderation/names/${id}`, { action });

export const fetchAdminSettings = () => adminGet<AdminSettings>("settings");
export const fetchAdminGames = () => adminGet<AdminGames>("games");
export const fetchAdminPayments = () => adminGet<AdminPayments>("payments");
export const recordPayment = (payment: {
  username: string;
  amount: number;
  months: number;
  method: PaymentMethod;
  note: string | null;
}) => adminPost("payments", payment);
export const giveProFree = (username: string, months: number) =>
  adminPost("pro", { username, months });
export const endPro = (userId: string) =>
  adminPost(`pro/${encodeURIComponent(userId)}`, undefined, "DELETE");
export const updateSettings = (update: Partial<SiteSettings>) =>
  adminPost("settings", update, "PATCH");
export const grantAdmin = (username: string) => adminPost("admins", { username });
export const revokeAdmin = (id: string) =>
  adminPost(`admins/${encodeURIComponent(id)}`, undefined, "DELETE");

/** What every page needs to know, such as an announcement. */
export async function fetchSite(): Promise<SiteSettings> {
  const response = await fetch("/api/site");
  if (!response.ok) throw new Error(`Could not load (${response.status})`);
  return (await response.json()) as SiteSettings;
}

export const revertQuestion = (id: string) =>
  adminPost(`questions/${encodeURIComponent(id)}`, undefined, "DELETE");

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
