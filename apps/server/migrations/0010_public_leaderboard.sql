-- Whether a signed-in player chose to appear on the public leaderboard on the stats page.
-- Off unless they switch it on.
ALTER TABLE users ADD COLUMN public_leaderboard INTEGER NOT NULL DEFAULT 0;
