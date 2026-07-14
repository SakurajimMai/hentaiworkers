# AnimeStream Full-Stack Redesign: Next.js + MySQL + Admin

**Date:** 2026-07-12  
**Status:** Draft for approval  
**Stack choice:** Next.js App Router full-stack (Approach C)

---

## 1. Goals

- Leave Cloudflare Workers / Pages Functions and D1 completely.
- Run a self-hosted **Next.js** app that owns:
  - Public video catalog UI (migrated from current Vite `src/`)
  - Admin console under `/admin`
  - Public REST API under `/api` (compatible with existing web + mobile clients)
- Connect to **existing remote MySQL** (no DB container in Docker Compose).
- Ship with **Docker** for single-service app deploy on a VPS.

### Non-goals (this phase)

- Rewriting the Expo mobile app (keep calling the same `/api` contract).
- Cloudflare Wrangler / Hyperdrive / D1 bindings.
- Object storage / local video hosting (video URLs remain external links as today).
- End-user registration UX on the public site (optional later; schema still supports `role=user`).

---

## 2. Architecture

```
┌─────────────────────────────────────┐
│  Docker Compose                     │
│  └── app (Next.js standalone)       │
│       :3000                         │
└──────────────┬──────────────────────┘
               │ DATABASE_URL (TLS optional)
               ▼
┌─────────────────────────────────────┐
│  Existing MySQL                     │
│  lv-mysql01.offloadsql.com          │
│  database: sql23690_hentai          │
└─────────────────────────────────────┘
```

| Concern | Decision |
|---------|----------|
| Runtime | Node.js 22 + Next.js 15 App Router |
| ORM | Drizzle ORM + `mysql2` |
| Config | `.env` / server env only; never commit secrets |
| Compose | **Only `app` service** — no `db` service |
| Public UI | Server Components + Client islands (player, carousels) |
| Admin UI | App Router under `/admin/*`, session-gated |
| Auth | Cookie session (iron-session or next-auth credentials style); password bcrypt |

### Route map

| Path | Audience | Auth |
|------|----------|------|
| `/`, `/browse`, `/watch/[id]` | Visitors | Public |
| `/admin/login` | Staff | Public form |
| `/admin/**` | Staff | Requires `role = admin` |
| `/api/health` | Ops / probes | Public |
| `/api/animes`, `/api/tags`, `/api/animes/:id`, `/api/animes/:id/similar` | Web + mobile | Public (read) |
| `/api/admin/**` | Admin UI / tools | Admin session |

---

## 3. Configuration

### Required env

```env
# MySQL — password special chars must be URL-encoded (@ → %40)
DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DATABASE

# Session / auth
SESSION_SECRET=long-random-string-at-least-32-chars
# Bootstrap first admin if no admin users exist (one-time convenience)
ADMIN_BOOTSTRAP_USER=admin
ADMIN_BOOTSTRAP_PASSWORD=change-me
```

### Rules

- Real credentials live only in `.env` on the server (and local `.env` for dev).
- Repo ships `.env.example` with placeholders only.
- Docker Compose uses `env_file: .env`.
- Connection string provided by operator; app does not provision MySQL.

---

## 4. Data model

### 4.1 Existing business tables (reuse)

Aligned with current `functions/schema.js` / production usage:

**`animes`**

| Column | Notes |
|--------|--------|
| id | PK |
| title | required |
| title_english, title_japanese | optional |
| description | text |
| cover, fanart, video_url | URLs |
| release_year, release_date | optional |
| view_count, favorite_count | counters |
| is_active | soft enable/disable for catalog |
| category_id | optional legacy |
| created_at, updated_at | timestamps / text as present |

**`tags`**, **`anime_tags`** — keep as today.

Public list endpoints should prefer `is_active = 1` (or truthy) so admin can unpublish without delete.

### 4.2 Users (new)

Single **`users`** table; permission via **role**, not a separate admins table.

```text
users
  id              INT PK AUTO_INCREMENT
  username        VARCHAR(64) UNIQUE NOT NULL
  password_hash   VARCHAR(255) NOT NULL
  role            ENUM('user','admin') NOT NULL DEFAULT 'user'
  display_name    VARCHAR(128) NULL
  is_active       TINYINT NOT NULL DEFAULT 1
  created_at      DATETIME NOT NULL
  updated_at      DATETIME NOT NULL
```

| Role | Capabilities |
|------|----------------|
| `user` | Reserved for future personal features (favorites sync, etc.). **Cannot** open `/admin`. |
| `admin` | Full admin console: animes, tags, import, user management (list / role / reset password / deactivate). |

### 4.3 Auth behavior

- Login: username + password → verify bcrypt → set encrypted session cookie (`userId`, `role`).
- `/admin/**` middleware: require session + `role === 'admin'` + `is_active`.
- Change password: authenticated user (admin) can change own password; admins can reset others.
- Bootstrap: on first boot (or dedicated script), if zero rows with `role=admin`, create one from `ADMIN_BOOTSTRAP_*`.
- Logout: destroy session cookie.

Phase-1 public site does **not** require login to watch. User role is schema-ready for later.

---

## 5. Public API contract (compatibility)

