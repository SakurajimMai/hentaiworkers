-- Additive: watch progress, media sources foundation, product analytics events.
-- Does not DROP or mutate crawler control tables.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `user_watch_progress` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `user_id` INT(11) NOT NULL,
  `anime_id` INT(11) NOT NULL,
  `episode_id` INT(11) NULL,
  `position_seconds` INT UNSIGNED NOT NULL DEFAULT 0,
  `duration_seconds` INT UNSIGNED NOT NULL DEFAULT 0,
  `completed` TINYINT NOT NULL DEFAULT 0,
  `first_watched_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_watched_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_watch_progress_user_anime_uidx` (`user_id`, `anime_id`),
  KEY `user_watch_progress_user_last_idx` (`user_id`, `last_watched_at`),
  KEY `user_watch_progress_anime_id_idx` (`anime_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `media_sources` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `anime_id` INT(11) NOT NULL,
  `episode_id` INT(11) NULL,
  `source_name` VARCHAR(64) NOT NULL DEFAULT 'primary',
  `video_url` VARCHAR(1000) NOT NULL,
  `quality` VARCHAR(32) NULL,
  `format` VARCHAR(32) NULL,
  `priority` INT NOT NULL DEFAULT 100,
  `status` ENUM('active', 'inactive', 'broken') NOT NULL DEFAULT 'active',
  `last_checked_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `media_sources_anime_id_idx` (`anime_id`),
  KEY `media_sources_episode_id_idx` (`episode_id`),
  KEY `media_sources_status_priority_idx` (`status`, `priority`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One-time backfill of primary playback rows from catalog (idempotent-ish via NOT EXISTS).
INSERT INTO `media_sources` (`anime_id`, `source_name`, `video_url`, `format`, `priority`, `status`)
SELECT a.`id`, 'primary', a.`video_url`,
  CASE
    WHEN LOWER(a.`video_url`) LIKE '%.m3u8%' THEN 'hls'
    WHEN LOWER(a.`video_url`) LIKE '%.mp4%' THEN 'mp4'
    ELSE NULL
  END,
  100,
  'active'
FROM `animes` a
WHERE a.`video_url` IS NOT NULL
  AND a.`video_url` <> ''
  AND NOT EXISTS (
    SELECT 1 FROM `media_sources` m
    WHERE m.`anime_id` = a.`id` AND m.`source_name` = 'primary' AND m.`episode_id` IS NULL
  );

CREATE TABLE IF NOT EXISTS `user_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT(11) NULL,
  `anonymous_id` VARCHAR(64) NULL,
  `event_type` VARCHAR(64) NOT NULL,
  `anime_id` INT(11) NULL,
  `episode_id` INT(11) NULL,
  `session_id` VARCHAR(64) NULL,
  `properties_json` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_events_user_created_idx` (`user_id`, `created_at`),
  KEY `user_events_type_created_idx` (`event_type`, `created_at`),
  KEY `user_events_anime_id_idx` (`anime_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `user_id` INT(11) NOT NULL,
  `token_hash` VARBINARY(32) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `used_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `password_reset_tokens_hash_uidx` (`token_hash`),
  KEY `password_reset_tokens_user_id_idx` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
