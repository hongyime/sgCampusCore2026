# CampusCore — Technical Design Document

## 1. System Infrastructure

### Backend
- **Convex** — database, serverless mutations/actions, scheduler, real-time
  subscriptions. Source of truth for all ticket and queue state.
- **Telegram Bot API** — webhook ingestion; uses the synchronous
  webhook-reply slot (one method per update, per Telegram's own Bots FAQ)
  for instant user-facing acknowledgment.
- **Cloudflare** — orange-clouded zone in front of the image-upload
  endpoint, used for CSAM hash-matching; Cloudflare Worker for edge
  ingestion; Logpush for escalation triggers on WAF blocks.
- **Resend API** — transactional/escalation email, free tier (3,000
  emails/month).

### Frontend
- **Next.js** on Vercel — public dashboard, plus a Telegram Mini App
  overlay used specifically to force image uploads through the
  Cloudflare-proxied zone (a plain Telegram `getFile` download would
  bypass Cloudflare's edge inspection entirely).
- Real-time UI updates via Convex WebSocket subscriptions — no polling.

### Authentication
- **Clerk**, restricted to the `@smu.edu.sg` domain at the Clerk dashboard
  level.
- Session JWTs are **signed (JWS/RS256), not encrypted**. The backend
  verifies the signature against Clerk's JWKS endpoint
  (`https://<clerk-domain>/.well-known/jwks.json`) and checks `exp`/`nbf`;
  it never "decrypts" the token, since the payload is not confidential by
  design.
- Telegram pairing: a deep-link token with a 3-minute TTL, redeemed via a
  single atomic Convex mutation keyed on the token ID (idempotent —
  second redemption attempts fail closed).
- 30-day re-verification: a `last_verified_at` timestamp gates further
  bot activity until the student re-authenticates via SSO.

## 2. Core Data Model (Convex)

```
tickets
  _id
  category: string | null          // null until first tap; client-writable
  priority_tier: 1 | 2             // server-owned only; lexicon-derived
  triage_status: "awaiting_input" | "locked"
  initial_tap_at: number | null    // timestamp of the FIRST category write
  created_at: number
  resolved_at: number | null
  location_entity: string
  headline: string                 // LLM-generated, ≤10 words

_telegram_egress_queue
  _id
  ticket_id
  status: "pending" | "processing" | "sent" | "dead_letter"
  priority_tier: 1 | 2
  claimed_at: number | null
  retry_count: number
  created_at: number
  egress_cleared_at: number | null

_critical_escalations
  _id
  ticket_id
  reason: "dead_letter" | "sla_breach"
  created_at: number
```

## 3. Triage & Severity Logic

1. Raw report text is scanned at ingestion by a deterministic
   Aho-Corasick automaton against a fixed hazard lexicon (e.g. `smoke,
   fire, spill, gas, bleeding, weapon, glass, stranger`).
2. **Match found** → `priority_tier` is hardcoded to `1`. The LLM is never
   consulted for severity on this ticket; its output schema for severity
   is ignored if present.
3. **No match** → the LLM (Groq/Llama-3 or local Ollama) is given the
   sanitized text and returns constrained JSON:
   `{ headline, severity_score, routing_tag, location_entity }`. This
   output may inform display and dashboard sorting but never sets
   `priority_tier` directly — that field is set once, server-side, at
   ingestion, and is immutable afterward except by the rule below.
4. **Category as an independent trust signal.** The structured "Safety"
   inline-keyboard button is a deterministic, intentional input — not
   free text — and is trusted independently of the lexicon:
   - If `category` is currently `null` (first write), the tap is always
     honored, regardless of elapsed time, and sets `priority_tier: 1` if
     the tapped category is "Safety."
   - If `category` is already set (a correction), the tap is honored only
     if `Date.now() - initial_tap_at <= 15000`. Outside that window, the
     visual `category` updates for dashboard accuracy, but
     `priority_tier` does not change — this closes the queue-jumping
     vector where a student re-taps "Safety" purely to skip the line.

## 4. Image Moderation Pipeline

1. **CSAM hash-matching (Cloudflare).** The Telegram Mini App bridge posts
   the image as `multipart/form-data` directly to an orange-clouded
   Cloudflare zone, so the bytes actually transit Cloudflare's edge. A
   hash match blocks the request with HTTP 403 at the edge; the payload
   never reaches Convex. A matched block is logged via Cloudflare Logpush
   and triggers the escalation path described in §6 — **not implemented
   live for the hackathon demo; see §7.**
2. **NSFW/violence filtering (ONNX Runtime, WASM).** Images that clear
   step 1 are scored by a quantized model running via
   `onnxruntime-web`'s WASM backend (chosen specifically because it has
   no native-binary dependency, unlike `tfjs-node`, which does not
   reliably deploy on Vercel's serverless bundle constraints).
   - `P ≥ 0.50` → image permanently deleted; ticket broadcasts with an
     "Image automatically removed" placeholder.
   - `P < 0.50` → image passes and broadcasts normally.
   - **No `pending_review` state exists.** No human ever views a
     flagged image.
3. **Before claiming these numbers in a pitch:** confirm the
   `onnxruntime-web` + model bundle actually deploys within Vercel's real
   size/runtime limits, and calibrate the `0.50` cutoff against a sample
   of ordinary campus photos (spilled drinks, shadows, skin tone in poor
   lighting) to find the real false-positive rate before committing to
   the number publicly.

## 5. Egress Queue & Priority Routing

- **Index:** compound index on `(status, priority_tier, created_at)` —
  this clusters all `priority_tier: 1` rows ahead of `priority_tier: 2`
  rows in B-tree order, independent of arrival time.
- **Worker A — Emergency Express.** Claims and dispatches
  `priority_tier: 1` rows one at a time. A slow or hung connection on one
  emergency ticket cannot block any other ticket, because there is no
  batch to share.
- **Worker B — Standard Batch.** Claims up to 25 `priority_tier: 2` rows
  per cycle. Each individual `fetch` call to Telegram carries its own
  5-second `AbortSignal` — the timeout is on the per-request promise, not
  the parent Action, so one hung connection rejects on its own without
  blocking `Promise.allSettled` from resolving for the other 24.
- **Claim-and-lease concurrency control** (not Two-Phase Commit — this is
  a simpler, standard pattern): a `claim_batch` mutation atomically reads
  the top N `pending` rows and flips them to `processing` within a single
  Convex transaction. Convex mutations are serializable, so two
  overlapping invocations cannot claim the same row.
- **Reaper.** Before claiming new rows, `claim_batch` first sweeps any row
  stuck in `processing` for longer than Convex's actual platform ceiling
  for Actions (10 minutes) plus a 30-second buffer, and reverts it to
  `pending`, incrementing `retry_count`. At `retry_count >= 3`, the row
  becomes `status: "dead_letter"` and is dropped from the standard path.
- **Emergency dead-letter exception.** If a row reaching `dead_letter` has
  `priority_tier: 1`, the reaper additionally writes a record to
  `_critical_escalations` instead of silently dropping it — see §6.

## 6. Delivery Semantics & At-Least-Once Acceptance

- Telegram's `sendMessage` has no idempotency-key parameter. The system
  accepts **at-least-once** delivery rather than attempting to engineer
  exactly-once semantics on top of an API that doesn't support it
  (a client-side `AbortController` on the request does not retract a
  message that has already reached Telegram's servers).
- **Mitigation, not elimination:** every broadcast is prefixed with its
  immutable `ticket_id` (e.g. `[🚨 URGENT - TICKET #8A9B2]`), so a human
  reading the channel can recognize a duplicate as a network retry rather
  than a second incident.
- **Metric integrity:** three separate timestamps prevent queue latency
  from masking or inflating system performance:
  - `created_at` — the operational benchmark, set the instant the webhook
    receives the report.
  - `egress_cleared_at` — the transport benchmark, set when the broadcast
    is confirmed sent.
  - `resolved_at` — set on volunteer resolution.
  - **True TTR** = `resolved_at - created_at` (includes any queue delay,
    honestly).
  - **System Backpressure Latency (SBL)** = `egress_cleared_at -
    created_at` (isolates infrastructure bottlenecks for internal
    auditing).

## 7. Emergency SLA Monitor

- At the moment a `priority_tier: 1` ticket is created, the ingestion
  webhook fires `ctx.scheduler.runAfter(60000, "check_emergency_sla", {
  ticket_id })` — a one-off, per-ticket callback. **This is deliberately
  not a periodic Convex cron**, because Convex cron jobs run at a minimum
  one-minute granularity, which would turn a "60-second SLA" into a
  60–120 second window in the worst case.
- At the 60-second mark, if `status !== "sent"`, the function fires the
  out-of-band escalation:
  - **Primary — WebSocket dashboard takeover.** Convex pushes the state
    change over the existing real-time connection; the CSOC dashboard
    displays a persistent, un-dismissible red banner and loops an HTML5
    audio alarm until acknowledged by an authenticated admin.
  - **Secondary — Resend API email.** A structured, high-priority email
    is sent to the CSOC's monitored intake inbox, creating a timestamped
    record independent of whether anyone is looking at the dashboard at
    that moment.
- **Documented limitation, not a claimed fix:** email does not bypass a
  device's Do Not Disturb or silent mode the way a phone call or an
  Apple/Android "critical alert" entitlement would. Achieving a true
  active-interrupt channel on a $0 budget would require a tool that
  already holds that OS-level entitlement; absent that, this escalation
  path assumes a monitored inbox and an attended dashboard, and should be
  presented that way — not as a guaranteed wake-the-responder mechanism.

## 8. Legal Escalation Path (Singapore) — Design Only, Not Live-Wired

- **Trigger:** a Cloudflare CSAM hash match (§4, step 1).
- **Design:** parallel dispatch to (a) ODOS and Campus Security, and (b)
  directly to the Singapore Police Force, fired simultaneously rather
  than sequentially through an institutional office. This is specifically
  to avoid the team's own personal reporting obligation under Section 424
  of Singapore's Criminal Procedure Code being made contingent on an
  internal office's response time.
- **Payload:** the locked Clerk user ID, timestamp, and the cryptographic
  hash-match record from the Cloudflare WAF log — never the image itself,
  since Cloudflare discards it at the edge.
- **Demo implementation:** the webhook endpoint that would receive this
  Logpush event is a stub that writes the structured payload to a console
  log only. It does not contact any real police or university intake
  system. This is documented explicitly in the README and in any pitch
  materials — the design is real; the wiring is intentionally inert for
  the hackathon.

## 9. Pre-Demo Validation Checklist

- [ ] Confirm `onnxruntime-web` + quantized model actually deploys within
      Vercel's real bundle size and execution-time limits.
- [ ] Run the NSFW/violence threshold against ~100 benign campus photos to
      find the real false-positive floor before quoting `0.50` publicly.
- [ ] Confirm the upload zone is genuinely orange-clouded in Cloudflare
      (DNS-proxied), not just configured — the CSAM tool only inspects
      traffic that physically transits Cloudflare's edge.
- [ ] Send a real test email through Resend to a real CSOC-style inbox to
      confirm deliverability before relying on it in a live demo.
- [ ] Confirm the legal-escalation endpoint is the stub, not a real
      intake address, before any demo run.
