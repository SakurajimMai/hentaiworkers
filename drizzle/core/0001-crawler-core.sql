-- Fresh-install crawler schema: nine runtime tables for external-URL ingestion.
SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `crawler_profiles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(128) NOT NULL,
  `version` INT UNSIGNED NOT NULL DEFAULT 1,
  `schema_version` INT UNSIGNED NOT NULL DEFAULT 1,
  `config_json` TEXT NOT NULL,
  `is_enabled` TINYINT NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `crawler_profiles_config_json_valid` CHECK (JSON_VALID(`config_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `crawler_schedules` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `profile_id` BIGINT UNSIGNED NOT NULL,
  `profile_version_id` BIGINT UNSIGNED NOT NULL,
  `storage_profile_version_id` BIGINT UNSIGNED NULL,
  `name` VARCHAR(128) NOT NULL,
  `kind` ENUM('manual', 'interval', 'daily', 'weekly', 'cron') NOT NULL,
  `cron_expression` VARCHAR(64) NULL,
  `interval_seconds` INT UNSIGNED NULL,
  `timezone` VARCHAR(64) NOT NULL DEFAULT 'UTC',
  `overlap_policy` ENUM('skip', 'queue', 'parallel') NOT NULL DEFAULT 'skip',
  `misfire_policy` ENUM('skip', 'latest_only', 'catch_up') NOT NULL DEFAULT 'latest_only',
  `catch_up_limit` TINYINT NOT NULL DEFAULT 3,
  `max_active_jobs` INT UNSIGNED NOT NULL DEFAULT 1,
  `is_enabled` TINYINT NOT NULL DEFAULT 1,
  `next_run_at` DATETIME NULL,
  `last_materialized_at` DATETIME NULL,
  `config_snapshot_json` TEXT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `crawler_schedules_profile_id_idx` (`profile_id`),
  CONSTRAINT `crawler_schedules_profile_fk` FOREIGN KEY (`profile_id`) REFERENCES `crawler_profiles` (`id`),
  CONSTRAINT `crawler_schedules_config_json_valid` CHECK (JSON_VALID(`config_snapshot_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `crawler_workers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(128) NOT NULL,
  `version` VARCHAR(64) NOT NULL,
  `capabilities_json` TEXT NOT NULL,
  `last_heartbeat_at` DATETIME NULL,
  `is_enabled` TINYINT NOT NULL DEFAULT 1,
  `token_hash` BINARY(32) NULL,
  `scope_json` TEXT NOT NULL,
  `token_revoked` TINYINT NOT NULL DEFAULT 0,
  `token_expires_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `crawler_workers_token_hash_uidx` (`token_hash`),
  CONSTRAINT `crawler_workers_capabilities_json_valid` CHECK (JSON_VALID(`capabilities_json`)),
  CONSTRAINT `crawler_workers_scope_json_valid` CHECK (JSON_VALID(`scope_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `crawler_jobs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `kind` ENUM('crawl', 'storage_test', 'cleanup') NOT NULL DEFAULT 'crawl',
  `status` ENUM('queued', 'leased', 'running', 'retry_wait', 'cancel_requested', 'succeeded', 'partial_succeeded', 'failed', 'cancelled') NOT NULL DEFAULT 'queued',
  `profile_id` BIGINT UNSIGNED NULL,
  `profile_version_id` BIGINT UNSIGNED NULL,
  `storage_profile_version_id` BIGINT UNSIGNED NULL,
  `schedule_id` BIGINT UNSIGNED NULL,
  `scheduled_for` DATETIME NULL,
  `config_snapshot_json` TEXT NOT NULL,
  `attempt_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `max_attempts` INT UNSIGNED NOT NULL DEFAULT 3,
  `lease_worker_id` BIGINT UNSIGNED NULL,
  `lease_expires_at` DATETIME NULL,
  `progress_json` TEXT NULL,
  `retry_of_job_id` BIGINT UNSIGNED NULL,
  `next_retry_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `started_at` DATETIME NULL,
  `finished_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `crawler_jobs_schedule_scheduled_for_uidx` (`schedule_id`, `scheduled_for`),
  KEY `crawler_jobs_status_idx` (`status`),
  KEY `crawler_jobs_profile_id_idx` (`profile_id`),
  CONSTRAINT `crawler_jobs_schedule_fk` FOREIGN KEY (`schedule_id`) REFERENCES `crawler_schedules` (`id`),
  CONSTRAINT `crawler_jobs_config_snapshot_json_valid` CHECK (JSON_VALID(`config_snapshot_json`)),
  CONSTRAINT `crawler_jobs_progress_json_valid` CHECK (`progress_json` IS NULL OR JSON_VALID(`progress_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `crawler_job_attempts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_id` BIGINT UNSIGNED NOT NULL,
  `attempt_no` INT UNSIGNED NOT NULL,
  `worker_id` BIGINT UNSIGNED NOT NULL,
  `lease_token_hash` BINARY(32) NOT NULL,
  `lease_expires_at` DATETIME NOT NULL,
  `started_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at` DATETIME NULL,
  `result_status` ENUM('running', 'succeeded', 'partial_succeeded', 'failed', 'cancelled', 'lease_lost') NOT NULL DEFAULT 'running',
  PRIMARY KEY (`id`),
  UNIQUE KEY `crawler_job_attempts_job_attempt_uidx` (`job_id`, `attempt_no`),
  KEY `crawler_job_attempts_worker_id_idx` (`worker_id`),
  CONSTRAINT `crawler_job_attempts_job_fk` FOREIGN KEY (`job_id`) REFERENCES `crawler_jobs` (`id`),
  CONSTRAINT `crawler_job_attempts_worker_fk` FOREIGN KEY (`worker_id`) REFERENCES `crawler_workers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `crawler_job_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_id` BIGINT UNSIGNED NOT NULL,
  `source` VARCHAR(64) NOT NULL,
  `source_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `source_key_hash` BINARY(32) NOT NULL,
  `stage` VARCHAR(64) NOT NULL DEFAULT 'pending',
  `status` ENUM('pending', 'running', 'succeeded', 'failed', 'skipped', 'cancelled') NOT NULL DEFAULT 'pending',
  `anime_id` BIGINT UNSIGNED NULL,
  `error_code` VARCHAR(64) NULL,
  `error_message` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `crawler_job_items_job_source_uidx` (`job_id`, `source`, `source_id`),
  UNIQUE KEY `crawler_job_items_source_key_hash_uidx` (`job_id`, `source_key_hash`),
  CONSTRAINT `crawler_job_items_job_fk` FOREIGN KEY (`job_id`) REFERENCES `crawler_jobs` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `crawler_job_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_id` BIGINT UNSIGNED NOT NULL,
  `attempt_id` BIGINT UNSIGNED NULL,
  `sequence` INT UNSIGNED NOT NULL,
  `level` ENUM('debug', 'info', 'warn', 'error') NOT NULL DEFAULT 'info',
  `event_type` VARCHAR(64) NOT NULL,
  `message` TEXT NULL,
  `payload_json` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `crawler_job_events_job_attempt_seq_uidx` (`job_id`, `attempt_id`, `sequence`),
  KEY `crawler_job_events_job_id_idx` (`job_id`),
  CONSTRAINT `crawler_job_events_job_fk` FOREIGN KEY (`job_id`) REFERENCES `crawler_jobs` (`id`),
  CONSTRAINT `crawler_job_events_payload_json_valid` CHECK (`payload_json` IS NULL OR JSON_VALID(`payload_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `crawler_operation_receipts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `operation_scope` VARCHAR(64) NOT NULL,
  `idempotency_key_hash` BINARY(32) NOT NULL,
  `job_id` BIGINT UNSIGNED NULL,
  `item_id` BIGINT UNSIGNED NULL,
  `request_hash` BINARY(32) NOT NULL,
  `response_json` TEXT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `crawler_operation_receipts_scope_key_uidx` (`operation_scope`, `idempotency_key_hash`),
  CONSTRAINT `crawler_operation_receipts_response_json_valid` CHECK (JSON_VALID(`response_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `anime_sources` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `anime_id` BIGINT UNSIGNED NOT NULL,
  `source` VARCHAR(64) NOT NULL,
  `source_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `source_key_hash` BINARY(32) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `anime_sources_source_uidx` (`source`, `source_id`),
  UNIQUE KEY `anime_sources_source_key_hash_uidx` (`source_key_hash`),
  KEY `anime_sources_anime_id_idx` (`anime_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
