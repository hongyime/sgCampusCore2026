import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// CampusCore data model (tech_design.md §2).
//
// Invariants that the rest of the codebase depends on:
//  - `priority_tier` is SERVER-OWNED. It is set once at ingestion by the
//    lexicon check (tech_design §3) and is never written by a client-facing
//    mutation. The category-tap mutation may write `category`, never this.
//  - `category` is null until the first inline-keyboard tap. The null vs.
//    set distinction drives the 15-second correction window.

// The four inline-keyboard report categories. "Safety" is an independently
// trusted first-write signal that can set priority_tier:1 (tech_design §3.4).
export const ticketCategory = v.union(
  v.literal("Facilities"),
  v.literal("Janitorial"),
  v.literal("Safety"),
  v.literal("Lost & Found"),
);

export default defineSchema({
  tickets: defineTable({
    // Client-writable (category-tap mutation only). Null until the first tap.
    category: v.union(ticketCategory, v.null()),

    // SERVER-OWNED. Lexicon-derived at ingestion; immutable afterward except
    // by the first-write "Safety" rule. Never settable by a client mutation.
    priority_tier: v.union(v.literal(1), v.literal(2)),

    triage_status: v.union(
      v.literal("awaiting_input"),
      v.literal("locked"),
    ),

    // Timestamp of the FIRST category write (not ticket creation). The 15s
    // correction window is measured from here (tech_design §3.4).
    initial_tap_at: v.union(v.number(), v.null()),

    created_at: v.number(),
    resolved_at: v.union(v.number(), v.null()),

    location_entity: v.string(),
    headline: v.string(), // LLM-generated, <=10 words.

    // --- Operational fields (not in the §2 minimal sketch, needed to run) ---
    // Overall lifecycle separate from the egress transport status.
    status: v.union(v.literal("open"), v.literal("resolved")),
    // Raw (sanitized) report text scanned by the lexicon + sent to the LLM.
    description: v.string(),
    // Image moderation outcome (tech_design §4). No "pending_review" exists.
    image_status: v.union(
      v.literal("none"),
      v.literal("broadcast"),
      v.literal("removed"),
    ),
    // Clerk user id of the reporter. Treated as PII-linked; do not log JWTs.
    reporter_id: v.optional(v.string()),
    // LLM severity score — informs dashboard sorting ONLY, never priority_tier.
    llm_severity_score: v.optional(v.number()),
    // Volunteer who resolved it (Clerk user id), for the leaderboard.
    resolved_by: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_created_at", ["created_at"])
    .index("by_location", ["location_entity"]),
});
