-- Site stats. Nothing here names a person: no IP addresses, nicknames or accounts.

-- One row per browser that has visited, keyed by a random ID the browser keeps. It's only used
-- to tell new visitors from returning ones.
CREATE TABLE visitors (
  id TEXT PRIMARY KEY,
  first_day TEXT NOT NULL,
  last_day TEXT NOT NULL
);

-- Everyone who visited since a day is exactly everyone whose last visit is on or after it.
CREATE INDEX visitors_last_day ON visitors (last_day);

-- Daily totals, one row per UTC day and metric, e.g. ('2026-09-27', 'games_started', 14).
-- Breakdowns use a prefix: 'page:games', 'topic:bible', 'country:NG', 'source:whatsapp'.
-- 'online_peak' holds the day's highest "here now" count rather than a sum.
CREATE TABLE daily_counts (
  day TEXT NOT NULL,
  metric TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (day, metric)
);
