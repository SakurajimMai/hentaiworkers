-- Bind scheduled Hanime jobs to the same immutable S3/SFTP storage version.
-- Additive only. Does not alter catalog tables.

ALTER TABLE `crawler_schedules`
  ADD COLUMN IF NOT EXISTS `storage_profile_version_id` BIGINT UNSIGNED NULL
    AFTER `profile_version_id`;
