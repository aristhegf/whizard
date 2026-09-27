-- A request waits until the other person accepts. Asking someone who already asked you
-- makes you friends straight away.
CREATE TABLE friend_requests (
  from_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id)
);

CREATE INDEX friend_requests_to ON friend_requests (to_id);

-- Two rows per friendship, one each way, so each side keeps its own settings (such as muting
-- the other's pings).
CREATE TABLE friends (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  friend_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  muted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);

-- A saved set of friends with its own leaderboards. Every member can see it; the owner edits it.
CREATE TABLE friend_groups (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE friend_group_members (
  group_id TEXT NOT NULL REFERENCES friend_groups (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX friend_group_members_user ON friend_group_members (user_id);
