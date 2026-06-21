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
- [ ] TASK-5: `convex/schema.ts` — `tickets` table (category nullable, priority_tier 1|2, triage_status, initial_tap_at, timestamps, location_entity, headline).
- [ ] TASK-6: `convex/schema.ts` — `_telegram_egress_queue` table + **compound index `(status, priority_tier, created_at)`**.
- [ ] TASK-7: `convex/schema.ts` — `_critical_escalations` table (ticket_id, reason, created_at).

## Auth (tech_design §1 Authentication)
- [ ] TASK-8: Clerk middleware + `@smu.edu.sg` gate in app code (dashboard-level restriction deferred to human — see WAITING_ON_HUMAN.md).
- [ ] TASK-9: `convex/auth.ts` — JWKS RS256 signature verify + `exp`/`nbf` check against Clerk JWKS endpoint; never "decrypt". Do not log full JWT payloads.
- [ ] TASK-10: `convex/pairing.ts` — deep-link pairing token: 3-minute TTL, single atomic redeem mutation keyed on token ID, idempotent / fail-closed on second redemption.
- [ ] TASK-11: 30-day re-verification gate — `last_verified_at` blocks further bot activity until SSO re-auth.

## Telegram Ingestion (tech_design §1, §3)
- [ ] TASK-12: `convex/http.ts` Telegram webhook skeleton (stubbed token) — parses update, uses the **synchronous webhook-reply slot** for `answerCallbackQuery` (one method per update).
- [ ] TASK-13: Ingestion mutation — create `tickets` row, enqueue egress, fire `runAfter(60000, check_emergency_sla)` for tier-1.

## Triage Logic (tech_design §3)
- [ ] TASK-14: `convex/lib/ahoCorasick.ts` — Aho-Corasick automaton + fixed hazard lexicon ingestion (lexicon list is an approval-checkpoint item — keep it in one named file).
- [ ] TASK-15: Severity floor — lexicon match hardcodes `priority_tier: 1`, server-side only, immutable after ingestion. LLM severity ignored on match.
- [ ] TASK-16: `convex/lib/llmTriage.ts` — LLM structured-output call (stubbed API key) returning `{ headline, severity_score, routing_tag, location_entity }`; **never** writes `priority_tier`.
- [ ] TASK-17: Category state machine — first write always honored (sets tier-1 only if "Safety" + first write); correction honored only if `Date.now() - initial_tap_at <= 15000`, else visual-only.

## Moderation Pipeline (tech_design §4)
- [ ] TASK-18: `convex/lib/nsfwScorer.ts` (or Next API route) — ONNX Runtime **WASM** scorer module (`onnxruntime-web`), quantized model load.
- [ ] TASK-19: Threshold logic — `P>=0.50` → delete + "Image automatically removed" placeholder; `P<0.50` → pass. **No `pending_review` state. No human view.**
- [ ] TASK-20: Cloudflare CSAM hash-match step behind a `CSAM_SCAN_ENABLED` feature flag (stubbed off until zone is orange-clouded — see WAITING_ON_HUMAN.md).
- [ ] TASK-21: Telegram Mini App upload bridge — force image upload through the Cloudflare-proxied zone (not Telegram `getFile`).

## Egress Queue (tech_design §5, §6)
- [ ] TASK-22: `convex/queue.ts` — `claim_batch` mutation: atomically read top-N `pending` (compound-index order) → `processing` in one serializable transaction.
- [ ] TASK-23: `convex/queue.ts` — `finalize_batch` mutation: set `sent` + `egress_cleared_at`, or bump `retry_count`.
- [ ] TASK-24: Reaper — sweep rows `processing` > (Convex Action ceiling 10min + 30s buffer) back to `pending`; `retry_count >= 3` → `dead_letter`; tier-1 dead_letter also writes `_critical_escalations`.
- [ ] TASK-25: Worker A — Emergency Express action: claims/dispatches tier-1 **one at a time** (batch=1, no shared batch).
- [ ] TASK-26: Worker B — Standard Batch action: claims up to 25 tier-2; each Telegram `fetch` has its own 5s `AbortSignal`; `Promise.allSettled`.
- [ ] TASK-27: Broadcast format — every message prefixed with immutable `ticket_id` (e.g. `[🚨 URGENT - TICKET #8A9B2]`).

## Emergency SLA (tech_design §7)
- [ ] TASK-28: `convex/sla.ts` — `check_emergency_sla` scheduled fn: at 60s, if `status !== "sent"`, fire escalation (writes `_critical_escalations` reason `sla_breach`). Per-ticket `runAfter`, never cron.
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

## Validation (tech_design §9)
- [ ] TASK-37: Run §9 pre-demo validation checklist; record results + open items in `STATUS.md`.
