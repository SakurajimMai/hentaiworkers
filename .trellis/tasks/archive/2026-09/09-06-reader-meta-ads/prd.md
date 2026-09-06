# Reader, Metadata, And Ads

## Requirements

- Fix sluggish scrolling and per-page image waits in the native Android manga reader.
- Make two-finger zoom change the whole chapter reading scale, keeping reader chrome fixed. This
  interpretation follows the request wording; an optional clarification received no response.
- Let administrators configure global third-party verification meta tags.
- Support administrator-authored HTML ads and bounded, responsive common banner dimensions.

## Acceptance Criteria

- Continuous vertical reading preserves progress, restoration, retries, image quality, and lazy loading.
- Visible images and upcoming pages load without avoidable serialization or repeated decode/layout churn.
- Pinch zoom uses the confirmed scope and leaves reader controls usable.
- Saved meta tags appear in server-rendered document head, including third-party verification names.
- HTML banners support common desktop/mobile sizes without horizontal overflow or unbounded height.
- Settings remain backward compatible and existing SMTP changes remain intact.
- Root quality checks pass; native compilation and device validation status are reported accurately.
