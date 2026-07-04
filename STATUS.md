# STATUS — CampusCore

> Overwritten at the end of every work session.
> A stranger agent should be able to resume from this file in one read.

## As of: multi-school-template-hardening — Registry hardened, predicate audit closed, P1–P7 property tests green, per-school runbook appended to DEPLOYMENT.md.

### Done this session

- **Tasks 1.1–1.5 — foundation & documentation:**
  - Pinned `fast-check@3.23.2` in `devDependencies` (no runtime deps added; approval gate under AGENTS.md respected).
  - Extended `SchoolEntry` with additive fields and introduced `REGISTRY_SCHEMA_VERSION` so registry evolution is versioned rather than silently mutated.
  - Documented the trim-before-lowercase normalization pipeline for all school-membership predicates (single canonical order, single source of truth).
  - Added an entropy-floor comment on the pairing-token generator noting the current bit-width and the deferred preference for a 128-bit migration.
  - Filed 8 rows in `WAITING_ON_HUMAN.md` covering each MOE-domain verification blocked by portal access.
- **Tasks 2.1–2.3 — test scaffolding:**
  - Added a Registry static-shape test that pins the exported shape and prevents accidental field removal.
  - Added example-based predicate hardening tests covering the known-tricky inputs (whitespace, casing, empty, near-miss suffixes).
  - Added an in-memory stub for the Convex mutation surface used by pairing-flow tests, avoiding a live Convex dependency in unit runs.
- **Tasks 3.1–3.7 — property tests P1–P7 (all green):**
  - P1 fail-closed admin predicate — unknown/malformed inputs never grant admin.
  - P4 staff-domain necessary condition — a non-matching staff domain never satisfies the predicate.
  - P5 case-insensitivity — canonicalization is stable under case perturbation of the input.
  - P6 Registry uniqueness — no two `SchoolEntry` rows collide on the canonical identifier.
  - P2 pairing single-use — a valid token cannot be redeemed twice.
  - P3 pairing TTL — an expired token is rejected regardless of shape validity.
  - P7 30-day gate one-shot — the re-verification gate fires at most once per window per user.
- **Tasks 5.1–5.5 — DEPLOYMENT.md hardening (all append-only onto Session-3's file):**
  - Fork-and-Adopt Runbook (per-school onboarding checklist).
  - Admin Auth Lifecycle (grant/revoke/audit).
  - Registry Evolution Process (schema-version bump + migration note).
  - Telegram Webhook Rotation (rotation cadence and rollback).
  - Data Isolation Boundary (what does and does not cross school tenants).

### Test evidence

- `npm run test:unit` — exit 0, **80 tests / 80 pass / 0 fail**.
- `npm run test:pbt` — exit 0, **27 tests / 27 pass / 0 fail**.
- `npm run typecheck` — pre-existing UNC-path module-resolution errors only; **zero new errors** on files this spec created or modified.
- `npm run lint` — exit 0 on real source paths (`config/`, `convex/`, `app/`, `components/`, `middleware.ts`). Pre-existing lint-config gap on `.omo/` scratch dir is a Session-3-era issue and out of scope.
- `npm run build` — fails on the same UNC-path issue already documented in DEPLOYMENT.md's UNC caveat; no code path introduced by this spec is involved.

### Open items carried forward

- 8 rows in `WAITING_ON_HUMAN.md` for Registry domain verification (`sit`, `suss`, `np`, `sp`, `tp`, `nyp`, `rp`, `ite`) — cannot be closed by an autonomous agent; requires school IT portal access.
- Preferred 128-bit token migration deferred (Task 1.4 landed comment-only) — future spec.
- Dual-secret webhook variant deferred per R9.3.
- MOE school-code granularity open question deferred per R7.5.

### AGENTS.md invariant audit result

- All 8 probes clean (Task 6 report). The following are unchanged this session:
  - 60-second emergency SLA threshold.
  - Reaper TTL and `retry_count` dead-letter threshold.
  - Hazard lexicon word list.
  - NSFW/violence confidence cutoff at 0.50.
  - `priority_tier` remains server-owned (no client-mutation path added).
  - No human image-review queue introduced.
  - Legal-escalation endpoint remains a stub.
- Dependency footprint: only `fast-check` added, and only to `devDependencies` (R11.1–R11.3, R11.5 satisfied).
