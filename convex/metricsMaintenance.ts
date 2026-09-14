import { internalMutation, internalQuery } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
  ensureMetricsControl,
  metricsControl,
  readMetricTotals,
  refreshTicketMetrics,
} from "./lib/metrics";

// Finite operator work only. No scheduled scanner or public backfill endpoint.
export const startBackfill = internalMutation({
  args: {},
  handler: async (ctx) => {
    const control = await ensureMetricsControl(ctx);
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
    const control = await ensureMetricsControl(ctx);
    if (control.complete) return { processed: 0, updated: 0, done: true };
    const result = await ctx.db.query("tickets").paginate({
      cursor: control.cursor,
      numItems: 25,
      maximumRowsRead: 25,
      maximumBytesRead: 250_000,
    });
    if (
      !result.isDone &&
      (!result.page.length || result.continueCursor === control.cursor)
    )
      throw new ConvexError(
        "Backfill cursor did not advance; inspect before resuming.",
      );
    let updated = 0;
    for (const ticket of result.page)
      if (await refreshTicketMetrics(ctx, ticket._id)) updated++;
    await ctx.db.patch(control._id, {
      cursor: result.continueCursor,
      complete: result.isDone,
    });
    return { processed: result.page.length, updated, done: result.isDone };
  },
});

export const inspect = internalQuery({
  args: {},
  handler: async (ctx) => ({
    control: await metricsControl(ctx),
    ...(await readMetricTotals(ctx)),
  }),
});

// Idempotent single-ticket reconciliation, also used to validate concurrent
// writes without invoking external providers or synthetic emergency timers.
export const refreshTicket = internalMutation({
  args: { ticketId: v.id("tickets") },
  handler: (ctx, args) => refreshTicketMetrics(ctx, args.ticketId),
});

// Keep original fields available for lossless source/parity verification.
// These pages are private; operator reports must contain totals, not raw PII.
export const verificationPage = internalQuery({
  args: {
    table: v.union(
      v.literal("tickets"),
      v.literal("telegram_egress_queue"),
      v.literal("metrics_receipts"),
      v.literal("metrics_totals"),
      v.literal("metrics_locations"),
      v.literal("metrics_location_totals"),
    ),
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
  args: { enabled: v.boolean(), expectedRevisions: v.array(v.number()) },
  handler: async (ctx, args) => {
    const control = await metricsControl(ctx);
    const { revisions } = await readMetricTotals(ctx);
    if (
      !control ||
      (args.enabled &&
        (!control.complete ||
          args.expectedRevisions.length !== revisions.length ||
          !revisions.every(
            (revision, index) => args.expectedRevisions[index] === revision,
          )))
    )
      throw new ConvexError(
        "Completed, unchanged retained-history validation is required.",
      );
    await ctx.db.patch(control._id, { enabled: args.enabled });
  },
});
