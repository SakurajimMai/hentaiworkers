-- Harden system list uniqueness for concurrent ensureSystemLists.
SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- Collapse accidental duplicate system lists (keep lowest id per user+type).
DELETE l1 FROM user_lists l1
INNER JOIN user_lists l2
  ON l1.user_id = l2.user_id
 AND l1.list_type = l2.list_type
 AND l1.is_system = 1
 AND l2.is_system = 1
 AND l1.id > l2.id;

-- Generated uniqueness only for system lists (custom lists may share names).
ALTER TABLE user_lists
  ADD COLUMN IF NOT EXISTS system_type_key VARCHAR(32)
    GENERATED ALWAYS AS (
      CASE WHEN is_system = 1 THEN list_type ELSE NULL END
    ) VIRTUAL;

-- MariaDB allows multiple NULLs in UNIQUE; non-system rows get NULL key.
ALTER TABLE user_lists
  ADD UNIQUE KEY IF NOT EXISTS user_lists_user_system_type_uidx (user_id, system_type_key);
