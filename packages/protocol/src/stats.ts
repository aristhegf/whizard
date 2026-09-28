/** The public stats page. Every number is a total; nothing names a person. */

export const STATS_RANGES = [7, 30, 90] as const;

export type StatsRange = (typeof STATS_RANGES)[number];

export interface StatsDay {
  /** UTC day, `YYYY-MM-DD`. */
  day: string;
  visitors: number;
  games: number;
}

export interface StatsEntry {
  name: string;
  count: number;
}

export interface SiteStats {
  range: StatsRange;
  totals: {
    /** Different browsers that visited in the range. */
    visitors: number;
    visits: number;
    pageViews: number;
    roomsCreated: number;
    gamesPlayed: number;
    players: number;
    /** Average visit length in seconds, or null before any visit has ended. */
    averageVisitSeconds: number | null;
  };
  /** Every day of the range, oldest first, including days with nothing. */
  days: StatsDay[];
  pages: StatsEntry[];
  sources: StatsEntry[];
  countries: StatsEntry[];
  devices: StatsEntry[];
  topics: StatsEntry[];
  modes: StatsEntry[];
}

/**
 * The public stats page: all-time totals and what people play. Players are only named if they
 * switched on "Show me on the public leaderboard".
 */
export interface CommunityStats {
  totals: {
    /** Finished games. */
    gamesPlayed: number;
    /** Seats taken in finished games: one player in three games counts three times. */
    playersJoined: number;
    roomsCreated: number;
    /** Questions put to players: each question counts once per player in the game. */
    questionsPlayed: number;
  };
  /** Finished games by game id, most played first. */
  games: StatsEntry[];
  /** Finished quiz games by topic id, most played first. */
  topics: StatsEntry[];
  /** Visitors by country code, most first. */
  countries: StatsEntry[];
  /** All visitors with a known or unknown country, so the page can show shares. */
  countriesTotal: number;
  /** What's been played in the last 24 hours, most first. */
  trending: TrendingEntry[];
  /** Most wins in games with two or more players, among players who opted in. */
  leaderboard: LeaderboardEntry[];
}

export interface TrendingEntry {
  game: string;
  /** The quiz topic, for quiz games. */
  topic: string | null;
  games: number;
}

export interface LeaderboardEntry {
  username: string;
  displayName: string;
  /** A built-in avatar or one from the avatar creator, or null. */
  avatar: string | null;
  wins: number;
}
