CREATE TABLE IF NOT EXISTS manga_view_days (
  manga_id INT NOT NULL,
  day DATE NOT NULL,
  view_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (manga_id, day),
  INDEX manga_view_days_day_idx (day)
);

CREATE TABLE IF NOT EXISTS manga_view_dedup (
  manga_id INT NOT NULL,
  viewer_key VARCHAR(80) NOT NULL,
  day DATE NOT NULL,
  PRIMARY KEY (manga_id, viewer_key, day)
);
