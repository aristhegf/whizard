-- Questions added or edited from the admin Content page, layered over the bank that ships with
-- the Worker. A row with a bank question's ID replaces it; any other ID is a new question.
CREATE TABLE custom_questions (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  topic TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  prompt TEXT NOT NULL,
  -- JSON array of four; the first is the correct answer.
  choices TEXT NOT NULL,
  explanation TEXT NOT NULL,
  reference TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);

CREATE INDEX custom_questions_category ON custom_questions (category);

-- How each question's current wording has gone in finished games. Editing a question gives it a
-- new version, so its numbers start again.
CREATE TABLE question_stats (
  question_id TEXT NOT NULL,
  version TEXT NOT NULL,
  answered INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  timed_out INTEGER NOT NULL,
  PRIMARY KEY (question_id, version)
);

-- Wrong answers players picked, by their text.
CREATE TABLE question_wrong_picks (
  question_id TEXT NOT NULL,
  version TEXT NOT NULL,
  choice TEXT NOT NULL,
  picks INTEGER NOT NULL,
  PRIMARY KEY (question_id, version, choice)
);
