# CampusCore — Build Task Checklist

> Flat, atomic, dependency-ordered. Each task is one sitting / one commit.
> Check off (`- [x]`) in the **same commit** that completes the task.
> Commit message format: `[TASK-<n>] <short description>`.
> Headers map to `tech_design.md` sections so dependency order is visible.

## Scaffold (tech_design §1 Infrastructure)
- [x] TASK-1: Next.js (App Router) + Convex project skeleton — `package.json`, `tsconfig.json`, `next.config.mjs`, `convex/` dir, base `app/` shell.
- [x] TASK-2: Lint/format config — ESLint flat config + Prettier, `npm run lint`/`format` scripts.
- [x] TASK-3: `.env.example` — every required env var name + one-line "where to get it" comment, no real values.
- [x] TASK-4: Convex + Clerk provider wiring in `app/layout.tsx` / `app/providers.tsx` (keys read from env; stubs tolerated).

## Data Model (tech_design §2)
- [x] TASK-5: `convex/schema.ts` — `tickets` table (category nullable, priority_tier 1|2, triage_status, initial_tap_at, timestamps, location_entity, headline).
- [x] TASK-6: `convex/schema.ts` — `_telegram_egress_queue` table + **compound index `(status, priority_tier, created_at)`**.
- [x] TASK-7: `convex/schema.ts` — `_critical_escalations` table (ticket_id, reason, created_at).

