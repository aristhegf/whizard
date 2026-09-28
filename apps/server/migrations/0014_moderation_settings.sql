-- Words names can't use, kept by admins on the Moderation page.
CREATE TABLE blocked_words (
  word TEXT PRIMARY KEY,
  -- 1: also inside other words. 0: only as a word of its own.
  anywhere INTEGER NOT NULL DEFAULT 0,
  added_at INTEGER NOT NULL,
  added_by TEXT
);

-- Names players chose recently, for admins to look over. Deleted after 7 days.
CREATE TABLE recent_names (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  -- nickname, account or group
  kind TEXT NOT NULL,
  -- What an action applies to: a room code, a user ID or a group ID.
  target TEXT NOT NULL,
  -- Shown with the name: the room code, or the account's @username.
  detail TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE INDEX recent_names_at ON recent_names (at);

-- Site switches from the admin Settings page.
CREATE TABLE site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
