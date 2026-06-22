import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Get all unacknowledged critical escalations for the dashboard (TASK-29)
export const getActiveEscalations = query({
  args: {},
  handler: async (ctx) => {
    // Note: In production this would verify the user is an admin.
    // Assuming dashboard-level auth restricts access to this component.
    const escalations = await ctx.db
      .query("_critical_escalations")
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
  args: { id: v.id("_critical_escalations") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      acknowledged_at: Date.now(),
    });
  },
});
