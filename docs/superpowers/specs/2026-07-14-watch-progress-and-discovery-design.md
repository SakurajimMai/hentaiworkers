# Watch Progress, Media Sources, Events, and Discovery (Phase 1)

## Goal

Close the user loop: browse → play → progress → continue watching → return, with logged-in sync and guest localStorage merge. Lay additive foundations for multi-source media, product analytics events, and later list/password features without blocking the MVP.

## Phase 1 (this delivery)

1. `user_watch_progress` + REST under `/api/me/watch-progress*`
2. Player client: start / 20s throttle / pause / pagehide / complete; ≥90% → completed
3. Guest `localStorage` + login-time merge (server max of timestamps / progress)
4. Home “继续观看” + `/history` clear one / clear all
5. Additive `media_sources` (backfill from `animes.video_url`); playback still reads `animes.video_url` with optional source overlay later
6. Additive `user_events` + minimal `play_start` / `play_complete` recording
7. Session policy documented: max age 7d (existing); idle not server-enforced in cookie-only model (note for phase 2)

## Deferred (schema/docs only or later)

- Full series/episodes split (keep `animes` as catalog unit for now)
- `user_lists` / multi-folder favorites
- Forgot-password email flow
- FULLTEXT / search suggestions / hot queries
- Rule-based home recommendation beyond continue + popular + latest

## Tables

### user_watch_progress

- PK id; UNIQUE (user_id, anime_id)
- position_seconds, duration_seconds, completed
- first_watched_at, last_watched_at, updated_at
- episode_id NULL reserved

### media_sources

- anime_id (catalog unit today), episode_id NULL
- source_name, video_url, quality, format, priority, status, last_checked_at
- UNIQUE optional later; phase 1 backfills one `primary` row per anime with video_url

### user_events

- user_id nullable, anonymous_id nullable, event_type, anime_id, episode_id, session_id, properties_json, created_at
- Separate from crawler job events and admin audit

## Write policy

- Client interval 20s; flush on pause/visibility/pagehide/ended
- Upsert; never move position backwards unless `force` or completed reset
- Completed when ratio ≥ 0.9 or remaining ≤ 5s with duration > 0

## Auth

- `/api/me/**` requires logged-in session (user or admin)
- Guest only localStorage until merge
