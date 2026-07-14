# Next.js + MySQL + Admin Implementation Plan

> **For agentic workers:** Execute inline in priority order. Checkboxes track progress.

**Goal:** Replace Cloudflare/Vite production path with Next.js App Router, remote MySQL, admin console, Docker (app only).

**Architecture:** Single Next.js process serves public site, `/admin`, and `/api`. Drizzle + mysql2 against existing remote MySQL. `users` table with `role` user|admin.

**Tech Stack:** Next.js 15, React 19, Tailwind 3, Drizzle, bcryptjs, iron-session, Docker standalone.

## File map

| Path | Responsibility |
|------|----------------|
| `lib/schema.ts` | Drizzle tables: animes, tags, anime_tags, users |
| `lib/db.ts` | MySQL pool + drizzle |
| `lib/auth.ts` | Session + password helpers |
| `lib/anime-service.ts` | Public query logic (list, detail, similar, tags) |
| `app/api/**` | Public + admin route handlers |
| `app/(site)/**` | Public catalog UI |
| `app/admin/**` | Admin UI |
| `Dockerfile` / `docker-compose.yml` | App-only deploy |

## Tasks

1. Scaffold Next config, package.json, Tailwind globals
2. Schema + db + auth + bootstrap admin
3. Public API parity
4. Port public UI
5. Admin pages + actions
6. Docker + env example
7. Build verify
