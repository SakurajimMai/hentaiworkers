# Implementation plan

1. Add tested reader preparation and readiness policies: chapter key, single-flight/TTL cache, target preview key, bounded preview/full prefetch windows, retry behavior.
2. Wire `prepareReader()` into manga detail and every reader navigation; make `loadReader()` consume prepared/in-flight data without recording history early.
3. Warm the restored target image with a bounded memory preview and the original disk key; display that preview without hiding the eventual full-quality Telephoto image.
4. Make home loading entry-driven, delay reader ads until the first full page, and share the same-origin OkHttp connection pool/dispatcher without sharing cookies.
5. Add Account/Login registration actions using the validated website `/register` flow and inline failure feedback.
6. Update Android specs and user/mobile documentation to describe the preparation, prefetch, deep-link, and registration contracts.
7. Run `git diff --check`, root lint/typecheck/tests/legacy/boundaries/build, then perform a full-scope mobile review. Do not run local Gradle.
8. After commit approval, push and require the Android GitHub Actions workflow before any APK distribution; measure cold/warm physical-device timings when a device is available.

Rollback points:

- Reader store/warmup can be reverted independently from home/connection changes.
- Registration is only a UI/navigation addition and can be reverted independently.
- No persisted schema or external API migration is introduced.
