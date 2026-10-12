-- A signed-in player's own question bank: private to them, kept apart from the bank that ships
-- with the Worker and from the admin overlay in custom_questions (which has no owner and
-- replaces wording globally). Ids carry a "b_"/"q_" prefix so they can never collide with the
-- shipped bank's topic-NNN ids or the admin overlay's. Deleting the account deletes its banks.
CREATE TABLE user_banks (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  exam TEXT, -- an optional label, e.g. "WAEC"
  subject TEXT, -- an optional label, e.g. "Biology"
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX user_banks_owner ON user_banks (owner_id, updated_at);

-- Questions inside a bank. `choices` is a JSON array of four; the first is the correct answer,
-- the same shape the shipped bank uses (kept until gate G1 extends the question schema).
CREATE TABLE user_bank_questions (
  id TEXT PRIMARY KEY,
  bank_id TEXT NOT NULL REFERENCES user_banks (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  choices TEXT NOT NULL,
  explanation TEXT NOT NULL,
  reference TEXT, -- an optional verse/source note, e.g. John 3:16
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX user_bank_questions_bank ON user_bank_questions (bank_id, position);
