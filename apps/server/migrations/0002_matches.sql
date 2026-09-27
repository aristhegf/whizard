-- One row per finished game. Stats, head-to-head records and leaderboards are all queries over
-- these two tables, so adding a stat never means touching a game.

CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  game TEXT NOT NULL,
  category TEXT,
  difficulty TEXT,
  mode TEXT,
  rounds INTEGER NOT NULL,
  player_count INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER NOT NULL
);

CREATE INDEX matches_finished ON matches (finished_at);

-- Signed-in players have a user_id. Guests have a guest_id for a week, so a game can follow them
-- into an account they create; after that only their nickname is kept.
CREATE TABLE match_players (
  match_id TEXT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  placing INTEGER NOT NULL,
  user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  guest_id TEXT,
  nickname TEXT NOT NULL,
  score INTEGER NOT NULL,
  correct INTEGER,
  PRIMARY KEY (match_id, placing)
);

CREATE INDEX match_players_user ON match_players (user_id);
CREATE INDEX match_players_guest ON match_players (guest_id);
