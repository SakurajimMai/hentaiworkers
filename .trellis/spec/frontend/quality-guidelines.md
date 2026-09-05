# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

<!--
Document your project's quality standards here.

Questions to answer:
- What patterns are forbidden?
- What linting rules do you enforce?
- What are your testing requirements?
- What code review standards apply?
-->

(To be filled by the team)

---

## Forbidden Patterns

<!-- Patterns that should never be used and why -->

- Do not let an expanded prefetch intersection region select the reader's active page or write
  reading progress. A prefetch hit is not evidence that the page reached the real viewport.
- Do not gate the chapter image list on favorites, ads, analytics, recommendations, or other
  optional reader UI.
- Do not report a spinner disappearing, an API response, or an unverified LCP element as image
  readability.
- Do not use smooth scrolling for automatic reading-position restoration. Intermediate pages can
  become visible and overwrite the intended saved position.

---

## Required Patterns

<!-- Patterns that must always be used -->

- Reader image scheduling uses separate viewport and directional-prefetch signals. Only real viewport
  visibility may update the active page and persisted progress.
- The current required image is the only initial high-priority eager image. Future images use a
  bounded directional window with at most two pending speculative requests. Current-image download
  and decode must not block prefetch or visible-page admission. Actual visible pages bypass occupied
  speculative slots; previously admitted display images stay mounted to reuse the same request.
- Give the initial transfer a maximum 300 ms speculative head start, ending earlier on its load
  or error event. This is a bounded startup grace, never a readability/ad gate; real visible pages
  bypass it. Validate first-image performance with substantial image bytes, not only tiny fixtures.
- Keep admitted pages distinct from successful downloads. Success and failure both release a
  scheduler slot; errors do not automatically retry. Retry callbacks re-enter pending accounting.
- Derive neighbor offsets from the actual ordered page list. Admin page deletion does not
  renumber stored page indexes, so `index < pages.length` is not a valid admission or restore check.
- Ads keep their initial target-image decode/paint gate independently of prefetch. Dynamic request
  priority follows the actual active page; it must not change which initial page gates ads.
- Automatic restoration initializes the target page before progress persistence is eligible and
  uses an instant scroll even when the site enables global smooth scrolling.
- Reader image failures remain isolated per page; one failed image must not block the chapter.
- Measure reader time-to-readable at the target image's completed decode followed by two animation
  frames. LCP is supplementary and must include the observed element identity.

---

## Testing Requirements

<!-- What level of testing is expected -->

- Cover viewport/prefetch separation, restored-page bounds, anonymous versus authenticated
  progress, stale writes, and individual image failure behavior with deterministic tests.
- Compare cold-cache reader changes under the same viewport, CPU, and network conditions for at
  least five runs. Record target request start, response end, decode plus two-frame readability,
  request count, priority, and final restored page.
- Require DOM or memory trace evidence before introducing reader virtualization. Page-count alone
  is not sufficient, because inaccurate placeholders can break restoration and create blank
  reverse scrolling.

---

## Code Review Checklist

<!-- What reviewers should check -->

- Confirm optional server work is outside the critical reader response.
- Confirm prefetch cannot mutate active-page or progress state.
- Confirm automatic restoration cannot observe and persist intermediate pages.
- Confirm future requests start while the current image is pending, within the bounded window
  and speculative capacity, and only ads wait for the initial image's settlement.
- Confirm request cleanup, per-page retry, page order, and progress finalization remain intact.
