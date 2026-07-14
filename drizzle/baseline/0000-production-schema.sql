-- Production MariaDB schema baseline.

-- Generated from SHOW CREATE TABLE; schema only, no table data.

CREATE TABLE `animes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(500) NOT NULL,
  `title_english` varchar(500) DEFAULT NULL,
  `title_japanese` varchar(500) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `cover` varchar(1000) DEFAULT NULL,
  `fanart` text DEFAULT NULL,
  `video_url` varchar(1000) NOT NULL,
  `release_year` int(11) DEFAULT NULL,
  `release_date` date DEFAULT NULL,
  `view_count` int(11) DEFAULT NULL,
  `favorite_count` int(11) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT NULL,
  `category_id` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`) USING BTREE,
  KEY `ix_animes_id` (`id`) USING BTREE,
  KEY `ix_animes_title` (`title`) USING BTREE,
  KEY `idx_animes_category_id` (`category_id`) USING BTREE,
  KEY `idx_animes_created_at` (`created_at`) USING BTREE,
  KEY `idx_animes_category_created` (`category_id`,`created_at`) USING BTREE,
  CONSTRAINT `animes_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE `tags` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `name_english` varchar(100) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp(),
  `applicable_to` set('anime','manga') DEFAULT 'anime' COMMENT '适用内容类型',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `ix_tags_name` (`name`) USING BTREE,
  KEY `ix_tags_id` (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE `anime_tags` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `anime_id` int(11) NOT NULL,
  `tag_id` int(11) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `uq_anime_tag` (`anime_id`,`tag_id`) USING BTREE,
  KEY `tag_id` (`tag_id`) USING BTREE,
  KEY `ix_anime_tags_id` (`id`) USING BTREE,
  CONSTRAINT `anime_tags_ibfk_1` FOREIGN KEY (`anime_id`) REFERENCES `animes` (`id`),
  CONSTRAINT `anime_tags_ibfk_2` FOREIGN KEY (`tag_id`) REFERENCES `tags` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE `categories` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `num` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `ix_categories_name` (`name`) USING BTREE,
  KEY `ix_categories_id` (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(64) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('user','admin') NOT NULL DEFAULT 'user',
  `display_name` varchar(128) DEFAULT NULL,
  `is_active` tinyint(4) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_username_uidx` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
