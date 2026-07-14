-- Additive: public user favorites (cloud sync).
-- Does not ALTER catalog tables (animes/tags/users).

CREATE TABLE IF NOT EXISTS `user_favorites` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `user_id` INT(11) NOT NULL,
  `anime_id` INT(11) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_favorites_user_anime_uidx` (`user_id`, `anime_id`),
  KEY `user_favorites_user_id_idx` (`user_id`),
  KEY `user_favorites_anime_id_idx` (`anime_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
