-- User favorites for the manga catalog.
-- Kept separate from anime favorites because the two catalogs have different IDs.

CREATE TABLE IF NOT EXISTS manga_favorites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  manga_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY manga_favorites_user_manga_uidx (user_id, manga_id),
  KEY manga_favorites_user_id_idx (user_id),
  KEY manga_favorites_manga_id_idx (manga_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
