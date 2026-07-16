-- Restore object-storage profiles for Hanime download/upload jobs (S3 / SFTP).
-- Additive only. Does not alter catalog tables.

CREATE TABLE IF NOT EXISTS `storage_profiles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(128) NOT NULL,
  `driver` ENUM('s3', 'sftp') NOT NULL,
  `is_enabled` TINYINT NOT NULL DEFAULT 1,
  `current_version_id` BIGINT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `storage_profiles_name_uidx` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `storage_profile_versions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `profile_id` BIGINT UNSIGNED NOT NULL,
  `version` INT UNSIGNED NOT NULL,
  `config_json` TEXT NOT NULL,
  `storage_test_passed` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by_user_id` BIGINT UNSIGNED NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `storage_profile_versions_profile_version_uidx` (`profile_id`, `version`),
  KEY `storage_profile_versions_profile_id_idx` (`profile_id`),
  CONSTRAINT `storage_profile_versions_profile_fk`
    FOREIGN KEY (`profile_id`) REFERENCES `storage_profiles` (`id`),
  CONSTRAINT `storage_profile_versions_config_json_valid`
    CHECK (JSON_VALID(`config_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
