-- Cloud reading progress for manga, used by the website and the APK.

CREATE TABLE IF NOT EXISTS manga_reading_progress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  manga_id INT NOT NULL,
  chapter_number INT NOT NULL DEFAULT 1,
  page_index INT NOT NULL DEFAULT 0,
  last_read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY manga_reading_progress_user_manga_uidx (user_id, manga_id),
  KEY manga_reading_progress_user_last_idx (user_id, last_read_at),
  KEY manga_reading_progress_manga_id_idx (manga_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
