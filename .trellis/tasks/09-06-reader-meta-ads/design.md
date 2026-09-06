# Design

## Ownership

- Native reader: existing Compose LazyColumn, Telephoto zoom/subsampling, shared Coil image pipeline.
- Global metadata: system settings domain and service, admin settings form, server-rendered root head.
- Ads: existing system ad slots, HTML rendering, native public DTOs and banner components.

## Decisions

- Preserve the independent Android/App runtime boundary and existing public API compatibility.
- Use existing image and gesture libraries; identify request/layout bottlenecks before changing policy.
- Store meta tags as validated name/content records, rendering with React attribute escaping.
- Extend banner settings with bounded dimensions and backward-compatible defaults. Use a fixed creative
  viewport scaled to available width when a size is configured; bound automatic layout as well.
- Preserve third-party HTML/script execution inside the existing isolated advertising surfaces.
- No database migration is needed for additive JSON settings. Do not touch unrelated SMTP behavior.

## Validation And Rollback

- Add focused policy, settings round-trip, and real-browser ad/meta checks.
- Run the required root checks and inspect browser layouts on mobile/desktop.
- Android checks run remotely only. Do not distribute an unverified APK.
- Changes are additive or confined to reader behavior and can be reverted independently.
