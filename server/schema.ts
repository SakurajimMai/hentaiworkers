import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const animes = sqliteTable('animes', {
  id: integer('id').primaryKey(),
  title: text('title').notNull(),
  titleEnglish: text('title_english'),
  titleJapanese: text('title_japanese'),
  description: text('description'),
  cover: text('cover'),
  fanart: text('fanart'),
  videoUrl: text('video_url').notNull(),
  releaseYear: integer('release_year'),
  releaseDate: text('release_date'),
  viewCount: integer('view_count'),
  favoriteCount: integer('favorite_count'),
  isActive: integer('is_active'),
  categoryId: integer('category_id'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});
