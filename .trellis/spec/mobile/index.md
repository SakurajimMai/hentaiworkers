# Mobile Development Guidelines

> Executable contracts for the independent AnimeStream Android client.

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Native Android Client](./native-android.md) | Repository boundary, compatibility, reader/player, and CI-only build rules | Active |

## Pre-Development Checklist

- Read the native Android client contract before changing `mobile/**` or the Android workflow.
- Preserve package/signing compatibility and the existing HTTP API behavior.
- Do not run Gradle, JDK, Android SDK, emulator, or device builds locally.

## Quality Check

Run the root checks locally:

```bash
npm run lint
npm run typecheck
npm run test
npm run check:legacy
npm run check:boundaries
npm run build
```

Push the task branch and require the **Build Android APK** workflow to pass
`ktlintCheck`, `lintRelease`, `testDebugUnitTest`, APK identity checks, and
`assembleRelease`. Treat the Android build as unverified until that remote run succeeds.
