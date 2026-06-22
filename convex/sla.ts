import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// Emergency SLA monitor (tech_design.md §7).
//
// Scheduled by ingest.createTicket via `ctx.scheduler.runAfter(60_000, ...)`
// for every tier-1 ticket — a one-off, per-ticket callback, NOT a periodic
// cron (Convex cron's 1-minute granularity would turn a 60s SLA into a
// 60–120s window).
//
// At the 60s mark: if the ticket's egress row has not reached status "sent",
// we record a `_critical_escalations` row (reason "sla_breach"). That record
// is what the dashboard takeover (TASK-29) subscribes to and what the Resend
// email stub (TASK-30) will be triggered from. This runs independently of the
// queue's own retry/dead-letter cycle, so a stuck queue can never silently
// swallow an emergency.
export const checkEmergencySla = internalMutation({
  args: { ticket_id: v.id("tickets") },
  handler: async (ctx, { ticket_id }) => {
    const egress = await ctx.db
      .query("_telegram_egress_queue")
      .withIndex("by_ticket", (q) => q.eq("ticket_id", ticket_id))
      .unique();

    // Met the SLA — broadcast confirmed sent within 60s. Nothing to do.
    if (egress && egress.status === "sent") {
      return { breached: false as const };
    }

    // Idempotent: a duplicate scheduled run (or a later dead-letter escalation)
    // must not create a second sla_breach record for the same ticket.
    const existing = await ctx.db
      .query("_critical_escalations")
      .withIndex("by_ticket", (q) => q.eq("ticket_id", ticket_id))
      .collect();
    if (existing.some((e) => e.reason === "sla_breach")) {
      return { breached: true as const, alreadyRecorded: true };
    }

    await ctx.db.insert("_critical_escalations", {
      ticket_id,
      reason: "sla_breach",
      created_at: Date.now(),
      acknowledged_at: null,
    });

    const ticket = await ctx.db.get(ticket_id);
    if (ticket) {
      await ctx.scheduler.runAfter(0, internal.lib.resend.sendEscalationEmail, {
        ticketId: ticket_id,
        reason: "SLA Breach (60 seconds)",
        headline: ticket.headline,
        location_entity: ticket.location_entity,
        description: ticket.description,
      });
    }

    return { breached: true as const, alreadyRecorded: false };
  },
});
