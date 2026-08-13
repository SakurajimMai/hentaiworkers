-- Manga catalog for TG → ImgBed → site publish pipeline.
-- Ingest is authenticated via system_settings.manga.publishSecret (admin UI), not env.

CREATE TABLE IF NOT EXISTS mangas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(200) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT NULL,
  cover_url VARCHAR(1000) NULL,
  source_chat_id VARCHAR(64) NULL,
  source_chat_title VARCHAR(255) NULL,
  chapter_count INT NOT NULL DEFAULT 0,
  page_count INT NOT NULL DEFAULT 0,
  is_published INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY mangas_slug_uidx (slug),
  KEY mangas_is_published_idx (is_published),
  KEY mangas_title_idx (title)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS manga_chapters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  manga_id INT NOT NULL,
  number INT NOT NULL,
  title VARCHAR(500) NULL,
  source_key VARCHAR(255) NOT NULL,
  page_count INT NOT NULL DEFAULT 0,
  is_published INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY manga_chapters_source_key_uidx (source_key),
  UNIQUE KEY manga_chapters_manga_number_uidx (manga_id, number),
  KEY manga_chapters_manga_id_idx (manga_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS manga_pages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  chapter_id INT NOT NULL,
  page_index INT NOT NULL DEFAULT 0,
  image_url VARCHAR(1000) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY manga_pages_chapter_index_uidx (chapter_id, page_index),
  KEY manga_pages_chapter_id_idx (chapter_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
