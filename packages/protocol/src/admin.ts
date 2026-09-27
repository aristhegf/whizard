import type { SiteStats, StatsEntry, StatsRange } from "./stats";

/** A number this period, and the same number over the period before, for the change arrow. */
export interface Compared {
  value: number;
  previous: number;
}

export interface AdminOverview {
  range: StatsRange;
  kpis: {
    gamesPlayed: Compared;
    uniquePlayers: Compared;
    roomsCreated: Compared;
    /** Games finished out of games started, 0 to 1. */
    completionRate: { value: number | null; previous: number | null };
    avgPlayersPerRoom: { value: number | null; previous: number | null };
  };
  /** Finished games per UTC day, oldest first, every day of the range. */
  gamesPerDay: { day: string; count: number }[];
  games: StatsEntry[];
  topics: StatsEntry[];
  /** Games with more than one player, by size: "2", "3-5", "6-10", "11+". */
  playersPerGame: StatsEntry[];
  retention: {
    newPlayers: Compared;
    returningPlayers: Compared;
    /** Of players who first played in the range, how many came back within 1, 7 and 30 days. */
    day1: number | null;
    day7: number | null;
    day30: number | null;
  };
  /** New visitors by country code, biggest first, with the rest as "other". */
  countries: StatsEntry[];
  rooms: {
    invitesPerRoom: number | null;
    /** Rooms someone else joined. */
    joinRate: number | null;
    /** Finished games followed by another in the same room. */
    rematchRate: number | null;
    /** Rooms nobody else joined. */
    soloRate: number | null;
  };
  /** Reported questions waiting for a decision. */
  openReports: number;
}

export type ActivityKind = "room_created" | "player_joined" | "game_finished" | "account_created";

export interface ActivityItem {
  at: number;
  kind: ActivityKind;
  detail: Record<string, string | number | null>;
}

export type ReportStatus = "open" | "out" | "kept" | "retired";

export interface ReportedQuestion {
  questionId: string;
  category: string;
  difficulty: string;
  prompt: string;
  answer: string;
  reports: number;
  reasons: Record<string, number>;
  lastReportedAt: number;
  /** Open: under the threshold. Out: taken out of play by reports. Kept or retired: decided. */
  status: ReportStatus;
}

export const REPORT_ACTIONS = ["keep", "retire", "reopen"] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];

// Users ---------------------------------------------------------------------------------------

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  createdAt: number;
  admin: boolean;
  suspended: boolean;
  /** Finished games saved to the account's history. */
  games: number;
  /** First place in games with two or more players. */
  wins: number;
  /** The last UTC day they started a game, `YYYY-MM-DD`, or null. */
  lastPlayed: string | null;
}

export const USER_SORTS = ["newest", "games", "active"] as const;
export type UserSort = (typeof USER_SORTS)[number];

export interface AdminUsers {
  totals: {
    accounts: number;
    newThisWeek: number;
    /** Accounts that started a game in the last 7 days. */
    activeThisWeek: number;
    suspended: number;
  };
  users: AdminUser[];
  /** Whether there are more users after these. */
  more: boolean;
}

export const USER_ACTIONS = ["suspend", "unsuspend", "delete"] as const;
export type UserAction = (typeof USER_ACTIONS)[number];

// Rooms ---------------------------------------------------------------------------------------

export interface LiveRoom {
  code: string;
  game: string;
  topic: string | null;
  difficulty: string | null;
  questions: number | null;
  phase: "lobby" | "playing" | "finished";
  players: number;
  online: number;
  /** The host's nickname. */
  host: string | null;
  nicknames: string[];
  createdAt: number;
  updatedAt: number;
}

export interface AdminRooms {
  totals: { open: number; waiting: number; playing: number; online: number };
  rooms: LiveRoom[];
}

// Analytics -----------------------------------------------------------------------------------

export interface AdminAnalytics {
  stats: SiteStats;
  newVisitors: Compared;
  /** Visitors in the range who had first visited before it. */
  returningVisitors: number;
  visits: Compared;
  pageViews: Compared;
  accountsCreated: Compared;
  averageVisitSeconds: { value: number | null; previous: number | null };
  /** New visitors per UTC day, oldest first, every day of the range. */
  newVisitorsPerDay: { day: string; count: number }[];
}
