-- Additive metadata for external anime_works detail pages (MacCMS vod_* fields).
-- Mirrors common resource-site detail: 主演/导演/别名/地区/语言/更新时间.

ALTER TABLE `anime_works`
  ADD COLUMN `actors` VARCHAR(1000) NULL
  AFTER `remarks`,
  ADD COLUMN `directors` VARCHAR(512) NULL
  AFTER `actors`,
  ADD COLUMN `aliases` VARCHAR(1000) NULL
  AFTER `directors`,
  ADD COLUMN `area` VARCHAR(128) NULL
  AFTER `aliases`,
  ADD COLUMN `lang` VARCHAR(128) NULL
  AFTER `area`,
  ADD COLUMN `source_updated_at` VARCHAR(32) NULL
  AFTER `lang`;
