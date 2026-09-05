# Fix continuous reader prefetch on web and Android

## Goal

Fix delayed continuous reading in both the browser and native Android reader.

## Requirements

- Visible pages obtain a loading opportunity immediately, independent of initial-image completion.
- Preserve bounded speculative work, reverse reading, restoration, retry, favorites, progress, ads, themes, and Android subsampling.
- Android uses adjacent memory previews and farther disk-only prefetch with bounded concurrency and shared downloads.
- The user explicitly requested direct implementation and tests in this turn.

## Acceptance Criteria

- [ ] Browser delayed-image tests cover early prefetch, fast jumps, reverse reading, restoration, failures, bounded chapter opening, readability, and ad/progress isolation.
- [ ] Android controlled-service tests distinguish network, disk, memory, decode, and display observations.
- [ ] Report executed checks and unavailable device/build checks honestly; provide APK rebuild steps.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
