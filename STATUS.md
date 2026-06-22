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

### Next task — TASK-17 (start here): category first-write / 15s correction
This is a SAFETY-CRITICAL priority_tier path (AGENTS.md approval checkpoint —
the 15s window). Read tech_design §3.4 carefully. Build:
- Parse `callback_query.data` in `convex/http.ts` (format suggestion:
  `cat:<Category>:<ticketId>`), then call a new mutation, e.g.
  `convex/category.ts` → `tapCategory({ ticketId, category })`.
- **First write** (`category === null`): always honored regardless of elapsed
  time. Set `category`, set `initial_tap_at = Date.now()`, `triage_status`
  stays/locks per design. If the tapped category is "Safety", the SERVER sets
  `priority_tier = 1` here — this is the one allowed priority_tier write
  outside the lexicon floor (§3.4). The client sends the *category*, never the
  tier; the server derives the tier. This does NOT violate AGENTS.md's "no
  client-facing priority_tier write" rule **as long as** the tier is derived
  server-side from the category+first-write rule, not taken from input.
- **Correction** (`category !== null`): honored only if
  `Date.now() - initial_tap_at <= 15000`. Outside the window, update `category`
  for dashboard accuracy but DO NOT change `priority_tier` (closes the
  re-tap-Safety queue-jump vector). Within the window: decide explicitly
  whether a correction may change tier — note that a lexicon-set tier-1 should
  be treated as immutable (do not let a category correction DOWNGRADE an
  emergency the lexicon raised). Flag this decision in your commit/STATUS.
- The webhook already acknowledges the tap via the synchronous
  `answerCallbackQuery` slot; the mutation is the durable write.

### Then, in TASKS.md order
- Moderation (18–21): ONNX WASM scorer, P>=0.50 delete + placeholder (no
  pending_review), CSAM behind `CSAM_SCAN_ENABLED` flag, Mini App upload bridge.
- Egress Queue (22–27): `claim_batch`/`finalize_batch`, reaper (10min+30s TTL,
  retry>=3 → dead_letter, tier-1 dead_letter → `_critical_escalations`),
  Worker A (batch=1), Worker B (batch=25, per-request 5s AbortSignal), ticket_id
  broadcast prefix. **Burst-test 50+ tickets before commit (AGENTS.md).**
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
