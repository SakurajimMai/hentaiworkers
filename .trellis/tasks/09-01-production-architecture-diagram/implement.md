# Implementation Plan

## Phase 1: Evidence

- [x] Record the exact reviewed `main` revision and confirm the working tree's unrelated
  `design.md` remains excluded.
- [x] Complete App runtime, production deployment, and Android/API evidence research with file and
  line references.
- [x] Reconcile research against `docs/architecture.md`; record contradictions instead of choosing
  the more convenient topology.
- [x] Record the active Caddy-to-loopback target separately from the App's observed
  `0.0.0.0:13000` publish binding, and keep Caddy/App Compose ownership distinct.

## Phase 2: Archify Candidate

- [x] Read only the Archify common schema, architecture schema, one matching architecture example,
  and the authoring/delivery references required for repository evidence.
- [x] Create `docs/diagrams/hentaiworkers-production.architecture.json` before inspecting renderer or
  validator internals.
- [x] After the first candidate exists, run the packaged update checker once and follow its result
  without changing the installed skill.
- [x] Keep at most 12 primary components, one dominant runtime path, sparse side branches, and
  evidence-backed source anchors.

## Phase 3: Validate And Deliver

- [x] Run showcase validation after each edit; repair only diagnosed subjects and preserve semantic
  relationship labels.
- [x] Require 9 artifact checks, zero composition errors, and zero warnings before freezing the JSON.
- [x] Run `deliver` once for final acceptance and save its specification/artifact SHA-256 receipt.
- [x] Run `visual-check` against the delivered HTML without modifying or rerendering it.

Final receipt after two visual correction rounds:

- Specification SHA-256: `76f333b866679bacff6c7fd7c081ac68e6fdbe9074e1a3fb72d8df8a10daaa5e`
- Artifact SHA-256: `27e17e754f85cd5c8c1ac67491482cc7045f8073090bec13067d07fa9d66af59`
- Validation: 9/9 showcase, 0 errors, 0 warnings.
- Browser evidence: passed at all four required viewports; light/dark endpoint captures passed.
- Perceptual review: passed after inspecting all four final captures.

## Phase 4: Visual And Project Check

- [x] Capture and inspect the real HTML at 1440x900, 1600x1000, 1920x1080, and 2048x1320; verify
  viewport containment, readable labels, balanced vertical composition, and an obvious main path.
- [x] Run Trellis check against the PRD/design and confirm no business/runtime files changed.
- [x] Run `git diff --check`, validate task context files, and decide whether any durable project
  convention belongs in `.trellis/spec/`.
- [x] Present a scoped commit plan; never include the unrelated root `design.md`.

Spec update decision: no project spec change. The observed `0.0.0.0:13000` binding is a dated host
snapshot rather than a durable repository convention, and the Archify delivery procedure is
task-specific. Both remain in task research and the evidence-backed artifact.

Repository checks: `npm run typecheck`, `npm run test` (218 tests), and
`npm run check:boundaries` pass. `npm run lint` has one pre-existing failure at
`tests/home-carousel.test.ts:108` (`react/no-children-prop`); that tracked file predates and is
untouched by this docs-only task.

## Rollback

Before a successful `deliver`, a failed candidate must not replace an existing HTML. If the final
artifact fails project review, remove only this task's new `docs/diagrams/` files and task-owned
planning artifacts; do not touch application or deployment state.
