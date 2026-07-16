-- Session invalidation support after password change / reset.
SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS session_version INT NOT NULL DEFAULT 1;
