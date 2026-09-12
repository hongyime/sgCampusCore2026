import { query, mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { isSchoolMemberEmail } from "../config/school";

// TASK-31: Public dashboard ticket list
export const getTickets = query({
  args: {
    status: v.optional(v.union(v.literal("open"), v.literal("resolved"))),
  },
  handler: async (ctx, args) => {
    let ticketsQuery = ctx.db.query("tickets").order("desc");

    if (args.status) {
      ticketsQuery = ticketsQuery.filter((q) =>
        q.eq(q.field("status"), args.status),
      );
    }

    const tickets = await ticketsQuery.take(50);

    // Enrich with egress timing for SBL calculations (TASK-32)
    const enriched = await Promise.all(
      tickets.map(async (t) => {
        const egress = await ctx.db
          .query("telegram_egress_queue")
          .withIndex("by_ticket", (q) => q.eq("ticket_id", t._id))
          .unique();

        return {
          ...t,
          egress_cleared_at: egress?.egress_cleared_at || null,
        };
      }),
    );

    return enriched;
  },
});

// TASK-32 & 33: Metrics & Health breakdown
export const getMetrics = query({
  args: {},
  handler: async (ctx) => {
    const tickets = await ctx.db.query("tickets").collect();

    let totalTTR = 0;
    let resolvedCount = 0;
    let totalSBL = 0;
    let sblCount = 0;

    const locationBreakdown: Record<string, { total: number; open: number }> =
      {};

    for (const t of tickets) {
      // Breakdown by location
      const loc = t.location_entity || "Unknown";
      if (!locationBreakdown[loc]) {
        locationBreakdown[loc] = { total: 0, open: 0 };
      }
      locationBreakdown[loc].total++;
      if (t.status === "open") locationBreakdown[loc].open++;

      // TTR computation
      if (t.status === "resolved" && t.resolved_at) {
        totalTTR += t.resolved_at - t.created_at;
        resolvedCount++;
      }

      // SBL computation
      const egress = await ctx.db
        .query("telegram_egress_queue")
        .withIndex("by_ticket", (q) => q.eq("ticket_id", t._id))
        .unique();

      if (egress && egress.egress_cleared_at) {
        totalSBL += egress.egress_cleared_at - t.created_at;
        sblCount++;
      }
    }

    return {
      avgTtrMs: resolvedCount > 0 ? totalTTR / resolvedCount : 0,
      avgSblMs: sblCount > 0 ? totalSBL / sblCount : 0,
      resolvedCount,
      totalTickets: tickets.length,
      locationBreakdown,
    };
  },
});

// TASK-34: Volunteer resolution workflow
export const resolveTicket = mutation({
  args: {
    ticketId: v.id("tickets"),
    // Older cached clients may still send this. Attribution always uses auth.
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (
      !identity ||
      identity.emailVerified === false ||
      !isSchoolMemberEmail(identity.email ?? "")
    ) {
      throw new ConvexError(
        "Sign in with an institutional account for this school to resolve tickets.",
      );
    }
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) throw new ConvexError("Ticket not found.");
    if (ticket.status === "resolved")
      throw new ConvexError("This ticket has already been resolved.");

    const resolvedAt = Date.now();
    await ctx.db.patch(args.ticketId, {
      status: "resolved",
      resolved_at: resolvedAt,
    });

    await ctx.db.insert("resolutions", {
      ticket_id: args.ticketId,
      resolver_id: identity.subject,
      resolved_at: resolvedAt,
    });
  },
});

// TASK-35: Leaderboard
export const getLeaderboard = query({
  args: {},
  handler: async (ctx) => {
    const resolutions = await ctx.db.query("resolutions").collect();
    const counts: Record<string, number> = {};

    for (const res of resolutions) {
      counts[res.resolver_id] = (counts[res.resolver_id] || 0) + 1;
    }

    return Object.entries(counts)
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  },
});
