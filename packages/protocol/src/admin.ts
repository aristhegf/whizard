import type { StatsEntry, StatsRange } from "./stats";

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
