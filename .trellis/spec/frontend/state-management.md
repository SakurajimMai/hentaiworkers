# State Management

> How state is managed in this project.

---

## Overview

The App Router keeps catalog and private-library server state in Server Components. Client
Components are leaf controls for optimistic actions, local device storage, and browser-only
interaction. Do not copy a complete server collection into client state merely to filter or
paginate it.

---

## State Categories

- Local component state: transient controls, pending state, and local-device history.
- Server state: catalog, identity, favorites, and cloud progress loaded through server services.
- URL state: pagination and filters that must survive refresh, back/forward navigation, and deep
  links. Page one omits its page parameter.
- Derived state: totals and page boundaries come from the server query result, not the current
  rendered array length.

---

## When to Use Global State

Use global state only when several unrelated client subtrees must share browser-only state.
Authentication and private library collections remain server-owned; refresh their Server
Component boundary after a mutation.

---

## Server State

Private library reads are dynamic and must not use the public catalog cache. Large collections
use database pagination with a true total, a clamped requested page, and deterministic ordering.
Mutations preserve the current URL; if the last item on the last page is removed, the next server
render canonicalizes the URL to the new last page.

---

## Common Mistakes

- Fetching an entire private collection and slicing it in a Client Component.
- Treating a failed query as an empty array and showing a false empty state.
- Using array length as the total when the server query is capped.
- Keeping pageable state only in `useState`, which breaks refresh and browser navigation.
- Sorting only by a timestamp; add a stable ID tie-breaker for page boundaries.
