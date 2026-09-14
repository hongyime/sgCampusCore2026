import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";

export const METRIC_SHARDS = 16;
export const metricFields = {
  totalTickets: v.number(),
  resolvedCount: v.number(),
  totalTtrMs: v.number(),
  sblCount: v.number(),
  totalSblMs: v.number(),
};
export const metricTotals = v.object(metricFields);
export type MetricTotals = Infer<typeof metricTotals>;
export type Contribution = MetricTotals & { location: string; open: number };

export function emptyMetrics(): MetricTotals {
  return {
    totalTickets: 0,
    resolvedCount: 0,
    totalTtrMs: 0,
    sblCount: 0,
    totalSblMs: 0,
  };
}

export function metricShard(ticketId: string) {
  // Stable across retries and deployments; unrelated tickets need not write
  // one global counter row. Convex serializes concurrent writes per shard.
  let hash = 2166136261;
  for (const character of ticketId)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) % METRIC_SHARDS;
}

export function contribution(
  ticket: Doc<"tickets">,
  egress: Doc<"telegram_egress_queue"> | null,
): Contribution {
  const resolved = ticket.status === "resolved" && ticket.resolved_at !== null;
  const sent = egress?.egress_cleared_at != null;
  const value = {
    totalTickets: 1,
    resolvedCount: resolved ? 1 : 0,
    totalTtrMs: resolved ? ticket.resolved_at! - ticket.created_at : 0,
    sblCount: sent ? 1 : 0,
    totalSblMs: sent ? egress!.egress_cleared_at! - ticket.created_at : 0,
    location: ticket.location_entity || "Unknown",
    open: ticket.status === "open" ? 1 : 0,
  };
  // Zero timestamps are valid. Preserve negative retained durations too;
  // silently clamping them would change the historical averages.
  if (
    !Number.isFinite(ticket.created_at) ||
    !Object.keys(metricFields).every((key) =>
      Number.isFinite(value[key as keyof MetricTotals]),
    )
  )
    throw new ConvexError(
      "Invalid retained metric timestamp; inspect the source record.",
    );
  return value;
}

export function addMetrics(
  total: MetricTotals,
  delta: MetricTotals,
  multiplier = 1,
) {
  for (const key of Object.keys(metricFields) as (keyof MetricTotals)[]) {
    total[key] += delta[key] * multiplier;
    if (!Number.isFinite(total[key]))
      throw new ConvexError("Metric total is not finite.");
  }
  return total;
}

export function metricSummary(total: MetricTotals) {
  return {
    totalTickets: total.totalTickets,
    resolvedCount: total.resolvedCount,
    avgTtrMs: total.resolvedCount ? total.totalTtrMs / total.resolvedCount : 0,
    avgSblMs: total.sblCount ? total.totalSblMs / total.sblCount : 0,
  };
}
