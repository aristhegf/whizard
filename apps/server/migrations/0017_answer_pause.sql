-- How quickly the next quiz question comes after answering: a 3-second pause (1), or straight on
-- after a 1-second glance at the result (0).
ALTER TABLE users ADD COLUMN pause_after_answer INTEGER NOT NULL DEFAULT 0;

-- Explanations after each question now apply to solo games only, where everyone used to see
-- them, so everyone starts with them on. New accounts get the same.
UPDATE users SET show_explanations = 1;
