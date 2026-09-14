import { query, mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { isSchoolMemberEmail } from "../config/school";
import { ticketCategory } from "./schema";
import {
  countResolution,
  leaderboardControl,
  rankedVolunteers,
} from "./lib/leaderboard";
import { refreshTicketMetrics } from "./lib/metrics";
import { dashboardMetricResult, readDashboardMetrics } from "./lib/metricReads";

// TASK-31: Public dashboard ticket list
export const getTickets = query({
  args: {
    status: v.optional(v.union(v.literal("open"), v.literal("resolved"))),
  },
  returns: v.array(
    v.object({
      _id: v.id("tickets"),
      status: v.union(v.literal("open"), v.literal("resolved")),
      priority_tier: v.union(v.literal(1), v.literal(2)),
      headline: v.string(),
      description: v.string(),
      location_entity: v.string(),
      category: v.union(ticketCategory, v.null()),
      created_at: v.number(),
      egress_cleared_at: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const status = args.status;
    const ticketsQuery = status
      ? ctx.db
          .query("tickets")
          .withIndex("by_status", (q) => q.eq("status", status))
          .order("desc")
      : ctx.db.query("tickets").order("desc");

    const tickets = await ticketsQuery.take(50);

    // Enrich with egress timing for SBL calculations (TASK-32)
    const enriched = await Promise.all(
      tickets.map(async (t) => {
        const egress = await ctx.db
          .query("telegram_egress_queue")
          .withIndex("by_ticket", (q) => q.eq("ticket_id", t._id))
          .unique();

        return {
          // Public cards need these fields only. Retain reporter, storage,
          // moderation and future operational metadata in the database.
          _id: t._id,
          status: t.status,
          priority_tier: t.priority_tier,
          headline: t.headline,
          description: t.description,
          location_entity: t.location_entity,
          category: t.category,
          created_at: t.created_at,
          egress_cleared_at: egress?.egress_cleared_at ?? null,
        };
      }),
    );

    return enriched;
  },
});

// TASK-32 & 33: Metrics & Health breakdown
export const getMetrics = query({
  args: { locationCursor: v.optional(v.union(v.string(), v.null())) },
  returns: dashboardMetricResult,
  handler: (ctx, args) =>
    readDashboardMetrics(ctx, args.locationCursor ?? null),
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

    const resolutionId = await ctx.db.insert("resolutions", {
      ticket_id: args.ticketId,
      resolver_id: identity.subject,
      resolved_at: resolvedAt,
    });
    await countResolution(ctx, (await ctx.db.get(resolutionId))!);
    await refreshTicketMetrics(ctx, args.ticketId);
  },
});

// TASK-35: Leaderboard
export const getLeaderboard = query({
  args: {},
  handler: async (ctx) => {
    const control = await leaderboardControl(ctx);
    if (control?.enabled) return rankedVolunteers(ctx);
    // Preserve the existing full-history view until the operator has compared
    // all retained source rows with the derived totals and enabled the index.
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