Preserve response shapes used by current web/mobile:

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/api/health` | DB connectivity + app version |
| GET | `/api/animes?page&limit&tag&search&sort` | `sort=popular\|latest`; `{ data, pagination }` |
| GET | `/api/animes/:id` | Full row + `tags[]` |
| GET | `/api/animes/:id/similar` | Series-prefix first, then tag overlap (port logic from `functions/api/[[path]].js`) |
| GET | `/api/tags` | `{ id, name }[]` ordered by name |

Implementation: Next.js Route Handlers under `app/api/**`.

---

## 6. Admin features

### 6.1 UI pages

| Page | Features |
|------|----------|
| `/admin/login` | Username / password |
| `/admin` | Dashboard: counts (animes, tags, users), quick links |
| `/admin/animes` | Paginated table, search, filter active/inactive |
| `/admin/animes/new`, `/admin/animes/[id]` | Form: titles, description, cover, fanart, video URL, tags multi-select, is_active |
| `/admin/tags` | List + create/edit/delete (block delete if still linked, or cascade choice: default **block**) |
| `/admin/import` | Upload/paste JSON batch create/update animes (+ tags) |
| `/admin/users` | List users, set role, activate/deactivate, reset password; create user |
| `/admin/account` | Change own password |

### 6.2 Admin mutations

- Prefer **Server Actions** for forms; optional thin `/api/admin/*` if client tools need JSON.
- All mutations require admin session; CSRF mitigated by same-site cookies + Next action origin checks.

### 6.3 Import format (v1)

JSON array of objects, fields mapped to `animes` (+ optional `tags: string[]` by name create-if-missing):

```json
[
  {
    "title": "...",
    "titleJapanese": "...",
    "description": "...",
    "cover": "https://...",
    "fanart": "url1,url2",
    "videoUrl": "https://...",
    "tags": ["标签A", "标签B"]
  }
]
```

Idempotency: match by `id` if provided; else insert new.

---

## 7. Frontend migration

| From (Vite) | To (Next) |
|-------------|-----------|
| `src/pages/Home.tsx` | `app/(site)/page.tsx` |
| `src/pages/Browse.tsx` | `app/(site)/browse/page.tsx` |
| `src/pages/Watch.tsx` | `app/(site)/watch/[id]/page.tsx` |
| `src/components/*` | `components/*` (shared) |
| `src/lib/api.ts` | Server-side data access via Drizzle **or** fetch absolute `/api` in RSC |
| React Router | Next App Router `Link`, `useRouter`, `searchParams` |

Visual direction: keep current **minimalist video catalog** tokens (warm monochrome, Newsreader headings, ink CTAs).

Remove from deploy path: Cloudflare `functions/`, `wrangler.toml` usage for production (can archive in repo or delete after cutover).

---

## 8. Repository layout (target)

```text
anime-web/
├── app/
│   ├── (site)/           # public catalog layout
│   ├── admin/            # admin layout + pages
│   ├── api/              # public + admin route handlers
│   ├── layout.tsx
│   └── globals.css
├── components/           # site + admin UI
├── lib/
│   ├── db.ts             # drizzle client
│   ├── schema.ts
│   ├── auth.ts           # session helpers
│   └── import.ts
├── scripts/
│   └── seed-admin.ts
├── drizzle/
│   └── migrations/
├── Dockerfile
├── docker-compose.yml    # app only
├── .env.example
├── next.config.ts
└── package.json
```

Legacy `src/`, `functions/`, `server/` either removed after migration or left unused; prefer clean cut to avoid dual stacks.

---

## 9. Docker

### Dockerfile (multi-stage)

1. `deps` — install  
2. `build` — `next build` with standalone output  
3. `runner` — Node alpine, copy standalone + static, `PORT=3000`

### docker-compose.yml

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env
    restart: unless-stopped
```

No `mysql` service. Operator ensures remote MySQL allows the VPS IP.

Healthcheck: `GET /api/health`.

---

## 10. Security

- Never log `DATABASE_URL` or passwords.
- Session secret required in production.
- Admin routes hard-gated by role.
- Rate-limit login attempts (simple in-memory or middleware throttle) — nice-to-have v1, recommended.
- Password min length 8; bcrypt cost ≥ 10.
- Credentials that appeared in chat should be **rotated** on the MySQL host when convenient.

---

## 11. Migration plan (high level)

1. Scaffold Next.js app in repo (replace Vite entry as primary).
2. Port Drizzle MySQL schema + `users` table migration.
3. Implement public API parity with Cloudflare Functions.
4. Port public UI pages to App Router.
5. Build admin auth + CRUD + import + users.
6. Dockerize; document env + deploy.
7. Smoke-test against remote MySQL; cut DNS/proxy from Cloudflare Pages to VPS.

---

## 12. Success criteria

- [ ] `docker compose up --build` starts app without local MySQL.
- [ ] Public catalog lists/plays data from existing remote tables.
- [ ] `/api/animes` contract works for mobile-style clients.
- [ ] Admin login with `role=admin` only.
- [ ] Admin can create/edit/unpublish anime, manage tags, import JSON, manage users.
- [ ] No dependency on Cloudflare Workers/D1 for production path.

---

## 13. Open decisions (resolved)

| Topic | Resolution |
|-------|------------|
| DB engine | Existing remote MySQL |
| Compose includes DB? | **No** |
| Auth model | Unified **`users`** + `role` (`user` \| `admin`) |
| Admin scope | Animes, tags, import, user management |
| Stack | Next.js full-stack |

---

## 14. Spec self-review

- No TBD placeholders for core path.
- API compatibility and admin scope are explicit.
- Secrets handled via env, not committed files.
- Scope is one implementation plan: Next migration + admin + Docker.
