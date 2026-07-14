-- Align control-plane schema with domain ports (additive only).
SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE `crawler_job_attempts`
  ADD COLUMN IF NOT EXISTS `lease_expires_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    AFTER `lease_token_hash`;

ALTER TABLE `crawler_schedules`
  ADD COLUMN IF NOT EXISTS `max_active_jobs` INT UNSIGNED NOT NULL DEFAULT 1
    AFTER `catch_up_limit`,
  ADD COLUMN IF NOT EXISTS `config_snapshot_json` TEXT NULL
    AFTER `last_materialized_at`;

-- Backfill empty snapshots for existing rows so JSON_VALID can be enforced later.
UPDATE `crawler_schedules`
SET `config_snapshot_json` = '{}'
WHERE `config_snapshot_json` IS NULL;

ALTER TABLE `crawler_schedules`
  MODIFY COLUMN `config_snapshot_json` TEXT NOT NULL;

ALTER TABLE `storage_profile_versions`
  ADD COLUMN IF NOT EXISTS `storage_test_passed` TINYINT NOT NULL DEFAULT 0
    AFTER `config_json`;

CREATE TABLE IF NOT EXISTS `crawler_schedule_skips` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `schedule_id` BIGINT UNSIGNED NOT NULL,
  `scheduled_for` DATETIME NOT NULL,
  `reason` VARCHAR(255) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `crawler_schedule_skips_schedule_id_idx` (`schedule_id`),
  CONSTRAINT `crawler_schedule_skips_schedule_fk`
    FOREIGN KEY (`schedule_id`) REFERENCES `crawler_schedules` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `crawler_jobs`
  ADD COLUMN IF NOT EXISTS `next_retry_at` DATETIME NULL
    AFTER `retry_of_job_id`;