## Auth (tech_design §1 Authentication)
- [x] TASK-8: Clerk middleware + `@smu.edu.sg` gate in app code (dashboard-level restriction deferred to human — see WAITING_ON_HUMAN.md).
- [x] TASK-9: `convex/auth.config.ts` — JWKS RS256 signature verify + `exp`/`nbf` check against Clerk JWKS endpoint (via Convex's Clerk provider); never "decrypt". Do not log full JWT payloads.
- [x] TASK-10: `convex/pairing.ts` — deep-link pairing token: 3-minute TTL, single atomic redeem mutation keyed on token ID, idempotent / fail-closed on second redemption. (Also added `users` table that the 30-day gate uses.)
- [x] TASK-11: 30-day re-verification gate — `last_verified_at` blocks further bot activity until SSO re-auth. (`convex/lib/verification.ts`; wired into webhook in TASK-12/13.)

## Telegram Ingestion (tech_design §1, §3)
- [x] TASK-12: `convex/http.ts` Telegram webhook skeleton (stubbed token) — parses update, uses the **synchronous webhook-reply slot** for `answerCallbackQuery` (one method per update).
- [x] TASK-13: Ingestion (`convex/ingest.ts` + webhook message branch) — verify 30-day gate, resolve server-owned tier, create `tickets` row, enqueue egress, fire `runAfter(60000, check_emergency_sla)` for tier-1.

## Triage Logic (tech_design §3)
- [x] TASK-14: `convex/lib/ahoCorasick.ts` — Aho-Corasick automaton + fixed hazard lexicon ingestion (lexicon list is an approval-checkpoint item — kept in `convex/lib/lexicon.ts`).
- [x] TASK-15: Severity floor (`convex/lib/severityFloor.ts`) — lexicon match hardcodes `priority_tier: 1`, server-side only, immutable after ingestion. LLM severity ignored on match.
- [x] TASK-16: `convex/lib/llmTriage.ts` — LLM structured-output call (stubbed API key) returning `{ headline, severity_score, routing_tag, location_entity }`; **never** writes `priority_tier`. Degrades to deterministic offline fallback with no key.
- [x] TASK-17: Category state machine — first write always honored (sets tier-1 only if "Safety" + first write); correction honored only if `Date.now() - initial_tap_at <= 15000`, else visual-only.

## Moderation Pipeline (tech_design §4)
- [x] TASK-18: `convex/lib/nsfwScorer.ts` (or Next API route) — ONNX Runtime **WASM** scorer module (`onnxruntime-web`), quantized model load.
- [x] TASK-19: Threshold logic — `P>=0.50` → delete + "Image automatically removed" placeholder; `P<0.50` → pass. **No `pending_review` state. No human view.**
- [x] TASK-20: Cloudflare CSAM hash-match step behind a `CSAM_SCAN_ENABLED` feature flag (stubbed off until zone is orange-clouded — see WAITING_ON_HUMAN.md).
- [x] TASK-21: Telegram Mini App upload bridge — force image upload through the Cloudflare-proxied zone (not Telegram `getFile`).

## Egress Queue (tech_design §5, §6)
- [x] TASK-22: `convex/queue.ts` — `claim_batch` mutation: atomically read top-N `pending` (compound-index order) → `processing` in one serializable transaction.
- [x] TASK-23: `convex/queue.ts` — `finalize_batch` mutation: set `sent` + `egress_cleared_at`, or bump `retry_count`.
- [x] TASK-24: Reaper — sweep rows `processing` > (Convex Action ceiling 10min + 30s buffer) back to `pending`; `retry_count >= 3` → `dead_letter`; tier-1 dead_letter also writes `_critical_escalations`.
- [x] TASK-25: Worker A — Emergency Express action: claims/dispatches tier-1 **one at a time** (batch=1, no shared batch).
- [x] TASK-26: Worker B — Standard Batch action: claims up to 25 tier-2; each Telegram `fetch` has its own 5s `AbortSignal`; `Promise.allSettled`.
- [x] TASK-27: Broadcast format — every message prefixed with immutable `ticket_id` (e.g. `[🚨 URGENT - TICKET #8A9B2]`).

## Emergency SLA (tech_design §7)
- [x] TASK-28: `convex/sla.ts` — `checkEmergencySla` scheduled fn: at 60s, if egress `status !== "sent"`, writes `_critical_escalations` reason `sla_breach` (idempotent). Per-ticket `runAfter`, never cron. (Built early — ingest.ts depends on it. Escalation CHANNELS are TASK-29 dashboard + TASK-30 email.)
- [ ] TASK-29: Dashboard takeover UI — un-dismissible red banner + looping HTML5 audio alarm until an authenticated admin acknowledges (WebSocket/Convex subscription).
- [ ] TASK-30: `convex/lib/resend.ts` — Resend escalation email stub (structured high-priority payload; stubbed key).

## Dashboard (tech_design §6)
- [ ] TASK-31: Public dashboard ticket list — real-time Convex subscription, ticket_id-prefixed, open/resolved.
- [ ] TASK-32: Metrics — True TTR (`resolved_at - created_at`) and SBL (`egress_cleared_at - created_at`) computed and displayed distinctly.
- [ ] TASK-33: Campus health breakdown by building/faculty (from `location_entity`).
- [ ] TASK-34: Volunteer resolution workflow — claim + resolve ticket, sets `resolved_at`.
- [ ] TASK-35: Leaderboard — **explicitly labeled "not a CSP-hours record"** in the UI copy.

## Legal Escalation Stub (tech_design §8)
- [ ] TASK-36: Legal-escalation stub endpoint — writes structured payload (locked Clerk user ID, timestamp, hash-match record) to **console.log only**. Never a real address.

## Multi-School Template (added Session 1 — scope change beyond original docs)
> Decision (user, Session 1): CampusCore is a per-school deployable TEMPLATE.
> Tenancy = ONE DEPLOYMENT PER SCHOOL (no school_id in the data model; a school
> is selected by `CAMPUSCORE_SCHOOL_CODE`). Admin auth = staff-domain email AND
> membership in `CAMPUSCORE_ADMIN_ALLOWLIST`. This supersedes the docs' hardcoded
> single-tenant `@smu.edu.sg` assumption — flagged in STATUS.md.
- [x] TASK-38: `config/schoolRegistry.ts` — researched SG institution registry
      (universities, polytechnics, ITE, MOE schools) with student + staff domains.
- [x] TASK-39: `config/school.ts` — active-school resolution from env; school-member
      and admin email predicates (admin = staff domain AND allowlist). Stub-tolerant.
- [x] TASK-40: Rewire `middleware.ts` + `convex/pairing.ts` off hardcoded
      `@smu.edu.sg` onto the config module; add admin-allowlist gate for admin routes.
      Add `CAMPUSCORE_SCHOOL_CODE` + `CAMPUSCORE_ADMIN_ALLOWLIST` to `.env.example`.

## Validation (tech_design §9)
- [ ] TASK-37: Run §9 pre-demo validation checklist; record results + open items in `STATUS.md`.
