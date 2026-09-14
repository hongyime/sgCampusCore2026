import { v } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import {
  addMetrics,
  contribution,
  emptyMetrics,
  metricSummary,
} from "./metricValues";
import { metricsControl, readLocationPage, readMetricTotals } from "./metrics";

const locationValue = v.object({
  location: v.string(),
  total: v.number(),
  open: v.number(),
});
export const dashboardMetricResult = v.object({
  avgTtrMs: v.number(),
  avgSblMs: v.number(),
  resolvedCount: v.number(),
  totalTickets: v.number(),
  locations: v.array(locationValue),
  nextLocationCursor: v.union(v.string(), v.null()),
  locationPageReset: v.boolean(),
  // Transitional field for an already-loaded dashboard bundle. New clients
  // use locations, where arbitrary Unicode names are values, never object keys.
  locationBreakdown: v.record(
    v.string(),
    v.object({ total: v.number(), open: v.number() }),
  ),
});

function legacyLocations(
  locations: { location: string; total: number; open: number }[],
) {
  return Object.fromEntries(
    locations
      .filter(
        ({ location }) =>
          /^[\x20-\x7e]+$/.test(location) &&
          location.length <= 1024 &&
          !/^[\$_]/.test(location),
      )
      .map(({ location, total, open }) => [location, { total, open }]),
  );
}

export async function readDashboardMetrics(
  ctx: Pick<QueryCtx, "db">,
  cursor: string | null,
) {
  const control = await metricsControl(ctx);
  if (control?.enabled) {
    const prefix = "metrics-v1:";
    const locationPageReset = cursor !== null && !cursor.startsWith(prefix);
    const { total } = await readMetricTotals(ctx);
    const page = await readLocationPage(
      ctx,
      cursor?.startsWith(prefix) ? cursor.slice(prefix.length) : null,
    );
    return {
      ...metricSummary(total),
      ...page,
      locationPageReset,
      nextLocationCursor:
        page.nextLocationCursor === null
          ? null
          : prefix + page.nextLocationCursor,
      locationBreakdown: legacyLocations(page.locations),
    };
  }

  // Preserve full source history while an operator is preparing/reconciling
  // the derived tables. A visitor's cursor can never select this fallback
  // after the internal activation gate is enabled.
  const total = emptyMetrics();
  const byLocation = new Map<
    string,
    { location: string; total: number; open: number }
  >();
  for (const ticket of await ctx.db.query("tickets").collect()) {
    const egress = await ctx.db
      .query("telegram_egress_queue")
      .withIndex("by_ticket", (q) => q.eq("ticket_id", ticket._id))
      .unique();
    const value = contribution(ticket, egress);
    addMetrics(total, value);
    const location = byLocation.get(value.location) ?? {
      location: value.location,
      total: 0,
      open: 0,
    };
    location.total++;
    location.open += value.open;
    byLocation.set(value.location, location);
  }
  const match = cursor?.match(/^history:(\d+)$/);
  const offset =
    match && Number.isSafeInteger(Number(match[1])) ? Number(match[1]) : 0;
  const all = [...byLocation.values()];
  const locations = all.slice(offset, offset + 25);
  return {
    ...metricSummary(total),
    locations,
    nextLocationCursor:
      offset + 25 < all.length ? `history:${offset + 25}` : null,
    locationPageReset: cursor !== null && !match,
    locationBreakdown: legacyLocations(locations),
  };
}
