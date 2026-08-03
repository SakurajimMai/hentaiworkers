# Implementation Plan

## 1. Add Main-Site Safety Checks

- Replace the broken quoted TypeScript glob with deterministic test discovery.
- Add an App-only boundary check covering forbidden paths, control-table identifiers, commands, env variables, routes, Compose services, and current docs.
- Run the checks once against the current tree to confirm they fail for the expected crawler content.

## 2. Preserve Main Utilities, Then Delete Control Plane

- Move the generic secret-cipher contract and hashing helper into `lib/server/shared/**`.
- Update system settings, crypto infrastructure, and password-reset tests.
- Delete all main-site crawler UI/routes/components, internal Worker APIs, domain/application/port/test code, and crawler DB infrastructure.
- Remove crawler navigation/dashboard copy.
- Delete local-cover route/helpers/tests and remove related environment/volume handling.

Validation:

```bash
npm run lint
npm run test
npm run check:boundaries
```

## 3. Remove Crawler Project And Database Tooling

- Delete `crawler/**` in full.
- Delete root crawler/Worker wrapper, provision, enqueue, reap, fail, compaction, requirement, and Python test scripts.
- Delete crawler control/core SQL and pure crawler migrations; retain application migrations and required historical works migrations.
- Keep database setup/migration as a reviewed external SQL process; do not replace deleted
  crawler scripts with a new runtime migration framework.
- Do not execute destructive SQL against any database.

Validation:

```bash
npm run test
npm run check:legacy
npm run check:boundaries
```

## 4. Make Deployment App-Only

- Reduce root and deploy Compose files to one App service.
- Delete Worker environment examples and shared volume initialization.
- Reduce Docker publishing to the App image only.
- Update deployment tests for the App-only topology.

Validation:

```bash
docker compose config
Parse and contract-test `deploy/docker-compose.yml` without requiring production secrets.
Run `docker build --check .`; run a full image build when Docker execution is available.
```

## 5. Align Documentation And Project Notes

- Update root/canonical documentation and `AGENTS.md` project notes to describe an App-only repository.
- Remove crawler sections from architecture, development, deployment, admin guide, API index, changelog references, and README command lists.
- Delete the internal crawler OpenAPI file and crawler-specific historical docs where they are standalone obsolete artifacts.
- Keep explicitly required historical works migration notes.

## 6. Full Verification

```bash
npm run lint
npm run test
npm run build
npm run check:legacy
npm run check:boundaries
docker compose config
docker build --check .
git diff --check
```

Also run targeted `rg` and `find` checks for crawler/Worker/control-plane remnants. Live MySQL validation and production data cleanup are not performed and must be reported as such.
