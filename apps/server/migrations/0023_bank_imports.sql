-- CSV imports for a player's own bank, staged before anything is written in. One import row
-- per line of the file, holding the question as uploaded while the owner reviews it; rows
-- without an answer may still be waiting for the AI. Committed imports are deleted in the same
-- batch that inserts the questions, so an import either lands whole or not at all. Deleting the
-- bank or the account deletes its unfinished imports with it.
CREATE TABLE user_bank_imports (
  id TEXT PRIMARY KEY, -- "imp_" prefix, like the banks' "b_"/"q_"
  owner_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  bank_id TEXT NOT NULL REFERENCES user_banks (id) ON DELETE CASCADE,
  total INTEGER NOT NULL, -- how many rows the file had that could be staged
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX user_bank_imports_bank ON user_bank_imports (bank_id, created_at);
CREATE INDEX user_bank_imports_owner ON user_bank_imports (owner_id, created_at);

-- One staged row. `choices` is the file's four options as they came (JSON array), with
-- `answer_index` pointing into it — not yet rotated into the bank's "correct first" shape,
-- which happens at commit. `review` is empty when the row is ready to import.
CREATE TABLE user_bank_import_rows (
  import_id TEXT NOT NULL REFERENCES user_bank_imports (id) ON DELETE CASCADE,
  idx INTEGER NOT NULL, -- 0-based position among the file's rows
  row_number INTEGER NOT NULL, -- the file's own line number, for messages
  prompt TEXT NOT NULL,
  choices TEXT NOT NULL,
  answer_index INTEGER, -- 0–3 into choices; null while unanswered
  explanation TEXT NOT NULL,
  reference TEXT,
  source TEXT NOT NULL, -- "key" | "ai" | "manual" | "none"
  review TEXT NOT NULL DEFAULT '',
  ai_explanation TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (import_id, idx)
);

CREATE INDEX user_bank_import_rows_pending ON user_bank_import_rows (import_id, answer_index);
