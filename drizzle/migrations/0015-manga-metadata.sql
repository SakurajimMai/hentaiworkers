-- Manga metadata parsed from Telegram title cards.
-- Keep this migration idempotent for controlled production rollout.

ALTER TABLE mangas
  ADD COLUMN IF NOT EXISTS author VARCHAR(255) NULL AFTER title,
  ADD COLUMN IF NOT EXISTS tags TEXT NULL AFTER author;
