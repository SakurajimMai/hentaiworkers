-- Separate catalog tags for external anime_works (MacCMS 动漫) from legacy 里番 tags.
-- 里番: tags + anime_tags
-- 动漫: work_tags + anime_work_tags (tag_id now references work_tags)

-- Match remote tags table collation (utf8mb4_uca1400_ai_ci on production).
CREATE TABLE IF NOT EXISTS `work_tags` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `work_tags_name_uidx` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Seed work_tags from tag names currently linked to anime_works.
INSERT INTO `work_tags` (`name`, `description`, `created_at`, `updated_at`)
SELECT DISTINCT t.`name`, t.`description`, UTC_TIMESTAMP(), UTC_TIMESTAMP()
FROM `tags` t
INNER JOIN `anime_work_tags` wt ON wt.`tag_id` = t.`id`
ON DUPLICATE KEY UPDATE
  `description` = COALESCE(`work_tags`.`description`, VALUES(`description`)),
  `updated_at` = UTC_TIMESTAMP();

-- Repoint join table tag_id from legacy tags.id to work_tags.id (by name).
-- COLLATE forces equal collations when tables were created with different defaults.
UPDATE `anime_work_tags` wt
INNER JOIN `tags` t ON t.`id` = wt.`tag_id`
INNER JOIN `work_tags` n
  ON n.`name` COLLATE utf8mb4_uca1400_ai_ci = t.`name` COLLATE utf8mb4_uca1400_ai_ci
SET wt.`tag_id` = n.`id`,
    wt.`updated_at` = UTC_TIMESTAMP();

-- Remove from legacy tags dictionary names that only served anime_works (no 里番 links).
DELETE t FROM `tags` t
WHERE NOT EXISTS (
  SELECT 1 FROM `anime_tags` at WHERE at.`tag_id` = t.`id`
)
AND EXISTS (
  SELECT 1 FROM `work_tags` wt
  WHERE wt.`name` COLLATE utf8mb4_uca1400_ai_ci = t.`name` COLLATE utf8mb4_uca1400_ai_ci
);
