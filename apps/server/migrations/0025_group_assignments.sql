-- Migration 0025: Study group assignments and member completions
CREATE TABLE group_bank_assignments (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES friend_groups (id) ON DELETE CASCADE,
  bank_id TEXT NOT NULL REFERENCES user_banks (id) ON DELETE CASCADE,
  assigned_by TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  target_score INTEGER,
  due_at INTEGER,
  notes TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX group_bank_assignments_group ON group_bank_assignments (group_id, created_at);

CREATE TABLE group_assignment_completions (
  assignment_id TEXT NOT NULL REFERENCES group_bank_assignments (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  accuracy_percent INTEGER NOT NULL,
  attempts_count INTEGER NOT NULL DEFAULT 1,
  completed_at INTEGER NOT NULL,
  PRIMARY KEY (assignment_id, user_id)
);

CREATE INDEX group_assignment_completions_user ON group_assignment_completions (user_id);
