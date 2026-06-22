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
    image_storage_id: v.optional(v.id("_storage")),
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

  // Egress queue (tech_design §5). One row per ticket awaiting broadcast.
  _telegram_egress_queue: defineTable({
    ticket_id: v.id("tickets"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("sent"),
      v.literal("dead_letter"),
    ),
    // Mirrored from the ticket so the compound index can cluster tier-1 ahead
    // of tier-2 without a join. Server-owned, same as the ticket field.
    priority_tier: v.union(v.literal(1), v.literal(2)),
    claimed_at: v.union(v.number(), v.null()),
    retry_count: v.number(),
    created_at: v.number(),
    egress_cleared_at: v.union(v.number(), v.null()),
  })
    // THE load-bearing index (tech_design §5): ordering by
    // (status, priority_tier, created_at) means a range scan of `pending`
    // rows yields all priority_tier:1 rows before any priority_tier:2 row,
    // in B-tree order, independent of arrival time. Worker A and Worker B
    // both claim from the head of this index for their tier.
    .index("by_status_priority_created", [
      "status",
      "priority_tier",
      "created_at",
    ])
    // Lookup a ticket's egress row directly (SLA check, finalize).
    .index("by_ticket", ["ticket_id"]),

  // Out-of-band escalation records (tech_design §5 dead-letter exception, §7
  // SLA breach). Written when a tier-1 ticket either dead-letters in the queue
  // or fails to reach status "sent" within the 60s SLA. Drives the dashboard
  // takeover + Resend email. Never silently dropped.
  _critical_escalations: defineTable({
    ticket_id: v.id("tickets"),
    reason: v.union(v.literal("dead_letter"), v.literal("sla_breach")),
    created_at: v.number(),
    // Set when an authenticated admin acknowledges the dashboard takeover.
    acknowledged_at: v.optional(v.union(v.number(), v.null())),
  }).index("by_ticket", ["ticket_id"]),

  // Telegram deep-link pairing tokens (tech_design §1). 3-minute TTL,
  // single-use, redeemed by one atomic serializable mutation. Second
  // redemption / expired / unknown token all FAIL CLOSED.
  pairings: defineTable({
    token: v.string(), // opaque random deep-link token
    clerk_user_id: v.string(),
    email: v.string(), // PII — never logged
    created_at: v.number(),
    expires_at: v.number(), // created_at + 180_000
    redeemed_at: v.union(v.number(), v.null()),
    telegram_user_id: v.union(v.string(), v.null()),
    status: v.union(
      v.literal("pending"),
      v.literal("redeemed"),
      v.literal("expired"),
    ),
  }).index("by_token", ["token"]),

  // Paired users. `last_verified_at` gates bot activity behind the 30-day SSO
  // re-verification requirement (tech_design §1, enforced in TASK-11).
  users: defineTable({
    clerk_user_id: v.string(),
    email: v.string(), // PII — never logged
    telegram_user_id: v.union(v.string(), v.null()),
    last_verified_at: v.number(),
  })
    .index("by_clerk_user", ["clerk_user_id"])
    .index("by_telegram_user", ["telegram_user_id"]),
});
