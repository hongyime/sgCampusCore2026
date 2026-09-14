import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export function leaderboardControl(ctx: Pick<QueryCtx, "db">) {
  return ctx.db
    .query("leaderboard_control")
    .withIndex("by_name", (q) => q.eq("name", "v1"))
    .unique();
}

export async function ensureLeaderboardControl(ctx: Pick<MutationCtx, "db">) {
  const existing = await leaderboardControl(ctx);
  if (existing) return existing;
  const id = await ctx.db.insert("leaderboard_control", {
    name: "v1",
    cursor: null,
    complete: false,
    enabled: false,
    total: 0,
  });
  return (await ctx.db.get(id))!;
}

// The source receipt, volunteer total and global count commit together in the
// caller's Convex mutation. Retrying a page cannot count a resolution twice.
export async function countResolution(
  ctx: Pick<MutationCtx, "db">,
  resolution: Doc<"resolutions">,
) {
  if (resolution.leaderboard_counted) return false;
  const control = await ensureLeaderboardControl(ctx);
  const existing = await ctx.db
    .query("leaderboard_totals")
    .withIndex("by_resolver", (q) =>
      q.eq("resolver_id", resolution.resolver_id),
    )
    .unique();
  const count = (existing?.count ?? 0) + 1;
  const value = {
    resolver_id: resolution.resolver_id,
    count,
    negative_count: -count,
    first_created_at: Math.min(
      existing?.first_created_at ?? Infinity,
      resolution._creationTime,
    ),
  };
  if (existing) await ctx.db.patch(existing._id, value);
  else await ctx.db.insert("leaderboard_totals", value);
  await ctx.db.patch(resolution._id, { leaderboard_counted: true });
  await ctx.db.patch(control._id, { total: control.total + 1 });
  return true;
}

export async function rankedVolunteers(ctx: Pick<QueryCtx, "db">) {
  const rows = await ctx.db
    .query("leaderboard_totals")
    .withIndex("by_rank")
    .take(10);
  return rows.map((row) => ({ userId: row.resolver_id, count: row.count }));
}
