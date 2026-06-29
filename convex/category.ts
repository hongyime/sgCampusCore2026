import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { ticketCategory } from "./schema";
import type { Doc } from "./_generated/dataModel";

type TicketCategoryPatch = Partial<
  Pick<
    Doc<"tickets">,
    "category" | "initial_tap_at" | "triage_status" | "priority_tier"
  >
>;

// Category state machine (tech_design.md §3.4).
export const tapCategory = internalMutation({
  args: {
    ticketId: v.id("tickets"),
    category: ticketCategory,
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      console.warn(`tapCategory: Ticket ${args.ticketId} not found`);
      return { ok: false, reason: "not_found" };
    }

    const now = Date.now();

    // 1. First write: always honored regardless of elapsed time.
    if (ticket.category === null) {
      const updates: TicketCategoryPatch = {
        category: args.category,
        initial_tap_at: now,
        triage_status: "locked",
      };

      // If "Safety", the SERVER sets priority_tier = 1.
      if (args.category === "Safety" && ticket.priority_tier !== 1) {
        updates.priority_tier = 1;

        // Also update egress queue row so Worker A picks it up.
        const egressRow = await ctx.db
          .query("_telegram_egress_queue")
          .withIndex("by_ticket", (q) => q.eq("ticket_id", ticket._id))
          .first();
        if (egressRow) {
          await ctx.db.patch(egressRow._id, { priority_tier: 1 });
        }
      }

      await ctx.db.patch(ticket._id, updates);
      return { ok: true, status: "first_write" };
    }

    // 2. Correction: honored only if Date.now() - initial_tap_at <= 15000.
    if (ticket.initial_tap_at !== null && now - ticket.initial_tap_at <= 15000) {
      const updates: TicketCategoryPatch = {
        category: args.category,
      };

      // Allow upgrade to tier-1 if "Safety" is tapped.
      // Do NOT allow downgrade (if priority_tier is already 1, we don't change it).
      if (args.category === "Safety" && ticket.priority_tier !== 1) {
        updates.priority_tier = 1;

        const egressRow = await ctx.db
          .query("_telegram_egress_queue")
          .withIndex("by_ticket", (q) => q.eq("ticket_id", ticket._id))
          .first();
        if (egressRow) {
          await ctx.db.patch(egressRow._id, { priority_tier: 1 });
        }
      }

      await ctx.db.patch(ticket._id, updates);
      return { ok: true, status: "correction_honored" };
    }

    // 3. Outside 15s window: visual update only. DO NOT change priority_tier.
    await ctx.db.patch(ticket._id, {
      category: args.category,
    });

    return { ok: true, status: "correction_visual_only" };
  },
});
