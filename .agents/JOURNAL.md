# Journal

- **2026-09-23** — Added unit test coverage for `severityFloor`, `category`,
  `llmTriage`, and `sla` Convex modules (110 test cases, 4 new `.test.mjs`
  files) as part of a portfolio-wide "flagged production repos need tests"
  pass. Found and fixed a real gap in the shared test fixture
  (`config/testing/convex-fixture.mjs`): the in-memory Convex query mock
  had no `first()` implementation even though production modules call
  `.first()` on queries — only `unique()`/`take()`/`collect()`/`paginate()`
  existed. Added it matching the existing mock's style (push a `reads`
  entry, return a `structuredClone`d first row or `null`).
  No `ci.yml` changes were required: the Build job already runs
  `npm run test:unit` and `npm run test:pbt`, and both glob for
  `convex/**/*.test.mjs` / `config/**/*.property.test.mjs`, so the new
  files were picked up automatically once pushed.
  Local batch test runs hung repeatedly on the SMB-mounted checkout used
  for this session (unrelated to test correctness — individual runs and a
  throwaway-PR CI run both passed cleanly). Verified via PR #61 (closed,
  not merged — code was already pushed straight to `main` per repo
  convention) that the real GitHub Actions Build job is green with all
  four new suites in place.
