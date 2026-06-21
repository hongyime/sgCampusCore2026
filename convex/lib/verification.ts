import { QueryCtx } from "../_generated/server";

// 30-day SSO re-verification gate (tech_design.md §1).
//
// Known, ACCEPTED limitation (AGENTS.md): a verified student periodically
// re-authenticating on a buyer's behalf can defeat this. We do not try to
// "fix" that here — it's a social-engineering risk with no deterministic
// technical fix. This gate only enforces the time-based re-auth requirement.
export const REVERIFY_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type VerificationResult =
  | { verified: true; clerk_user_id: string }
  | { verified: false; reason: "not_paired" | "stale" };

/**
 * Resolve a Telegram user to a paired, currently-verified CampusCore user.
 * Returns `verified: false` (caller should prompt re-auth and stop processing)
 * when the Telegram id isn't paired or its last verification is > 30 days old.
 */
export async function checkVerification(
  ctx: QueryCtx,
  telegramUserId: string,
): Promise<VerificationResult> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_telegram_user", (q) =>
      q.eq("telegram_user_id", telegramUserId),
    )
    .unique();

  if (!user) {
    return { verified: false, reason: "not_paired" };
  }

  if (Date.now() - user.last_verified_at > REVERIFY_TTL_MS) {
    return { verified: false, reason: "stale" };
  }

  return { verified: true, clerk_user_id: user.clerk_user_id };
}
