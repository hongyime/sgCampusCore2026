# State

**Last updated:** 2026-09-23 (opencode/Sisyphus)

## Current task
Backend unit test coverage added for previously-untested `convex/lib` and `convex/`
modules. Task is complete — no follow-up required unless new gaps are found.

## What was done
- Added `convex/lib/severityFloor.test.mjs` (56 cases), `convex/category.test.mjs`
  (15 cases), `convex/lib/llmTriage.test.mjs` (25 cases), `convex/sla.test.mjs`
  (14 cases) — 110 test cases total, all passing.
- Fixed `config/testing/convex-fixture.mjs`: the in-memory Convex query mock was
  missing an `async first()` method (only had `unique()`, `take()`, `collect()`,
  `paginate()`), even though production code under test calls `.first()`.
- No CI workflow changes were needed — `.github/workflows/ci.yml` already runs
  `npm run test:unit` and `npm run test:pbt` in its Build job; both patterns
  (`convex/**/*.test.mjs`, `config/**/*.property.test.mjs`) auto-discover new
  test files.

## Verification
- Individually ran each of the 4 new test files locally — all passing.
- Local batch run (`node --test <4 files>` and `npm run test:unit` together)
  hung repeatedly on this SMB-mounted checkout (network-drive + TS-transpile
  overhead) — not a test failure, an environment issue.
- Verified instead via a throwaway PR (#61, closed without merging — content
  was already pushed to main) that exercised the real `ci.yml` Build job on
  GitHub's runners: **success**, including `test:unit`, `test:pbt`, `lint`,
  `typecheck`, and the `verify-*` guard scripts.

## Next steps
None required. If extending coverage further, candidates with no `.test.mjs`
sibling yet: `dashboard.ts` (partially covered via `dashboard.*.test.mjs`),
`escalations.ts`, `files.ts`, `http.ts`, `moderation.ts`, `workers.ts`.
