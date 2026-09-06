# Site Metadata And Ads

- Global verification tags live in `site.metaTags` as validated `name`/`property`, key, and content
  records. Use React attributes in the root server layout so tags are present before JavaScript runs.
- The meta importer uses the browser HTML parser in an inert document and accepts only meta tags.
  Never inject a verification snippet as raw head HTML. Keep viewport/theme attributes app-owned.
- Settings forms distinguish an absent meta field (preserve stored tags) from an explicit empty list
  (remove tags). Invalidate both the metadata cache tag and root layout after saving settings.
- HTML ad creatives run in dedicated documents so script and document.write semantics work. Web
  embeds stay sandboxed; resize messages must match both the frame window and per-frame identity.
- Banner creative dimensions are optional additions to the public API. Existing settings use automatic
  layout; configured creatives scale to available width without stretching their aspect ratio.
- Measure automatic ad height from content, not the root iframe viewport. Cap automatic height and
  support shrinking after a creative changes; stale documents cannot resize their replacements.
- Player HTML frames remain inactive until the pre-roll or pause surface is visible. Clear their
  documents on skip, resume, close, or disposal so hidden scripts and media stop. Preserve configured
  click destinations for HTML content using user-gesture HTTP(S) navigation in the ad document.
- Run `npm run test:ads:browser` and `npm run test:meta:browser` when changing these contracts.
  Inspect screenshots and verify mobile/desktop field geometry as well as HTML assertions.
