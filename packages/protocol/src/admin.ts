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

// Questions and content ------------------------------------------------------------------------

/** Where a question comes from: the bank that ships, an admin's edit of one, or an admin's own. */
export type QuestionOrigin = "bank" | "edited" | "added";

/** In play, left out after 3 reports, or retired by an admin. */
export type QuestionPlay = "in_play" | "reported_out" | "retired";

export interface QuestionStats {
  /** Players who picked an answer, for the current wording. */
  answered: number;
  correct: number;
  timedOut: number;
  /** The wrong answers picked most, most first. */
  wrongPicks: { choice: string; picks: number }[];
}

export interface AdminQuestion {
  id: string;
  category: string;
  /** A sub-topic, e.g. "Genesis". */
  topic: string;
  difficulty: string;
  prompt: string;
  /** Four; the first is the correct answer. */
  choices: string[];
  explanation: string;
  reference: string | null;
  origin: QuestionOrigin;
  play: QuestionPlay;
  /** Reports on the current wording. */
  reports: number;
  stats: QuestionStats | null;
}

export interface AdminQuestionDetail extends AdminQuestion {
  /** The shipped wording, for an edited question. */
  original: QuestionInput | null;
}

export interface QuestionInput {
  topic: string;
  difficulty: string;
  prompt: string;
  choices: string[];
  explanation: string;
  reference: string | null;
}

export interface NewQuestionInput extends QuestionInput {
  category: string;
}

export interface AdminQuestionsSummary {
  totals: {
    inPlay: number;
    added: number;
    edited: number;
    outOfPlay: number;
    /** Answers recorded, across every question's current wording. */
    answers: number;
  };
  /** Questions in play for each topic and level. */
  coverage: { category: string; easy: number; medium: number; hard: number }[];
  /** Lowest share right, among questions with enough answers. */
  hardest: AdminQuestion[];
  easiest: AdminQuestion[];
  /** Questions whose answers suggest another level. */
  levelCheck: (AdminQuestion & { suggested: string })[];
  /** How many answers a question needs before it's ranked. */
  minAnswers: number;
}

export const QUESTION_FILTERS = ["all", "added", "edited", "out"] as const;
export type QuestionFilter = (typeof QUESTION_FILTERS)[number];

export const QUESTION_SORTS = ["id", "hardest", "played"] as const;
export type QuestionSort = (typeof QUESTION_SORTS)[number];

export interface AdminQuestionList {
  questions: AdminQuestion[];
  /** Questions matching the filters. */
  total: number;
  more: boolean;
}

// Payments --------------------------------------------------------------------------------------

/** Pro's monthly price in naira, as on the pricing page. */
export const PRO_MONTHLY_PRICE = 5000;

export const PAYMENT_METHODS = ["transfer", "cash", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** How long Pro can be recorded or given for, in months. 0 means it doesn't end. */
export const PRO_DURATIONS = [1, 3, 6, 12, 0] as const;

export interface ProMember {
  userId: string;
  username: string;
  displayName: string;
  avatar: string | null;
  since: number;
  /** null: doesn't end. */
  until: number | null;
  source: "paid" | "free";
}

export interface PaymentRecord {
  id: string;
  /** The payer's username when it was recorded; "Former member" once they delete their account. */
  username: string;
  amount: number;
  currency: string;
  months: number;
  method: PaymentMethod;
  note: string | null;
  paidAt: number;
  recordedBy: string | null;
}

export interface AdminPayments {
  totals: {
    members: number;
    /** Memberships ending in the next 7 days. */
    endingSoon: number;
    last30: number;
    allTime: number;
  };
  members: ProMember[];
  payments: PaymentRecord[];
  /** Whether a card payment provider is connected. Not yet. */
  provider: null;
}
