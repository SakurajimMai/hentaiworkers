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
- An admin table sits in an `overflow-x-auto` wrapper and every cell that must stay one line says
  so (`whitespace-nowrap` dates and counts, `truncate` slugs, `shrink-0 whitespace-nowrap` pills
  and row action buttons, row control clusters without `flex-wrap`). The browser's own min-content
  width is then the right minimum, and the wrapper scrolls below it; do not add a fixed `min-w`
  floor, which only forces a scrollbar before it is needed. Dense lists with covers swap to the
  card list below `lg`. A two-character status must never break across lines.

---

## Accessibility

- Every colour used as text pairs with a token that clears WCAG AA (4.5:1 under 18.66px bold /
  24px) on each surface it sits on, in both themes. The ember accent is a fill colour; as text it
  resolves through `--accent-text` (Tailwind `text-accent` is wired to it in `textColor`), which is
  deeper in the light theme because `--accent` itself reads only 3.3–3.7:1 there.
- Placeholders take `--muted-foreground` from the base layer. Preflight's own rule is
  `input::placeholder`, so an override needs the same selector to win; a bare `::placeholder` does
  not. Do not thin the placeholder with an alpha: 75% of the muted token falls to 3.1:1.
- Controls meet the 24×24 CSS px web target. Keep a small visual (carousel dot, inline text link)
  and give the control around it `min-h-6`/`h-6 w-6` rather than enlarging the glyph. Quiet text
  links take `.link-soft`, which carries the target and the hover colour.
- A search box with only an icon beside it carries an `aria-label`; the placeholder is not its name.
- Web storage goes through `localStore()` / `sessionStore()` from `lib/client/safe-storage`. With
  site data blocked, reading `window.localStorage` (even inside `typeof`) throws, and an unguarded
  read in a header effect removed the whole header for those visitors. Writes sit in their own
  `try`, since a full or read-only store rejects `setItem` on browsers that allow the read.
- Row actions that belong together share one `flex flex-wrap` row inside the cell (a delete form
  beside the save form), so a second action lands beside the first wherever the cell has room and
  only drops below it on a genuinely narrow row — never as a permanent extra line.

- Label carousel regions from their visible heading. Arrow controls need explicit labels and an
  `aria-controls` relationship to the scroll track.
- Touch scrolling and scroll snapping remain available even when desktop arrow controls are hidden.
- Use `ConfirmDialog` / `ConfirmSubmitButton` for confirmations. The styled HTML dialog uses
  `showModal()` for top-layer rendering and background inertness; do not replace it with
  `window.confirm()` or a fixed child of a clipped/transformed table container.
- Focus the cancel action when opening. Close the dialog and restore focus synchronously before
  invoking confirmation callbacks, so `requestSubmit()` can focus an invalid field without later
  cleanup stealing that focus. Cancellation must never submit; confirmation must submit once.
- Use `ValidatedForm` instead of `form` when a public/admin form contains constraints (including
  email/number types and controls inside dynamic editors). It preserves native constraints and
  server actions while canceling native validation bubbles and displaying field-level messages:
  ```tsx
  <ValidatedForm action={actionSaveUser}>
    <label htmlFor="email">Email</label>
    <input id="email" name="email" type="email" required />
    <button type="submit">Save</button>
  </ValidatedForm>
  ```
- Never add `noValidate` or call `form.submit()` merely to remove browser validation bubbles.
  Invalid forms must remain blocked. Keep server validation authoritative, existing hint IDs intact,
  and remove only wrapper-owned feedback when a field is corrected, removed, reset or disabled.
- `npm run test:dialogs:browser` checks cancellation, submit-once, invalid/corrected inputs, dynamic
  editors, focus restoration/containment, themes, reduced motion and narrow/short viewports.
  Set `CHROME_PATH` to a local Chromium executable when Chrome is not installed at the default path.

---

## Common Mistakes

- Do not give carousel cards fixed pixel widths inside a responsive container. Any remainder exposes
  a clipped next card and makes page-sized arrow movement misalign with snap points.
- Do not size logged-in and guest variants independently when they render in the same rail.
- Do not verify a responsive bar at one wide viewport. Browser zoom and OS display scaling divide
  the reported width, so 1440 at 125% is a 1152px viewport — check the band just above each
  breakpoint, which is where a bar that fits at 1920 starts wrapping.
