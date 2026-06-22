import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { checkVerification } from "./lib/verification";
import { resolvePriorityTier } from "./lib/severityFloor";

// Report ingestion (tech_design.md §3, §5, §7).
//
// Called by the Telegram webhook action AFTER it has run LLM triage (the LLM
// call needs `fetch`, which only actions have). This mutation does the DB
// writes atomically:
//   1. enforce the 30-day re-verification gate,
//   2. resolve priority_tier SERVER-SIDE from the lexicon (never from input),
//   3. insert the ticket + its egress-queue row,
//   4. for tier-1, schedule the one-off 60s SLA check (runAfter, not cron).
//
// priority_tier is computed here from the text only. The triage fields passed
// in are LLM output for display/sorting and CANNOT influence the tier.
export const createTicket = internalMutation({
  args: {
    telegram_user_id: v.string(),
    text: v.string(),
    headline: v.string(),
    location_entity: v.string(),
    llm_severity_score: v.number(),
  },
  handler: async (ctx, args) => {
    // 1. 30-day re-verification gate.
    const verification = await checkVerification(ctx, args.telegram_user_id);
    if (!verification.verified) {
      // Caller prompts the user to re-pair / re-auth; no ticket is created.
      return { ok: false as const, reason: verification.reason };
    }

    // 2. Server-owned severity floor. This is the ONLY write of priority_tier.
    const priority_tier = resolvePriorityTier(args.text);
    const now = Date.now();

    // 3a. Ticket.
    const ticketId = await ctx.db.insert("tickets", {
      category: null, // null until first inline-keyboard tap (TASK-17)
      priority_tier,
      triage_status: "awaiting_input",
      initial_tap_at: null,
      created_at: now,
      resolved_at: null,
      location_entity: args.location_entity,
      headline: args.headline,
      status: "open",
      description: args.text,
      image_status: "none", // moderation pipeline (TASK-18–21) updates this
      reporter_id: verification.clerk_user_id,
      llm_severity_score: args.llm_severity_score,
    });

    // 3b. Egress-queue row. priority_tier mirrored so the compound index can
    // cluster tier-1 ahead of tier-2 without a join.
    await ctx.db.insert("_telegram_egress_queue", {
      ticket_id: ticketId,
      status: "pending",
      priority_tier,
      claimed_at: null,
      retry_count: 0,
      created_at: now,
      egress_cleared_at: null,
    });

    // 4. Emergency SLA: per-ticket one-off timer (tech_design §7). Never a
    // cron — Convex cron granularity (1 min) would widen the 60s SLA.
    if (priority_tier === 1) {
      await ctx.scheduler.runAfter(
        60_000,
        internal.sla.checkEmergencySla,
        { ticket_id: ticketId },
      );
    }

    return { ok: true as const, ticketId, priority_tier };
  },
});
