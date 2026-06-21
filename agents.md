# AGENTS.md — CampusCore Agent Configuration

## Project Context

CampusCore is a decentralized campus issue-reporting system for SMU
(Telegram bot ingestion + Next.js dashboard + Convex backend). Full
product intent is in `docs/prd.md`; full architecture is in
`docs/tech_design.md`. Read both before generating any code that touches
auth, the moderation pipeline, or the egress queue — those three areas
have specific, deliberate constraints that are easy to "simplify" away by
accident.

## Core Build Philosophy

- Treat yourself as a fast implementation partner, not an infallible
  builder. Every output is a draft until a human reviews it.
- Control the blast radius of every change. Prefer several small,
  reviewable diffs over one large one.
- Context must be curated, not maximized — work from the specific files
  relevant to the task, not the whole repo, and say so if you're unsure
  what's in scope.
- If something looks wrong — suspicious behavior, an assumption you can't
  verify, a platform limit you're not certain of — stop and ask rather
  than guessing forward.

## Access & Permission Boundaries

- **Never write to `priority_tier` from any client-facing mutation.**
  This field is server-owned exclusively by the ingestion-time lexicon
  check (`tech_design.md` §3). A category button tap may write
  `category`; it must never be able to set or change `priority_tier`
  directly.
- **Never implement a human image-review queue.** The moderation pipeline
  is hash-match → ONNX binary classifier → auto-delete/auto-pass, with no
  `pending_review` state and no UI for a person to view a flagged image.
  If a feature request implies adding one, flag it instead of building
  it.
- **Never wire the legal-escalation endpoint to a real address.** It must
  remain a stub that logs the payload. Do not "complete" this integration
  without an explicit, separate, human-approved task for it.

## Workspace & Scope Limits

- Keep the webhook ingestion handler, the egress queue worker, and the
  moderation pipeline in separate, independently reviewable modules. They
  have different failure domains and different platform constraints —
  don't let one diff touch more than one of them unless the task
  explicitly requires it.
- Large files hide coupling. If a file is growing past a few hundred
  lines and accumulating unrelated responsibilities, split it before
  adding more to it rather than after.
- Don't expand scope to "while I'm in here" fix unrelated things. Flag
  them instead.

## Secrets & Sensitive Data Rules

- No Clerk secret keys, Telegram bot tokens, Cloudflare API tokens, or
  Resend API keys in source code, ever. Use Convex environment variables.
- Treat the verified `@smu.edu.sg` email inside a JWT as PII. Don't log
  full JWT payloads, even though they're signed rather than encrypted.
- Don't log raw image bytes or per-user moderation confidence scores
  outside the moderation pipeline's own internal audit path.

## Approval Checkpoints

Changes to any of the following require explicit human sign-off before
merge — these constitute the life-safety path and have already been
deliberately tuned against specific platform limits:

- The 60-second emergency SLA threshold.
- The reaper TTL or `retry_count` dead-letter threshold.
- The hazard lexicon word list.
- The NSFW/violence confidence cutoff.
- Any new third-party dependency beyond the current stack (Convex, Clerk,
  Next.js/Vercel, Telegram Bot API, Cloudflare, ONNX Runtime WASM,
  Resend) — check free-tier cost implications first.

## Validation & Review

- **Don't cite a platform limit without checking it against that
  platform's own current documentation.** Convex's Action timeout,
  Vercel's bundle/runtime limits, and Telegram's rate limits are three
  different numbers from three different products — verify against the
  correct one every time, don't reuse a number from a different part of
  the stack.
- **Test before commit.** Any change to the queue, the reaper, or a
  moderation threshold needs a manual run against a simulated burst
  (e.g. 50+ simultaneous tickets) before merge, not just a unit test on
  the happy path.
- **Don't commit a pattern you can't explain in plain language.** If you
  generate a concurrency primitive or a distributed-systems pattern,
  name it correctly (e.g. "claim-and-lease," not "Two-Phase Commit"
  unless it actually is) and be able to state, in one sentence, what
  failure mode it prevents.

## Trusted Tools & Integration

- **Convex** is the source of truth for ticket state, the queue, and
  scheduling. Use `ctx.scheduler.runAfter` for any per-ticket timer —
  never a periodic cron for anything with a sub-minute SLA requirement.
- **Clerk** auth is restricted to `@smu.edu.sg` at the dashboard level,
  not just in application code.
- **Cloudflare** CSAM scanning only works if the relevant upload endpoint
  is genuinely orange-clouded (DNS-proxied through Cloudflare). Confirm
  this in the dashboard before assuming the hash-match layer is active.
- **ONNX Runtime (WASM)** is the only approved moderation runtime. Do not
  substitute `tfjs-node` or any other native-binary ML runtime — it does
  not reliably deploy within Vercel's serverless bundle constraints.
- **Resend** is for emergency escalation email only, on the free tier
  (3,000/month). Don't assume unlimited volume; flag it if a feature
  would meaningfully increase email frequency.

## Known Limitations — Document, Don't "Fix" Silently

If you encounter one of these in the course of building, leave it as-is
and reference this section rather than attempting to close it
unilaterally:

- **Account selling.** A verified student periodically re-authenticating
  on a buyer's behalf can defeat the 30-day SSO re-verification. This is
  an accepted social-engineering risk with no deterministic fix.
- **Email escalation is not a guaranteed active interrupt.** It does not
  bypass Do Not Disturb or silent mode. Don't write user-facing copy that
  implies it does.
- **The hazard lexicon is narrow and English-only** outside of the
  structured "Safety" category button, which is trusted independently as
  a first-write signal. Don't expand this into a general NLP hazard
  classifier without a new design review.
