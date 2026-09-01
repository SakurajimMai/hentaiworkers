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

- Reader image scheduling uses separate viewport and forward-prefetch signals. Only real viewport
  visibility may update the active page and persisted progress.
- The current required image is the only initial high-priority eager image. Future images use a
  bounded forward window and must not compete before the current image is readable.
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
- Confirm the current image is readable before future-image scheduling begins.
- Confirm request cleanup, per-page retry, page order, and progress finalization remain intact.
