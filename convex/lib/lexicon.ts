// Hazard lexicon (tech_design.md §3, AGENTS.md approval checkpoint).
//
// ⚠️ APPROVAL CHECKPOINT: changing this word list requires explicit human
// sign-off (AGENTS.md "Approval Checkpoints"). It is deliberately narrow and
// English-only. Do NOT grow this into a general NLP hazard classifier — the
// structured "Safety" category button (TASK-17) is the independent,
// first-write trust signal for everything this list misses.
//
// Any match here forces priority_tier:1 at ingestion, server-side and
// immutable (tech_design §3.2). The LLM is never consulted for severity on a
// matched ticket.
export const HAZARD_LEXICON: readonly string[] = [
  "smoke",
  "fire",
  "spill",
  "gas",
  "bleeding",
  "weapon",
  "glass",
  "stranger",
];
