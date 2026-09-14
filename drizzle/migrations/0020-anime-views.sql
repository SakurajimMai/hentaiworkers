-- Real view tracking for the 里番 catalog.
-- Mirrors 0017-manga-views.sql: one counted view per viewer per anime per UTC day.
-- `anime_view_days` keeps the daily history for future ranking; the same deduped
-- event also bumps `animes.view_count`, which stays the cheap counter used by the
-- list responses and by `sort=popular`.
--
-- The application never runs migrations. Apply this file after human review.

CREATE TABLE IF NOT EXISTS anime_view_days (
  anime_id INT NOT NULL,
  day DATE NOT NULL,
  view_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (anime_id, day),
  INDEX anime_view_days_day_idx (day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS anime_view_dedup (
  anime_id INT NOT NULL,
  viewer_key VARCHAR(80) NOT NULL,
  day DATE NOT NULL,
  PRIMARY KEY (anime_id, viewer_key, day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Clear the fake seeds. This statement RUNS as part of this migration.
-- ---------------------------------------------------------------------------
-- Every existing `animes.view_count` value is a crawler seed
-- (`random.randint(1000, 10000)`), not a real play count, so it is cleared here.
-- From then on the column only holds the real, deduped counts written by
-- lib/anime-views.ts.
--
-- Consequences, accepted deliberately:
--   * the crawler's random seeds are discarded permanently (no backup is taken);
--   * `sort=popular`, the home/similar popularity fallbacks and the "N 次播放"
--     badge all start at zero and recover only as real traffic accumulates;
--   * catalog ordering therefore changes immediately and visibly.
--
-- Take a database backup before applying this migration.
UPDATE animes SET view_count = 0;

-- `animes.favorite_count` is intentionally left untouched. The column stays for
-- schema history but is no longer a source of truth and must not be read; the
-- real favourite count is derived from `user_lists` + `user_list_items`.
