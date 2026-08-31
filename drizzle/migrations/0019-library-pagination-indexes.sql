-- Stable, bounded library pagination for large favorites and history collections.
-- Each index check makes this migration safe to resume after partial DDL success.

SET @library_index_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'user_list_items'
    AND index_name = 'user_list_items_list_created_id_idx'
);
SET @library_index_ddl = IF(
  @library_index_exists = 0,
  'ALTER TABLE user_list_items ADD KEY user_list_items_list_created_id_idx (list_id, created_at, id)',
  'SELECT 1'
);
PREPARE library_index_statement FROM @library_index_ddl;
EXECUTE library_index_statement;
DEALLOCATE PREPARE library_index_statement;

SET @library_index_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'manga_favorites'
    AND index_name = 'manga_favorites_user_created_id_idx'
);
SET @library_index_ddl = IF(
  @library_index_exists = 0,
  'ALTER TABLE manga_favorites ADD KEY manga_favorites_user_created_id_idx (user_id, created_at, id)',
  'SELECT 1'
);
PREPARE library_index_statement FROM @library_index_ddl;
EXECUTE library_index_statement;
DEALLOCATE PREPARE library_index_statement;

SET @library_index_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'user_watch_progress'
    AND index_name = 'user_watch_progress_user_last_id_idx'
);
SET @library_index_ddl = IF(
  @library_index_exists = 0,
  'ALTER TABLE user_watch_progress ADD KEY user_watch_progress_user_last_id_idx (user_id, last_watched_at, id)',
  'SELECT 1'
);
PREPARE library_index_statement FROM @library_index_ddl;
EXECUTE library_index_statement;
DEALLOCATE PREPARE library_index_statement;

SET @library_index_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'manga_reading_progress'
    AND index_name = 'manga_reading_progress_user_last_id_idx'
);
SET @library_index_ddl = IF(
  @library_index_exists = 0,
  'ALTER TABLE manga_reading_progress ADD KEY manga_reading_progress_user_last_id_idx (user_id, last_read_at, id)',
  'SELECT 1'
);
PREPARE library_index_statement FROM @library_index_ddl;
EXECUTE library_index_statement;
DEALLOCATE PREPARE library_index_statement;
