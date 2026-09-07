# Fix alliance banner scripts in feed ads

## Goal

Alliance banner snippets (Adsterra-style `atOptions` + `invoke.js`, 300×250 / 728×90 / etc.)
must actually render when pasted into feed or reader HTML slots, and feed banners must
display as full-width banners instead of being squeezed into a portrait catalog card.

## Requirements

- Pasting a typical iframe-format alliance snippet into a feed HTML slot must load and
  display the creative on the website (home, /browse, /manga) and in Android WebViews.
- The same snippet must work in manga-reader top/bottom banner slots.
- Feed ads need an explicit card vs banner layout. Banners span the catalog grid;
  empty “招租” native cards stay poster-sized.
- Existing saved HTML feed slots should become banners without a manual re-save.
- Ad scripts must not gain access to the parent page or session cookies.
- Public `/api/ads` remains backward compatible: new fields are additive.

## Acceptance Criteria

- [ ] An `atOptions` + external `invoke.js` snippet that uses `location.protocol` and
      `document.write` / `document.body.appendChild` paints a visible 300×250 (or configured)
      creative in feed, home, and reader HTML surfaces.
- [ ] Feed banners use a full-width row on web catalog grids; native cards without HTML stay
      in the poster grid. Android banners span the grid; cards occupy one cell.
- [ ] Admin settings expose 信息流卡片 vs 横幅, keep HTML textarea large enough for snippets,
      and tell operators to match the alliance width/height.
- [ ] Sandboxed ad documents still cannot read `parent.document`.
- [ ] Unit, contract, and `npm run test:ads:browser` cover protocol-relative scripts,
      body-appended creatives, and banner layout. Root lint/typecheck/tests pass.
