-- Tied players share a placing (Most Likely To, Reaction and others give equal scores the same
-- place), but a match's players were keyed by (match, placing), so any game with a tie failed to
-- save: nobody in it got the game in their history or stats. A match's players are now rows found
-- by their match, with no key on the placing. SQLite can't drop a key in place, so the table is
-- rebuilt and every row copied across.
CREATE TABLE match_players_next (
  match_id TEXT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  placing INTEGER NOT NULL,
  user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  guest_id TEXT,
  nickname TEXT NOT NULL,
  score INTEGER NOT NULL,
  correct INTEGER,
  best_ms INTEGER
);

INSERT INTO match_players_next
  (match_id, placing, user_id, guest_id, nickname, score, correct, best_ms)
SELECT match_id, placing, user_id, guest_id, nickname, score, correct, best_ms
FROM match_players;

DROP TABLE match_players;

ALTER TABLE match_players_next RENAME TO match_players;

CREATE INDEX match_players_match ON match_players (match_id, placing);
CREATE INDEX match_players_user ON match_players (user_id);
CREATE INDEX match_players_guest ON match_players (guest_id);
