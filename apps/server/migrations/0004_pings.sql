-- Web Push: one row per browser that turned pings on.
CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX push_subscriptions_user ON push_subscriptions (user_id);

-- Keys the server makes for itself, such as the VAPID key pair that signs pings.
CREATE TABLE server_keys (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Whether to get pings at all, and quiet hours as minutes after midnight in the user's time zone.
ALTER TABLE users ADD COLUMN pings INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN quiet_start INTEGER;
ALTER TABLE users ADD COLUMN quiet_end INTEGER;
ALTER TABLE users ADD COLUMN time_zone TEXT;

-- So one person can't ping another over and over.
ALTER TABLE friends ADD COLUMN last_pinged_at INTEGER;
