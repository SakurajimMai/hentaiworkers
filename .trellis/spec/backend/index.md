# Backend Guidelines

> Executable contracts for the AnimeStream application runtime and deployment.

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [App-Only Boundary](./app-only-boundary.md) | Runtime, repository, database, deployment, and verification boundary | Active |

## Pre-Development Checklist

- Read the App-only boundary before changing backend routes, scripts, database files,
  environment variables, Docker, or CI.
- Identify whether the change belongs to `catalog`, `identity`, `system`, or the independent
  root `crawler/` workspace.
- Do not add a second runtime process to the application deployment.

## Quality Check

```bash
npm run lint
npm run typecheck
npm run test
npm run check:legacy
npm run check:boundaries
npm run build
```

For Docker changes, also run `docker compose config` and `docker build --check .`.
