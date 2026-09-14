import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  addMetrics,
  contribution,
  emptyMetrics,
  metricShard,
  METRIC_SHARDS,
} from "./metricValues";

export function metricsControl(ctx: Pick<QueryCtx, "db">) {
  return ctx.db
    .query("metrics_control")
    .withIndex("by_name", (q) => q.eq("name", "v1"))
    .unique();
}

export async function ensureMetricsControl(ctx: Pick<MutationCtx, "db">) {
  const existing = await metricsControl(ctx);
  if (existing) return existing;
  const id = await ctx.db.insert("metrics_control", {
    name: "v1",
    cursor: null,
    complete: false,
    enabled: false,
  });
  return (await ctx.db.get(id))!;
}

async function updateLocation(
  ctx: Pick<MutationCtx, "db">,
  location: string,
  shard: number,
  total: number,
  open: number,
) {
  if (total === 0 && open === 0) return;
  const catalog = await ctx.db
    .query("metrics_locations")
    .withIndex("by_location", (q) => q.eq("location", location))
    .unique();
  if (!catalog) await ctx.db.insert("metrics_locations", { location });
  const existing = await ctx.db
    .query("metrics_location_totals")
    .withIndex("by_location_shard", (q) =>
      q.eq("location", location).eq("shard", shard),
    )
    .unique();
  const value = {
    location,
    shard,
    total: (existing?.total ?? 0) + total,
    open: (existing?.open ?? 0) + open,
  };
  if (value.total < 0 || value.open < 0 || value.open > value.total)
    throw new ConvexError("Location metric receipt does not match its totals.");
  if (existing) await ctx.db.patch(existing._id, value);
  else await ctx.db.insert("metrics_location_totals", value);
}

// Source writes, contribution receipt and counters share the caller's atomic
// mutation. A repeated backfill or completion only applies the changed values.
export async function refreshTicketMetrics(
  ctx: Pick<MutationCtx, "db">,
  ticketId: Id<"tickets">,
) {
  const ticket = await ctx.db.get(ticketId);
  // An orphan queue row is not part of ticket-derived metrics. Preserve the
  // existing completion behavior; direct source deletion requires parity review.
  if (!ticket) return false;
  const egress = await ctx.db
    .query("telegram_egress_queue")
    .withIndex("by_ticket", (q) => q.eq("ticket_id", ticketId))
    .unique();
  const next = contribution(ticket, egress);
  const previous = await ctx.db
    .query("metrics_receipts")
    .withIndex("by_ticket", (q) => q.eq("ticket_id", ticketId))
    .unique();
  if (
    previous &&
    Object.entries(next).every(
      ([key, value]) => previous[key as keyof typeof next] === value,
    )
  )
    return false;
  const shard = metricShard(ticketId);
  if (previous && previous.shard !== shard)
    throw new ConvexError(
      "Metric shard changed; a separate migration is required.",
    );
  const existing = await ctx.db
    .query("metrics_totals")
    .withIndex("by_shard", (q) => q.eq("shard", shard))
    .unique();
  const total = emptyMetrics();
  if (existing) addMetrics(total, existing);
  if (previous) addMetrics(total, previous, -1);
  addMetrics(total, next);
  for (const key of ["totalTickets", "resolvedCount", "sblCount"] as const)
    if (total[key] < 0)
      throw new ConvexError("Metric receipt does not match its totals.");
  const value = { ...total, shard, revision: (existing?.revision ?? 0) + 1 };
  if (existing) await ctx.db.patch(existing._id, value);
  else await ctx.db.insert("metrics_totals", value);

  if (previous?.location === next.location) {
    await updateLocation(
      ctx,
      next.location,
      shard,
      0,
      next.open - previous.open,
    );
  } else {
    if (previous)
      await updateLocation(ctx, previous.location, shard, -1, -previous.open);
    await updateLocation(ctx, next.location, shard, 1, next.open);
  }
  const receipt = { ...next, ticket_id: ticketId, shard };
  if (previous) await ctx.db.patch(previous._id, receipt);
  else await ctx.db.insert("metrics_receipts", receipt);
  return true;
}

export async function readMetricTotals(ctx: Pick<QueryCtx, "db">) {
  const rows = await ctx.db.query("metrics_totals").take(METRIC_SHARDS + 1);
  const total = emptyMetrics();
  const revisions: number[] = Array(METRIC_SHARDS).fill(0);
  const seen = new Set<number>();
  for (const row of rows) {
    if (
      !Number.isInteger(row.shard) ||
      row.shard < 0 ||
      row.shard >= METRIC_SHARDS ||
      seen.has(row.shard)
    )
      throw new ConvexError(
        "Invalid metric shards; inspect before reading or enabling.",
      );
    seen.add(row.shard);
    revisions[row.shard] = row.revision;
    addMetrics(total, row);
  }
  return { total, revisions };
}

export async function readLocationPage(
  ctx: Pick<QueryCtx, "db">,
  cursor: string | null,
) {
  const result = await ctx.db.query("metrics_locations").paginate({
    cursor,
    numItems: 25,
    maximumRowsRead: 25,
    maximumBytesRead: 250_000,
  });
  if (
    !result.isDone &&
    (!result.page.length || result.continueCursor === cursor)
  )
    throw new ConvexError(
      "Location page did not advance; inspect retained location size.",
    );
  const locations = [];
  for (const { location } of result.page) {
    const shards = await ctx.db
      .query("metrics_location_totals")
      .withIndex("by_location_shard", (q) => q.eq("location", location))
      .take(METRIC_SHARDS + 1);
    const seen = new Set<number>();
    const value = { location, total: 0, open: 0 };
    for (const row of shards) {
      if (
        !Number.isInteger(row.shard) ||
        row.shard < 0 ||
        row.shard >= METRIC_SHARDS ||
        seen.has(row.shard)
      )
        throw new ConvexError("Invalid location metric shards.");
      seen.add(row.shard);
      value.total += row.total;
      value.open += row.open;
    }
    if (value.total > 0) locations.push(value);
  }
  return {
    locations,
    nextLocationCursor: result.isDone ? null : result.continueCursor,
  };
}
