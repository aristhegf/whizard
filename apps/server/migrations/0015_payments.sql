-- Pro memberships. For now admins record them by hand: a payment someone made directly (such
-- as a bank transfer), or Pro given for free. `until` NULL means it doesn't end.
CREATE TABLE pro_memberships (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  since INTEGER NOT NULL,
  until INTEGER,
  -- paid or free
  source TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Payments admins recorded. Kept for the accounts when the payer deletes their account, with
-- the link to it removed.
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  username TEXT NOT NULL,
  -- Whole naira.
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  months INTEGER NOT NULL,
  -- transfer, cash or other
  method TEXT NOT NULL,
  note TEXT,
  paid_at INTEGER NOT NULL,
  recorded_by TEXT
);

CREATE INDEX payments_paid_at ON payments (paid_at);
