-- Players' reports of questions that are wrong, unclear, out of date or offensive. Each person
-- counts once per question (by account, or their browser's guest ID). Reports belong to one
-- version of a question's wording, so fixing a question clears them. Enough reports on the
-- current version take the question out of play.
CREATE TABLE question_reports (
  question_id TEXT NOT NULL,
  version TEXT NOT NULL,
  category TEXT NOT NULL,
  reporter TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (question_id, version, reporter)
);

CREATE INDEX question_reports_category ON question_reports (category);

-- A version someone checked and decided to keep, whatever its reports say.
CREATE TABLE question_kept (
  question_id TEXT NOT NULL,
  version TEXT NOT NULL,
  kept_at INTEGER NOT NULL,
  PRIMARY KEY (question_id, version)
);
