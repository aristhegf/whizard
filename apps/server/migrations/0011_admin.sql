-- The admin dashboard. Admins are marked by a workflow in GitHub Actions; there's no way to
-- become one from the site.
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;

-- The days each player played, by account or guest ID, for unique players and retention.
-- Rows older than 400 days are deleted.
CREATE TABLE player_days (
  viewer TEXT NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (viewer, day)
);

CREATE INDEX player_days_day ON player_days (day);

-- A short feed of what's happening, for the dashboard's live activity. Kept for 7 days. The
-- detail never names a player.
CREATE TABLE activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL
);

CREATE INDEX activity_at ON activity (at);

-- Questions an admin took out of play, whatever their reports say.
CREATE TABLE question_retired (
  question_id TEXT NOT NULL,
  version TEXT NOT NULL,
  retired_at INTEGER NOT NULL,
  PRIMARY KEY (question_id, version)
);

-- Every change an admin makes.
CREATE TABLE admin_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL
);
