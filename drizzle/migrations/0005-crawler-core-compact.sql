-- Compact crawler runtime state into nine core tables (additive/backfill phase).
-- Destructive legacy-table cleanup is performed only by scripts/compact-crawler-schema.mjs.
SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE `crawler_profiles`
  ADD COLUMN IF NOT EXISTS `version` INT UNSIGNED NOT NULL DEFAULT 1 AFTER `name`,
  ADD COLUMN IF NOT EXISTS `schema_version` INT UNSIGNED NOT NULL DEFAULT 1 AFTER `version`,
  ADD COLUMN IF NOT EXISTS `config_json` TEXT NULL AFTER `schema_version`;

UPDATE `crawler_profiles` p
INNER JOIN `crawler_profile_versions` v ON v.id = p.current_version_id
SET p.version = v.version,
    p.schema_version = v.schema_version,
    p.config_json = v.config_json
WHERE p.config_json IS NULL;

UPDATE `crawler_profiles`
SET `config_json` = '{}'
WHERE `config_json` IS NULL;

ALTER TABLE `crawler_profiles`
  MODIFY COLUMN `config_json` TEXT NOT NULL;

ALTER TABLE `crawler_schedules`
  ADD COLUMN IF NOT EXISTS `profile_version_id` BIGINT UNSIGNED NULL AFTER `profile_id`;

UPDATE `crawler_schedules`
SET `profile_version_id` = `profile_id`
WHERE `profile_version_id` IS NULL;

ALTER TABLE `crawler_schedules`
  MODIFY COLUMN `profile_version_id` BIGINT UNSIGNED NOT NULL;

ALTER TABLE `crawler_workers`
  ADD COLUMN IF NOT EXISTS `token_hash` BINARY(32) NULL AFTER `is_enabled`,
  ADD COLUMN IF NOT EXISTS `scope_json` TEXT NULL AFTER `token_hash`,
  ADD COLUMN IF NOT EXISTS `token_revoked` TINYINT NOT NULL DEFAULT 0 AFTER `scope_json`,
  ADD COLUMN IF NOT EXISTS `token_expires_at` DATETIME NULL AFTER `token_revoked`,
  ADD UNIQUE KEY IF NOT EXISTS `crawler_workers_token_hash_uidx` (`token_hash`);

UPDATE `crawler_workers` w
INNER JOIN `worker_credentials` c ON c.worker_id = w.id
SET w.token_hash = c.token_hash,
    w.scope_json = c.scope_json,
    w.token_revoked = c.is_revoked,
    w.token_expires_at = c.expires_at
WHERE w.token_hash IS NULL
  AND c.id = (
    SELECT MAX(c2.id)
    FROM `worker_credentials` c2
    WHERE c2.worker_id = w.id
  );

UPDATE `crawler_workers`
SET `scope_json` = '[]'
WHERE `scope_json` IS NULL;

ALTER TABLE `crawler_workers`
  MODIFY COLUMN `scope_json` TEXT NOT NULL;
