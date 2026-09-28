-- When an account last changed its username. A username can change once every 7 days.
ALTER TABLE users ADD COLUMN username_changed_at INTEGER;
