# Journal - root (Part 1)

> AI development session journal
> Started: 2026-08-02

---


## Session 1: Remove crawler runtime and control plane

**Date**: 2026-08-03
**Task**: Remove crawler runtime and control plane
**Branch**: `main`

### Summary

Removed crawler and Worker code, control-plane APIs/UI/schema/scripts, shared media/proxy coupling, and worker deployment; retained an App-only Next.js repository with passing quality gates.

### Git Commits

| Hash | Message |
|------|---------|
| `226befb` | (see git log) |

### Status

[OK] **Completed**


## Session 2: Add isolated Hanime crawler workspace

**Date**: 2026-08-04
**Task**: Add isolated Hanime crawler workspace
**Branch**: `main`

### Summary

Added an independent crawler/hanime Python workspace while keeping the deployed Next.js App and Compose topology unchanged; tracked only a sanitized configuration example and archived the completed Trellis task.

### Main Changes

- Added the isolated Hanime crawler source, dependency manifest, tests, documentation, and sanitized YAML example.
- Updated App boundary specifications so crawler code remains outside the App build and runtime.
- Archived task 08-04-allow-crawler-workspace after implementation and verification.

### Git Commits

| Hash | Message |
|------|---------|
| `fa1f09b` | (see git log) |
| `cd219e8` | (see git log) |
| `d92a868` | (see git log) |

### Testing

- [OK] Main project lint, typecheck, 134 TypeScript tests, legacy and boundary checks, Next.js build, Compose checks, and Dockerfile check passed.
- [OK] Crawler Python sources passed py_compile and the example YAML parsed successfully; dependency-based Python tests were not run because pip/ensurepip is unavailable on this host.

### Status

[OK] **Completed**

### Next Steps

- Install crawler dependencies in an isolated environment before running its focused Python unit tests.


## Session 3: Fix Android weak-network timeout

**Date**: 2026-08-30
**Task**: Fix Android weak-network timeout
**Branch**: `feat/kotlin-android-client`

### Summary

Raised bounded Android API timeouts, localized transport errors, made home loads independently resilient with inline retry UI, added regression tests, passed root checks and three GitHub Actions Android gates, and published production-signed build-62.

### Git Commits

| Hash | Message |
|------|---------|
| `34540b9` | (see git log) |

### Status

[OK] **Completed**
