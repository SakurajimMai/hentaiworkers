import { mysqlTable, serial, varchar, text, int, timestamp } from 'drizzle-orm/mysql-core';

export const animes = mysqlTable('animes', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 500 }).notNull(),
  titleEnglish: varchar('title_english', { length: 500 }),
  titleJapanese: varchar('title_japanese', { length: 500 }),
  description: text('description'),
  cover: varchar('cover', { length: 1000 }),
  fanart: text('fanart'),
  videoUrl: varchar('video_url', { length: 1000 }).notNull(),
  releaseYear: int('release_year'),
  releaseDate: text('release_date'), // MySQL might use date/varchar
  viewCount: int('view_count'),
  favoriteCount: int('favorite_count'),
  isActive: int('is_active'),
  categoryId: int('category_id'),
  createdAt: text('created_at'), // Keeping as text to match likely sqlite import or timestamp
  updatedAt: text('updated_at'),
});

export const tags = mysqlTable('tags', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const animeTags = mysqlTable('anime_tags', {
  id: serial('id').primaryKey(),
  animeId: int('anime_id').notNull(),
  tagId: int('tag_id').notNull(),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});
