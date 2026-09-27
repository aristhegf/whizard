-- Which questions each player has been asked recently, so new games can avoid repeats. The
-- viewer is 'u:' + an account ID, or 'g:' + the random guest ID a browser sends when joining.
-- Rows older than 60 days are deleted.
CREATE TABLE seen_questions (
  viewer TEXT NOT NULL,
  question_id TEXT NOT NULL,
  category TEXT NOT NULL,
  seen_at INTEGER NOT NULL,
  PRIMARY KEY (viewer, question_id)
);

CREATE INDEX seen_questions_viewer ON seen_questions (viewer, category);
CREATE INDEX seen_questions_age ON seen_questions (seen_at);
