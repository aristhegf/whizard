-- Admins can suspend an account: it can't sign in, and it's hidden from friend search and the
-- leaderboard. NULL means not suspended.
ALTER TABLE users ADD COLUMN suspended_at INTEGER;

-- Rooms open right now, kept up to date by each room and removed when it closes, for the
-- admin Rooms page. Nicknames are the ones everyone in the room already sees.
CREATE TABLE live_rooms (
  code TEXT PRIMARY KEY,
  game TEXT NOT NULL,
  topic TEXT,
  difficulty TEXT,
  questions INTEGER,
  phase TEXT NOT NULL,
  players INTEGER NOT NULL,
  online INTEGER NOT NULL,
  host TEXT,
  nicknames TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX live_rooms_updated ON live_rooms (updated_at);
