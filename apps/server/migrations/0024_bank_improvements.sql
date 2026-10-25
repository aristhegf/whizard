-- Migration 0024: Bank improvements
-- Adds question provenance (source) to user_bank_questions,
-- adds is_public visibility flag to user_banks,
-- and creates user_bank_ai_cache for caching AI generated answers.

ALTER TABLE user_bank_questions ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE user_banks ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;

CREATE TABLE user_bank_ai_cache (
  prompt_hash TEXT PRIMARY KEY,
  answer_index INTEGER NOT NULL,
  explanation TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX user_bank_ai_cache_created ON user_bank_ai_cache (created_at);
