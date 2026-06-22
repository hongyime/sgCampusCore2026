import { internalMutation } from "./_generated/server";
import { resolvePriorityTier } from "./lib/severityFloor";

// Burst test helper for Egress Queue (AGENTS.md requirement)
export const seed50Tickets = internalMutation({
  args: {},
  handler: async (ctx) => {
    let emergencyCount = 0;
    let routineCount = 0;
    
    for (let i = 0; i < 50; i++) {
      // 10% emergency, 90% routine
      const text = i % 10 === 0 ? "emergency bleeding hazard" : `Routine issue ${i}`;
      const priority_tier = resolvePriorityTier(text);
      
      if (priority_tier === 1) emergencyCount++;
      else routineCount++;
      
      const now = Date.now();

      const ticketId = await ctx.db.insert("tickets", {
        category: null,
        priority_tier,
        triage_status: "awaiting_input",
        initial_tap_at: null,
        created_at: now,
        resolved_at: null,
        location_entity: "Burst Test Location",
        headline: `Test Ticket ${i}`,
        status: "open",
        description: text,
        image_status: "none",
        llm_severity_score: priority_tier === 1 ? 9 : 2,
      });

      await ctx.db.insert("_telegram_egress_queue", {
        ticket_id: ticketId,
        status: "pending",
        priority_tier,
        claimed_at: null,
        retry_count: 0,
        created_at: now,
        egress_cleared_at: null,
      });
    }
    
    console.log(`[BurstTest] Seeded ${emergencyCount} tier-1 and ${routineCount} tier-2 tickets.`);
  }
});
