import { query, mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { isAdminEmail } from "../config/school";

// Get all unacknowledged critical escalations for the dashboard (TASK-29)
export const getActiveEscalations = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (
      !identity ||
      identity.emailVerified === false ||
      !isAdminEmail(identity.email ?? "")
    )
      return [];
    const escalations = await ctx.db
      .query("critical_escalations")
      .filter((q) => q.eq(q.field("acknowledged_at"), null))
      .collect();

    // Join with tickets to get headlines
    const result = [];
    for (const esc of escalations) {
      const ticket = await ctx.db.get(esc.ticket_id);
      if (ticket) {
        result.push({
          ...esc,
          headline: ticket.headline,
          location_entity: ticket.location_entity,
        });
      }
    }

    return result;
  },
});

export const acknowledgeEscalation = mutation({
  args: { id: v.id("critical_escalations") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (
      !identity ||
      identity.emailVerified === false ||
      !isAdminEmail(identity.email ?? "")
    ) {
      throw new ConvexError(
        "Only an authorized staff administrator can acknowledge emergencies.",
      );
    }
    const escalation = await ctx.db.get(args.id);
    if (!escalation) throw new ConvexError("Escalation not found.");
    // Retries must preserve the first acknowledgement's audit timestamp.
    if (escalation.acknowledged_at != null) return;
    await ctx.db.patch(args.id, {
      acknowledged_at: Date.now(),
    });
  },
});
