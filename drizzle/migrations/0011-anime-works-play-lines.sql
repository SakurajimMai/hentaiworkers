-- Additive: multi play-line / episode JSON for external anime_works (MacCMS).
-- stream_url remains the default/latest playable URL for simple players.

ALTER TABLE `anime_works`
  ADD COLUMN `play_lines_json` MEDIUMTEXT NULL
  AFTER `stream_format`;
