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
