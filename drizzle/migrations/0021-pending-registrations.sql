-- Registration requests are not users. Only successful verification inserts into users.
CREATE TABLE IF NOT EXISTS `pending_registrations` (
  `email` VARCHAR(64) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `display_name` VARCHAR(64) DEFAULT NULL,
  `token_hash` VARBINARY(32) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `sent_at` DATETIME(3) DEFAULT NULL,
  PRIMARY KEY (`email`),
  UNIQUE KEY `pending_registrations_hash_uidx` (`token_hash`),
  KEY `pending_registrations_expiry_idx` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
