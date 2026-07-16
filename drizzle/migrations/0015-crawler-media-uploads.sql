-- Media upload reservations for Hanime download → object-storage publish.
-- Additive only. Does not alter catalog tables.

CREATE TABLE IF NOT EXISTS `crawler_media_uploads` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_id` BIGINT UNSIGNED NOT NULL,
  `attempt_id` BIGINT UNSIGNED NOT NULL,
  `item_id` BIGINT UNSIGNED NULL,
  `staging_key` VARCHAR(512) NOT NULL,
  `final_key` VARCHAR(512) NOT NULL,
  `status` ENUM('reserved', 'uploaded', 'published', 'abandoned', 'cleaned') NOT NULL DEFAULT 'reserved',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `crawler_media_uploads_staging_key_uidx` (`staging_key`),
  KEY `crawler_media_uploads_job_attempt_idx` (`job_id`, `attempt_id`),
  CONSTRAINT `crawler_media_uploads_job_fk`
    FOREIGN KEY (`job_id`) REFERENCES `crawler_jobs` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
