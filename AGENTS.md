<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->

# Project notes (AnimeStream / hentaiworkers)

These notes are for AI assistants and are **not** managed by Trellis.

## Product scope

- **里番 only**: catalog tables `animes`, `tags`, `anime_tags`.
- This repository contains only the Next.js application. Data collection, media download,
  storage upload, scheduling, and machine-control APIs are out of scope.
- A future data producer must be designed as a separate project and must not import private
  application modules or add its runtime/configuration back to this repository.
- **Do not reintroduce** MacCMS adapters, `anime_works` / `work_tags`, `/works` UI, stream proxy, or line-parser player settings unless the user explicitly requests that product direction.
- Historical migrations `0010–0013` may still create old works tables on fresh migrate chains; app code must not read/write them. See `docs/CHANGELOG.md`.

## Canonical docs

| Doc | Use |
|-----|-----|
| `README.md` | Quick start |
| `docs/architecture.md` | System design |
| `docs/development.md` | Local dev / scripts |
| `docs/admin-guide.md` / `docs/user-guide.md` | Ops & UX |
| `docs/api/README.md` + OpenAPI | Public API contract |
| `docs/CHANGELOG.md` | Scope-breaking changes |

## Commands worth knowing

```bash
npm run dev
npm run seed:admin
npm run lint
npm run typecheck
npm run test
npm run check:boundaries
npm run build
```
