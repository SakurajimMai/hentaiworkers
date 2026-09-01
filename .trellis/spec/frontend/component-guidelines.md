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
  arbitrary layout fragments from each caller.
- Horizontal card rails derive item basis from the track width so each supported breakpoint shows
  only complete cards. The homepage convention is 2 columns by default, 3 at `sm`, 4 at `md`, and
  5 at `lg`; the item width must account for every inter-card gap.
- Keep the rail item sizing class in one shared module and apply it to every direct flex child,
  including client-rendered guest history items.

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
