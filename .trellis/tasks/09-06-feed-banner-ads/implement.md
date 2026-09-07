# Implement

1. Add `/ads/html/[...slot]` route that renders `buildHtmlAdSrcDoc` from public ads
   config. Shared path helper for client + server.
2. Patch HTML ad runtime: adopt body orphans, measure body height. Sync Android asset.
3. `HtmlAd` / player helpers: `documentSrc` + `src` toggle. Wire home, feed, reader,
   player to slot URLs.
4. Feed `placement` in settings, form, public types, OpenAPI, admin editor, web grid,
   Android DTO + grid span.
5. Tests (unit, contract, browser) and admin/API docs + frontend spec.
6. `npm run lint && npm run typecheck && npm run test && npm run test:ads:browser`.
