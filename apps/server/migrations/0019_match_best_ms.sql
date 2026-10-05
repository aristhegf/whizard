-- The player's fastest single tap in a game of Reaction, kept with the match so the profile can
-- show "Fastest reaction" and a history row can show the time. NULL for every other game.
ALTER TABLE match_players ADD COLUMN best_ms INTEGER;
