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

/** 里番 / legacy `animes` tag dictionary (shared only with anime_tags). */
export const tags = mysqlTable('tags', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

/** 动漫 / external `anime_works` tag dictionary (shared only with anime_work_tags). */
export const workTags = mysqlTable(
  'work_tags',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (t) => [uniqueIndex('work_tags_name_uidx').on(t.name)],
);

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
    /** Bumped on password change so old iron-session cookies fail requireUser. */
    sessionVersion: int('session_version').notNull().default(1),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (t) => [uniqueIndex('users_username_uidx').on(t.username)]
);

/**
 * Legacy favorites table (migration 0003).
 * Runtime favorites use system lists in user_lists / user_list_items.
 * Kept for schema history + one-way backfill only; do not write from app code.
 */
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

export const userWatchProgress = mysqlTable(
  'user_watch_progress',
  {
    id: serial('id').primaryKey(),
    userId: int('user_id').notNull(),
    animeId: int('anime_id').notNull(),
    episodeId: int('episode_id'),
    positionSeconds: int('position_seconds').notNull().default(0),
    durationSeconds: int('duration_seconds').notNull().default(0),
    completed: int('completed').notNull().default(0),
    firstWatchedAt: datetime('first_watched_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    lastWatchedAt: datetime('last_watched_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex('user_watch_progress_user_anime_uidx').on(t.userId, t.animeId),
    index('user_watch_progress_user_last_idx').on(t.userId, t.lastWatchedAt),
    index('user_watch_progress_anime_id_idx').on(t.animeId),
  ],
);

export const mediaSources = mysqlTable(
  'media_sources',
  {
    id: serial('id').primaryKey(),
    animeId: int('anime_id').notNull(),
    episodeId: int('episode_id'),
    sourceName: varchar('source_name', { length: 64 }).notNull().default('primary'),
    videoUrl: varchar('video_url', { length: 1000 }).notNull(),
    quality: varchar('quality', { length: 32 }),
    format: varchar('format', { length: 32 }),
    priority: int('priority').notNull().default(100),
    status: mysqlEnum('status', ['active', 'inactive', 'broken']).notNull().default('active'),
    lastCheckedAt: datetime('last_checked_at'),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('media_sources_anime_id_idx').on(t.animeId),
    index('media_sources_episode_id_idx').on(t.episodeId),
  ],
);

export const userEvents = mysqlTable(
  'user_events',
  {
    id: serial('id').primaryKey(),
    userId: int('user_id'),
    anonymousId: varchar('anonymous_id', { length: 64 }),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    animeId: int('anime_id'),
    episodeId: int('episode_id'),
    sessionId: varchar('session_id', { length: 64 }),
    propertiesJson: text('properties_json'),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('user_events_user_created_idx').on(t.userId, t.createdAt),
    index('user_events_type_created_idx').on(t.eventType, t.createdAt),
    index('user_events_anime_id_idx').on(t.animeId),
  ],
);

/**
 * MacCMS JP/KR external-link catalog (separate from legacy `animes`).
 * Stream URLs only — no object storage / download pipeline.
 */
export const animeWorks = mysqlTable(
  'anime_works',
  {
    id: serial('id').primaryKey(),
    title: varchar('title', { length: 512 }).notNull(),
    titleEnglish: varchar('title_english', { length: 512 }),
    titleJapanese: varchar('title_japanese', { length: 512 }),
    description: text('description'),
    coverUrl: varchar('cover_url', { length: 1000 }),
    fanartUrls: text('fanart_urls'),
    streamUrl: varchar('stream_url', { length: 1000 }).notNull(),
    streamFormat: varchar('stream_format', { length: 32 }).notNull().default('hls'),
    playLinesJson: text('play_lines_json'),
    releaseYear: int('release_year'),
    releaseDate: varchar('release_date', { length: 32 }),
    remarks: varchar('remarks', { length: 255 }),
    /** 主演（MacCMS vod_actor） */
    actors: varchar('actors', { length: 1000 }),
    /** 导演（MacCMS vod_director） */
    directors: varchar('directors', { length: 512 }),
    /** 别名（MacCMS vod_sub 等，可与 titleJapanese 并存） */
    aliases: varchar('aliases', { length: 1000 }),
    /** 地区（vod_area） */
    area: varchar('area', { length: 128 }),
    /** 语言（vod_lang） */
    lang: varchar('lang', { length: 128 }),
    /** 源站更新时间原文（vod_time） */
    sourceUpdatedAt: varchar('source_updated_at', { length: 32 }),
    isActive: int('is_active').notNull().default(1),
    viewCount: int('view_count').notNull().default(0),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('anime_works_active_updated_idx').on(t.isActive, t.updatedAt),
    index('anime_works_release_year_idx').on(t.releaseYear),
  ],
);

export const animeWorkSources = mysqlTable(
  'anime_work_sources',
  {
    id: serial('id').primaryKey(),
    workId: int('work_id').notNull(),
    source: varchar('source', { length: 64 }).notNull(),
    sourceId: varchar('source_id', { length: 191 }).notNull(),
    /** BINARY(32) stored as Buffer via raw SQL; varchar placeholder for drizzle typing. */
    sourceKeyHash: varchar('source_key_hash', { length: 64 }).notNull(),
    pageUrl: varchar('page_url', { length: 1000 }),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex('anime_work_sources_source_uidx').on(t.source, t.sourceId),
    index('anime_work_sources_work_id_idx').on(t.workId),
  ],
);

/** Join: anime_works ↔ work_tags (tag_id is work_tags.id, not tags.id). */
export const animeWorkTags = mysqlTable(
  'anime_work_tags',
  {
    workId: int('work_id').notNull(),
    tagId: int('tag_id').notNull(),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (t) => [index('anime_work_tags_tag_id_idx').on(t.tagId)],
);

export type Anime = typeof animes.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type WorkTag = typeof workTags.$inferSelect;
export type User = typeof users.$inferSelect;
export type UserRole = User['role'];
export type UserFavorite = typeof userFavorites.$inferSelect;
export type UserWatchProgress = typeof userWatchProgress.$inferSelect;
export type MediaSource = typeof mediaSources.$inferSelect;
export type UserEvent = typeof userEvents.$inferSelect;
export type AnimeWork = typeof animeWorks.$inferSelect;
export type AnimeWorkSource = typeof animeWorkSources.$inferSelect;
