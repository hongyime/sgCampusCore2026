# CampusCore — Product Requirements Document

## 0. Summary

CampusCore is a decentralized issue-reporting and resolution network for SMU
(`@smu.edu.sg`). Students report campus issues via a Telegram bot; a public
Telegram channel and a real-time Next.js dashboard broadcast and track them.
The architecture prioritizes deterministic, auditable handling of
safety-critical reports over conversational AI flexibility, and is designed
to run on free-tier infrastructure with explicit, documented exceptions
rather than silent cost or compliance drift.

## 1. Product Goals

- Reduce time-to-resolution for campus maintenance and safety issues by
  removing the friction of traditional facilities-reporting channels.
- Guarantee that safety-critical reports are never silently lost, delayed
  behind low-priority traffic, or buried by network failures.
- Keep the system auditable: every routing decision (severity, priority,
  moderation outcome) must be traceable to a deterministic rule, not an
  opaque model output.
- Ship on free-tier infrastructure, with any deviation from that explicitly
  called out rather than assumed.

## 2. Target Users

| User | Role |
|---|---|
| SMU student (verified `@smu.edu.sg`) | Reporter and/or volunteer resolver |
| Campus Security Operations Centre (CSOC) | Emergency escalation recipient |
| Office of Dean of Students (ODOS) | Disciplinary/compliance recipient |
| Facilities/admin staff | Dashboard consumer, ticket resolver |

## 3. Core Features

1. Institutional identity verification and Telegram pairing (Clerk +
   short-lived deep-link token).
2. Telegram-based reporting: inline-keyboard category selection (Facilities,
   Janitorial, Safety, Lost & Found) plus photo and free-text description.
3. AI-assisted structured triage (severity, routing tag, location entity)
   with a deterministic, non-overridable safety floor for hazard language.
4. Image moderation: CSAM hash-matching and NSFW/violence filtering, with
   zero human review of flagged content at any confidence level.
5. Priority-aware broadcast queue with an isolated emergency fast lane.
6. Real-time public dashboard: open/resolved tickets, time-to-resolution,
   campus health breakdown by building/faculty.
7. Volunteer resolution workflow and a leaderboard — explicitly a
   feel-good engagement mechanic, **not** a Community Service Project
   (CSP) hours record.
8. Emergency SLA monitoring with out-of-band escalation if a
   safety-critical ticket fails to broadcast within 60 seconds.

## 4. User Stories

- As a student, I want to report a hazard from Telegram without installing
  an app, so I can flag it within seconds of seeing it.
- As a student, I want to correct a misclassified report shortly after
  submitting it, so a panic-tap doesn't permanently corrupt a safety
  ticket.
- As a student, I want my emergency report to reach the public channel
  ahead of routine tickets during a surge, without waiting behind 200
  janitorial reports.
- As a volunteer, I want to see ranked open tickets so I can claim the
  most urgent one first.
- As CSOC staff, I want to be notified within roughly a minute if a
  flagged emergency ticket fails to broadcast, so a network outage never
  produces a missed emergency.
- As ODOS/CSOC, I want any CSAM hash match to escalate automatically to
  the correct legal channel, so no student moderator is ever exposed to
  reviewing such content.

## 5. Acceptance Criteria

- A report containing lexicon-matched hazard language is always assigned
  `priority_tier: 1`, regardless of what the LLM's own severity output
  says, and regardless of any later client-side category change.
- A category button tap is permanently accepted if it is the ticket's
  first category write, regardless of elapsed time. A second tap
  (overwrite) is only honored within a 15-second window measured from the
  *first* tap, not from ticket creation.
- No image is ever displayed to a human moderator prior to publication.
  Every image is resolved automatically to "broadcast" or "deleted."
- An emergency-tier (`priority_tier: 1`) ticket that has not reached
  `status: "sent"` within 60 seconds of creation triggers an out-of-band
  escalation, independent of the standard queue's retry/dead-letter cycle.
- Every public broadcast is prefixed with its immutable ticket ID, so a
  network-retry duplicate is distinguishable from a second, genuine
  incident.
- The leaderboard and dashboard never claim to be a verified record for
  academic or administrative credit.

## 6. Scope

### In scope (hackathon build)
- Telegram bot ingestion, Clerk auth, Convex backend, Next.js dashboard.
- Deterministic severity floor (Aho-Corasick) plus structured LLM
  headline/location extraction.
- ONNX Runtime (WASM) NSFW/violence filtering.
- Priority queue with isolated emergency-lane dispatch.
- 60-second emergency SLA monitor with email + dashboard escalation.
- Feel-good leaderboard and public dashboard.

### Explicitly out of scope / stubbed for the demo
- A live, wired CSAM → SPF/ODOS reporting integration. The design is
  documented in `tech_design.md`; the actual endpoint is a stub that logs
  the payload and does **not** contact any real authority.
- CSP-hour academic credit validation — deliberately not pursued.
- Production-tier infrastructure upgrades (this is a free-tier POC).

### Known, accepted risks (documented, not "solved")
- A verified student periodically re-authenticating on a buyer's behalf
  can defeat the 30-day SSO re-verification check. This is a
  social-engineering risk with no deterministic technical fix.
- Email-based emergency escalation does not guarantee an active device
  interrupt (no Do-Not-Disturb bypass). This is an accepted trade-off for
  staying on free-tier infrastructure, not a resolved gap.
- The hazard lexicon is narrow and English-only outside of the
  structured "Safety" category button signal, which is independently
  trusted as a first-write input.
