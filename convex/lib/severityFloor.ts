import { AhoCorasick } from "./ahoCorasick";
import { HAZARD_LEXICON } from "./lexicon";

// Deterministic severity floor (tech_design.md §3.2, AGENTS.md).
//
// This is the ONLY thing that sets priority_tier at ingestion, and it is
// server-side exclusively. A lexicon match hardcodes tier 1; otherwise tier 2.
// The LLM is never consulted for severity (its severity output is ignored on a
// match), and no client mutation may ever write priority_tier.
//
// Built once at module load — the lexicon is fixed (approval-gated), so the
// automaton is immutable for the process lifetime.
const automaton = new AhoCorasick(HAZARD_LEXICON);

/** True if the report text contains any hazard-lexicon term. */
export function hazardMatch(text: string): boolean {
  return automaton.hasMatch(text);
}

/**
 * The server-owned priority tier for a freshly ingested report.
 * Returns 1 on any hazard match, else 2. Callers MUST treat the result as
 * immutable for the ticket (except the first-write "Safety" rule in TASK-17).
 */
export function resolvePriorityTier(text: string): 1 | 2 {
  return automaton.hasMatch(text) ? 1 : 2;
}

/** Distinct matched hazard terms — for the internal audit path only. */
export function matchedHazards(text: string): string[] {
  return automaton.findMatches(text);
}
