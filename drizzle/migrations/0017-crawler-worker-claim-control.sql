-- Add an independent claim gate without changing worker identity or job history.
SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE `crawler_workers`
  ADD COLUMN IF NOT EXISTS `claim_enabled` TINYINT NOT NULL DEFAULT 1 AFTER `is_enabled`;
