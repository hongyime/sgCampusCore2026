import { internalMutation, internalQuery } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
  countResolution,
  ensureLeaderboardControl,
  leaderboardControl,
  rankedVolunteers,
} from "./lib/leaderboard";

// Operator-driven, finite work. No recurring job or browser can trigger a scan.
// Existing counters/receipts survive a restart, including a code rollback.
export const startBackfill = internalMutation({
  args: {},
  handler: async (ctx) => {
    const control = await ensureLeaderboardControl(ctx);
    await ctx.db.patch(control._id, {
      cursor: null,
      complete: false,
      enabled: false,
    });
  },
});

export const backfillPage = internalMutation({
  args: {},
  handler: async (ctx) => {
    const control = await ensureLeaderboardControl(ctx);
    if (control.complete) return { processed: 0, counted: 0, done: true };
    const result = await ctx.db.query("resolutions").paginate({
      cursor: control.cursor,
      numItems: 25,
      maximumRowsRead: 25,
      maximumBytesRead: 250_000,
    });
    if (
      !result.isDone &&
      (result.page.length === 0 || result.continueCursor === control.cursor)
    ) {
      throw new ConvexError(
        "Backfill cursor did not advance; inspect before resuming.",
      );
    }
    let counted = 0;
    for (const row of result.page)
      if (await countResolution(ctx, row)) counted++;
    await ctx.db.patch(control._id, {
      cursor: result.continueCursor,
      complete: result.isDone,
    });
    return { processed: result.page.length, counted, done: result.isDone };
  },
});

export const inspect = internalQuery({
  args: {},
  handler: async (ctx) => ({
    control: await leaderboardControl(ctx),
    top: await rankedVolunteers(ctx),
  }),
});

// Private, bounded source/derived pages let an operator compare every retained
// record without a public full-table endpoint. No raw identities need logging.
export const verificationPage = internalQuery({
  args: {
    table: v.union(v.literal("resolutions"), v.literal("leaderboard_totals")),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) =>
    ctx.db.query(args.table).paginate({
      cursor: args.cursor,
      numItems: 100,
      maximumRowsRead: 100,
      maximumBytesRead: 500_000,
    }),
});

export const setEnabled = internalMutation({
  args: { enabled: v.boolean(), expectedTotal: v.number() },
  handler: async (ctx, args) => {
    const control = await leaderboardControl(ctx);
    if (
      !control ||
      (args.enabled &&
        (!control.complete || control.total !== args.expectedTotal))
    ) {
      throw new ConvexError(
        "Completed, unchanged retained-history validation is required.",
      );
    }
    await ctx.db.patch(control._id, { enabled: args.enabled });
  },
});
