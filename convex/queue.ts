import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// TASK-22: claim_batch
export const claimBatch = internalMutation({
  args: {
    limit: v.number(),
    priority_tier: v.union(v.literal(1), v.literal(2)),
  },
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("_telegram_egress_queue")
      .withIndex("by_status_priority_created", (q) =>
        q.eq("status", "pending").eq("priority_tier", args.priority_tier)
      )
      .take(args.limit);

    const now = Date.now();
    for (const row of pending) {
      await ctx.db.patch(row._id, {
        status: "processing",
        claimed_at: now,
      });
    }

    return pending;
  },
});

// TASK-23: finalize_batch
export const finalizeBatch = internalMutation({
  args: {
    results: v.array(
      v.object({
        id: v.id("_telegram_egress_queue"),
        success: v.boolean(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const res of args.results) {
      const row = await ctx.db.get(res.id);
      if (!row) continue;

      if (res.success) {
        await ctx.db.patch(row._id, {
          status: "sent",
          egress_cleared_at: now,
        });
      } else {
        const nextRetry = row.retry_count + 1;
        if (nextRetry >= 3) {
          await ctx.db.patch(row._id, {
            status: "dead_letter",
            claimed_at: null,
            retry_count: nextRetry,
          });

          if (row.priority_tier === 1) {
            await ctx.db.insert("_critical_escalations", {
              ticket_id: row.ticket_id,
              reason: "dead_letter",
              created_at: now,
            });
          }
        } else {
          await ctx.db.patch(row._id, {
            status: "pending",
            claimed_at: null,
            retry_count: nextRetry,
          });
        }
      }
    }
  },
});

// TASK-24: Reaper
export const reapStaleProcessing = internalMutation({
  args: {},
  handler: async (ctx) => {
    const processing = await ctx.db
      .query("_telegram_egress_queue")
      .withIndex("by_status", (q) => q.eq("status", "processing"))
      .collect();

    const now = Date.now();
    const TIMEOUT_MS = 10 * 60 * 1000 + 30000; // 10m30s

    for (const row of processing) {
      if (row.claimed_at && now - row.claimed_at > TIMEOUT_MS) {
        const nextRetry = row.retry_count + 1;
        if (nextRetry >= 3) {
          await ctx.db.patch(row._id, {
            status: "dead_letter",
            claimed_at: null,
            retry_count: nextRetry,
          });

          if (row.priority_tier === 1) {
            await ctx.db.insert("_critical_escalations", {
              ticket_id: row.ticket_id,
              reason: "dead_letter",
              created_at: now,
            });
          }
        } else {
          await ctx.db.patch(row._id, {
            status: "pending",
            claimed_at: null,
            retry_count: nextRetry,
          });
        }
      }
    }
  },
});

export const getTicket = internalQuery({
  args: { id: v.id("tickets") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
