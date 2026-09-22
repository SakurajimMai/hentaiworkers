# Implementation plan

1. Review task artifacts and receive implementation approval, then activate the task with task.py start.
2. Improve shared confirmation component and submission control; inspect every existing caller for compatibility.
3. Add accessible inline constraint feedback and migrate all constrained runtime forms; preserve server actions and validation rules.
4. Add browser regression coverage using the existing esbuild + Playwright fixture approach, including real form submission and invalid input behavior. Capture light/dark desktop/mobile screenshots for inspection.
5. Run npm run lint, npm run typecheck, npm run test, npm run check:boundaries, and the new browser checks. Inspect screenshots and complete full-scope review.
6. Record shared modal/validation contracts in frontend specs. Present verified changes and a proposed commit for approval; do not auto-commit or push.

## Review gates
Invalid forms cannot submit, cancellation cannot mutate data, successful confirmation submits once, keyboard focus cannot escape the modal, and no constrained runtime forms retain native bubbles after hydration.

## Execution status

Implementation, full review, frontend spec update and required checks completed on 2026-09-22. See validation.md for results and the approved commit. User approved committing the changes on 2026-09-22; task archive/journal wrap-up can follow with finish-work.
