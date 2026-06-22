# STATUS — CampusCore

> Overwritten (not appended) at the end of every work session.
> A stranger agent should be able to resume from this file in one read.

## As of: Session 1 — through TASK-16 + the ingestion slice (TASK-13/28) + multi-school template (38–40)

### Done (on `main`, all pushed)
- **Continuity (TASK-0)** + **Scaffold (1–4)**: Next.js App Router + Convex,
  ESLint/Prettier, `.env.example`, stub-tolerant Convex+Clerk providers.
- **Data Model (5–7)**: `convex/schema.ts` — `tickets`, `_telegram_egress_queue`
  (`by_status_priority_created` compound index + `by_ticket`),
  `_critical_escalations`, plus `pairings` + `users`.
- **Auth (8–11)**: Clerk middleware (now per-school, see below); Convex+Clerk
  `auth.config.ts` (JWKS RS256, no decrypt); deep-link pairing
  (`convex/pairing.ts`, 3-min TTL, single-use, fail-closed); 30-day
  re-verification helper (`convex/lib/verification.ts`).
- **Multi-school template (38–40, NEW SCOPE — user decision Session 1):**
  CampusCore is now a PER-SCHOOL deployable template. `config/schoolRegistry.ts`
  (researched SG institution domains), `config/school.ts` (active-school
  resolution + member/staff/admin predicates). `middleware.ts` + `pairing.ts`
  rewired off hardcoded `@smu.edu.sg`. Admin = staff-domain email AND on
  `CAMPUSCORE_ADMIN_ALLOWLIST` (fails closed). Tenancy = one deploy per school,
  so **no `school_id` in the data model**.
- **Telegram ingestion (12, 13)**: `convex/http.ts` webhook (secret-header
  check, synchronous reply slot for `answerCallbackQuery`); message branch runs
  `runTriage` then `internal.ingest.createTicket`.
- **Triage libs (14, 15, 16)**: `lib/ahoCorasick.ts` + `lib/lexicon.ts`
  (approval-gated word list); `lib/severityFloor.ts` (the ONLY priority_tier
  writer — lexicon match → tier 1); `lib/llmTriage.ts` (Groq + offline
  fallback, never writes priority_tier).
- **Ingestion + SLA (13, 28)**: `convex/ingest.ts` (gate → server tier →
  ticket + egress row → `runAfter(60_000, internal.sla.checkEmergencySla)` for
  tier-1); `convex/sla.ts` (`checkEmergencySla`: at 60s, if egress not "sent",
  writes idempotent `sla_breach` escalation).
- **Category State Machine (17)**: `convex/category.ts` + webhook dispatcher.
  First write sets category + `initial_tap_at`, upgrades to tier 1 if "Safety".
  Corrections within 15s are allowed to upgrade tier but never downgrade.
  Outside 15s, updates are visual-only.
- **Moderation Pipeline (18–21)**: Built `app/api/upload/route.ts` as the Telegram
  Mini App upload bridge (enforcing Cloudflare CSAM scan). Used `onnxruntime-web`
  in `convex/lib/nsfwScorer.ts` for scoring. Added `updateImageModerationResult`
  mutation (`convex/moderation.ts`) and `image_storage_id` to schema. Threshold
  is `P >= 0.50` (removed) / `< 0.50` (broadcast + stored). No `pending_review`.

### Next task — Egress Queue (TASKS 22–27) (start here)
This is the core of the priority broadcast system (tech_design §5).
- Build `convex/queue.ts` with `claim_batch` (atomically read top-N `pending` to `processing`) and `finalize_batch`.
- Build the Reaper: sweeps `processing` > 10m30s to `pending`. At `retry_count >= 3`, moves to `dead_letter`.
- Build Worker A (Express, batch=1, tier-1) and Worker B (Standard, batch=25, tier-2).
- **CRITICAL**: Burst-test 50+ tickets before commit (AGENTS.md).

### Then, in TASKS.md order
- SLA channels (29 dashboard takeover UI, 30 Resend email stub).
- Dashboard (31–35), Legal stub (36), Validation (37).

### Decisions / non-obvious context for a cold start
- **NOTHING COMPILES YET — verify before trusting.** No `npm install` (no
  `node_modules`) and no `npx convex dev`/`codegen` (no `convex/_generated/`,
  which all backend files import). FIRST ACTIONS once the Convex deploy key is
  available (WAITING_ON_HUMAN.md): `npm install && npx convex codegen &&
  npm run typecheck && npm run lint`. Until then, type errors are invisible.
- **Scope change flagged (AGENTS.md §0):** the docs assume single-tenant
  `@smu.edu.sg`; the user changed this to a per-school template (38–40). This
  is an approved decision, not an unresolved conflict.
- **priority_tier discipline:** still server-owned. The ONLY writers are
  `severityFloor.resolvePriorityTier` (ingestion) and — coming in TASK-17 — the
  first-write "Safety" rule, derived server-side. No client value ever sets it.
- **Webhook latency:** the message branch awaits `runTriage` (up to 5s) before
  responding to Telegram. Acceptable (offline fallback + 5s AbortSignal), but
  consider moving triage to a scheduled job if Telegram retries are observed.
- **`createTicket` is an `internalMutation`** (not client-callable) — good, it
  writes priority_tier. Keep it internal.
- Commit style: `[TASK-<n>] ...`, tick the box in the SAME commit, push to
  `main` every time. Task numbers may be non-monotonic where dependencies
  forced reordering (e.g. 28 landed with 13) — that's expected.

### Blockers / waiting on human
- **SECURITY:** `origin` remote URL embeds a GitHub PAT in plaintext in
  `.git/config`. Rotate + switch to SSH/credential helper (WAITING_ON_HUMAN.md).
- All third-party keys + Cloudflare zone deferred; everything built on stubs.
- Per-school config: set `CAMPUSCORE_SCHOOL_CODE` + `CAMPUSCORE_ADMIN_ALLOWLIST`
  in BOTH Next and Convex env; confirm `// verify` student subdomains in
  `config/schoolRegistry.ts` before any production deploy.

### Validation checklist (tech_design §9)
- Not yet run (needs live infra + a deploy). Tracked in WAITING_ON_HUMAN.md.
