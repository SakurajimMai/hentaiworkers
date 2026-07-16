-- Additive: separate JP/KR anime works catalog for external-link-only MacCMS ingestion.
-- Does NOT alter legacy `animes` rows (H 片库). No media download / object storage tables.

CREATE TABLE IF NOT EXISTS `anime_works` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(512) NOT NULL,
  `title_english` VARCHAR(512) NULL,
  `title_japanese` VARCHAR(512) NULL,
  `description` TEXT NULL,
  `cover_url` VARCHAR(1000) NULL,
  `fanart_urls` TEXT NULL,
  `stream_url` VARCHAR(1000) NOT NULL,
  `stream_format` VARCHAR(32) NOT NULL DEFAULT 'hls',
  `release_year` INT NULL,
  `release_date` VARCHAR(32) NULL,
  `remarks` VARCHAR(255) NULL,
  `is_active` TINYINT NOT NULL DEFAULT 1,
  `view_count` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `anime_works_active_updated_idx` (`is_active`, `updated_at`),
  KEY `anime_works_release_year_idx` (`release_year`),
  KEY `anime_works_title_idx` (`title`(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `anime_work_sources` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `work_id` BIGINT UNSIGNED NOT NULL,
  `source` VARCHAR(64) NOT NULL,
  `source_id` VARCHAR(191) NOT NULL,
  `source_key_hash` BINARY(32) NOT NULL,
  `page_url` VARCHAR(1000) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `anime_work_sources_source_uidx` (`source`, `source_id`),
  UNIQUE KEY `anime_work_sources_source_key_hash_uidx` (`source_key_hash`),
  KEY `anime_work_sources_work_id_idx` (`work_id`),
  CONSTRAINT `anime_work_sources_work_fk`
    FOREIGN KEY (`work_id`) REFERENCES `anime_works` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `anime_work_tags` (
  `work_id` BIGINT UNSIGNED NOT NULL,
  `tag_id` INT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`work_id`, `tag_id`),
  KEY `anime_work_tags_tag_id_idx` (`tag_id`),
  CONSTRAINT `anime_work_tags_work_fk`
    FOREIGN KEY (`work_id`) REFERENCES `anime_works` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
