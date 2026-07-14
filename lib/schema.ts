import {
  mysqlTable,
  serial,
  int,
  varchar,
  text,
  datetime,
  mysqlEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

export const animes = mysqlTable(
  'animes',
  {
    id: serial('id').primaryKey(),
    title: varchar('title', { length: 500 }).notNull(),
    titleEnglish: varchar('title_english', { length: 500 }),
    titleJapanese: varchar('title_japanese', { length: 500 }),
    description: text('description'),
    cover: varchar('cover', { length: 1000 }),
    fanart: text('fanart'),
    videoUrl: varchar('video_url', { length: 1000 }).notNull(),
    releaseYear: int('release_year'),
    releaseDate: text('release_date'),
    viewCount: int('view_count').default(0),
    favoriteCount: int('favorite_count').default(0),
    isActive: int('is_active').default(1),
    categoryId: int('category_id'),
    createdAt: text('created_at'),
    updatedAt: text('updated_at'),
  },
  (t) => [index('animes_is_active_idx').on(t.isActive)]
);

export const tags = mysqlTable('tags', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const animeTags = mysqlTable(
  'anime_tags',
  {
    id: serial('id').primaryKey(),
    animeId: int('anime_id').notNull(),
    tagId: int('tag_id').notNull(),
    createdAt: text('created_at'),
    updatedAt: text('updated_at'),
  },
  (t) => [
    index('anime_tags_anime_id_idx').on(t.animeId),
    index('anime_tags_tag_id_idx').on(t.tagId),
  ]
);

export const users = mysqlTable(
  'users',
  {
    id: serial('id').primaryKey(),
    username: varchar('username', { length: 64 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    role: mysqlEnum('role', ['user', 'admin']).notNull().default('user'),
    displayName: varchar('display_name', { length: 128 }),
    isActive: int('is_active').notNull().default(1),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (t) => [uniqueIndex('users_username_uidx').on(t.username)]
);

export const userFavorites = mysqlTable(
  'user_favorites',
  {
    id: serial('id').primaryKey(),
    userId: int('user_id').notNull(),
    animeId: int('anime_id').notNull(),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex('user_favorites_user_anime_uidx').on(t.userId, t.animeId),
    index('user_favorites_user_id_idx').on(t.userId),
    index('user_favorites_anime_id_idx').on(t.animeId),
  ],
);

export type Anime = typeof animes.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type User = typeof users.$inferSelect;
export type UserRole = User['role'];
export type UserFavorite = typeof userFavorites.$inferSelect;
