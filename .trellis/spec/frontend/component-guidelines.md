# Component Guidelines

> How components are built in this project.

---

## Overview

<!--
Document your project's component conventions here.

Questions to answer:
- What component patterns do you use?
- How are props defined?
- How do you handle composition?
- What accessibility standards apply?
-->

(To be filled by the team)

---

## Component Structure

<!-- Standard structure of a component file -->

(To be filled by the team)

---

## Props Conventions

<!-- How props should be defined and typed -->

(To be filled by the team)

---

## Styling Patterns

- Shared components use Tailwind utility classes and expose domain props rather than accepting
  arbitrary layout fragments from each caller. Dynamic layout classes such as `col-span-2` must
  be written as complete literals under `app/` or `components/`; Tailwind content does not scan
  `lib/`.
- Horizontal card rails derive item basis from the track width so each supported breakpoint shows
  only complete cards. The homepage convention is 2 columns by default, 3 at `sm`, 4 at `md`, and
  5 at `lg`; the item width must account for every inter-card gap.
- Keep the rail item sizing class in one shared module and apply it to every direct flex child,
  including client-rendered guest history items.
- A fixed-height bar holds a `flex-nowrap` row whose items are `shrink-0 whitespace-nowrap`; the
  bar itself scrolls horizontally when the labels outgrow it. Decide what gives way first — the
  destinations are the last thing to go — and drop optional chrome at the breakpoints where the
  row gets tight instead of letting it wrap out of the bar.
- Admin rows (bar, compact nav, page body) share `.admin-shell`, and anything sticky below the
  admin header offsets itself by `--admin-header-height` rather than repeating the pixel value.

---

## Accessibility

- Label carousel regions from their visible heading. Arrow controls need explicit labels and an
  `aria-controls` relationship to the scroll track.
- Touch scrolling and scroll snapping remain available even when desktop arrow controls are hidden.

---

## Common Mistakes

- Do not give carousel cards fixed pixel widths inside a responsive container. Any remainder exposes
  a clipped next card and makes page-sized arrow movement misalign with snap points.
- Do not size logged-in and guest variants independently when they render in the same rail.
- Do not verify a responsive bar at one wide viewport. Browser zoom and OS display scaling divide
  the reported width, so 1440 at 125% is a 1152px viewport — check the band just above each
  breakpoint, which is where a bar that fits at 1920 starts wrapping.
