// Task 7 (Session 3) — Promo ValueProps.
//
// Server Component. No "use client", no Convex imports.
//
// Five capability cards adapted from `tech_design.md` §§1-9. Each card
// summarises one concrete architectural choice a Fork_Developer inherits by
// running this template — not marketing fluff. The card copy sticks to what
// the design document actually commits to (no invented numbers, no promises
// beyond what §7 already documents about the SLA channel).
//
// Renders as static HTML — no client interactivity, no fetching.

type Capability = {
  eyebrow: string;
  title: string;
  body: string;
};

const CAPABILITIES: readonly Capability[] = [
  {
    eyebrow: "§1 · §3",
    title: "Telegram-native reporting with deterministic triage",
    body:
      "Reports arrive by Telegram bot with inline-keyboard categories. A fixed Aho-Corasick lexicon sets priority at ingestion — priority is a rule, not a model output. The LLM only writes headlines and routing hints.",
  },
  {
    eyebrow: "§5",
    title: "Priority-aware egress queue with an isolated emergency lane",
    body:
      "Compound index on (status, priority_tier, created_at). Emergency Express dispatches Tier-1 tickets one at a time; Standard Batch claims up to 25 Tier-2 rows with per-request AbortSignals so one hung connection can't block the batch.",
  },
  {
    eyebrow: "§4",
    title: "No-human-review image moderation",
    body:
      "Cloudflare edge hash-matching, then a quantized NSFW/violence model on ONNX Runtime WASM. Images resolve to broadcast or delete — there is no pending_review state, and no human ever views a flagged image.",
  },
  {
    eyebrow: "§5 · §6 · §7",
    title: "Claim-and-lease workers with a per-ticket SLA scheduler",
    body:
      "One-off ctx.scheduler.runAfter(60_000, …) at ingestion — not a periodic cron — because cron minimum granularity would turn a 60-second SLA into a 60-120s window. A reaper reverts stuck rows and dead-letters at retry_count >= 3.",
  },
  {
    eyebrow: "§6",
    title: "Public dashboard with honest time-to-resolution",
    body:
      "True TTR includes queue delay; System Backpressure Latency isolates transport time. Every broadcast is prefixed with an immutable ticket ID so at-least-once retries are recognisable as duplicates rather than second incidents.",
  },
];

export default function ValueProps() {
  return (
    <section
      className="landing-section"
      aria-labelledby="promo-capabilities-title"
    >
      <h2 id="promo-capabilities-title" className="landing-section-title">
        What you get when you fork it
      </h2>
      <p className="landing-section-lead">
        Five architectural choices baked into the template. Each one is
        documented in <code>tech_design.md</code> and enforced by the code in
        this repository.
      </p>
      <ul className="landing-trust-list">
        {CAPABILITIES.map((cap) => (
          <li key={cap.title}>
            <p className="eyebrow">{cap.eyebrow}</p>
            <strong>{cap.title}</strong>
            <p>{cap.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
