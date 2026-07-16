-- Additive: multi-list favorites foundation + optional search helpers.
SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `user_lists` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `user_id` INT(11) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `list_type` ENUM('favorites', 'want', 'watching', 'completed', 'custom') NOT NULL DEFAULT 'custom',
  `visibility` ENUM('private', 'public') NOT NULL DEFAULT 'private',
  `is_system` TINYINT NOT NULL DEFAULT 0,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_lists_user_id_idx` (`user_id`),
  KEY `user_lists_user_type_idx` (`user_id`, `list_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_list_items` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `list_id` INT(11) NOT NULL,
  `anime_id` INT(11) NOT NULL,
  `note` VARCHAR(500) NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_list_items_list_anime_uidx` (`list_id`, `anime_id`),
  KEY `user_list_items_anime_id_idx` (`anime_id`),
  KEY `user_list_items_list_id_idx` (`list_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ensure every user who has favorites gets a system favorites list.
INSERT INTO `user_lists` (`user_id`, `name`, `list_type`, `visibility`, `is_system`, `sort_order`)
SELECT DISTINCT f.`user_id`, '收藏', 'favorites', 'private', 1, 0
FROM `user_favorites` f
WHERE NOT EXISTS (
  SELECT 1 FROM `user_lists` l
  WHERE l.`user_id` = f.`user_id` AND l.`list_type` = 'favorites' AND l.`is_system` = 1
);

INSERT INTO `user_list_items` (`list_id`, `anime_id`, `sort_order`, `created_at`)
SELECT l.`id`, f.`anime_id`, 0, f.`created_at`
FROM `user_favorites` f
INNER JOIN `user_lists` l
  ON l.`user_id` = f.`user_id` AND l.`list_type` = 'favorites' AND l.`is_system` = 1
WHERE NOT EXISTS (
  SELECT 1 FROM `user_list_items` i
  WHERE i.`list_id` = l.`id` AND i.`anime_id` = f.`anime_id`
);
