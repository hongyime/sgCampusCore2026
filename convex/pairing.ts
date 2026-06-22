import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { isSchoolMemberEmail } from "../config/school";

// Telegram deep-link pairing (tech_design.md §1).
//
// Flow:
//   1. A signed-in @smu.edu.sg user (Clerk) calls `createPairingToken`. We mint
//      an opaque token with a 3-minute TTL and hand the user a deep link
//      (https://t.me/<bot>?start=<token>).
//   2. Telegram delivers `/start <token>` to the webhook, which calls
//      `redeemPairingToken`. Exactly one redemption can succeed; a second
//      attempt, an expired token, or an unknown token all fail closed.

const PAIRING_TTL_MS = 3 * 60 * 1000; // 180_000

export const createPairingToken = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const email = (identity.email ?? "").toLowerCase();
    if (!isSchoolMemberEmail(email)) {
      // Defense-in-depth; the authoritative gate is the per-instance Clerk
      // dashboard restriction. Accepts this deployment's student or staff
      // domains (CAMPUSCORE_SCHOOL_CODE → config/schoolRegistry).
      throw new Error("Institutional account for this school required");
    }

    const token = crypto.randomUUID().replace(/-/g, "");
    const now = Date.now();
    await ctx.db.insert("pairings", {
      token,
      clerk_user_id: identity.subject,
      email,
      created_at: now,
      expires_at: now + PAIRING_TTL_MS,
      redeemed_at: null,
      telegram_user_id: null,
      status: "pending",
    });

    // Return only the token; the caller composes the t.me deep link.
    return { token, expires_at: now + PAIRING_TTL_MS };
  },
});

export const redeemPairingToken = mutation({
  args: {
    token: v.string(),
    telegram_user_id: v.string(),
  },
  handler: async (ctx, { token, telegram_user_id }) => {
    const pairing = await ctx.db
      .query("pairings")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();

    // Unknown token → fail closed.
    if (!pairing) {
      return { ok: false as const, reason: "invalid" };
    }

    // Already redeemed → fail closed (idempotent: serializable mutations mean
    // a concurrent redemption already set redeemed_at, so we never double-pair).
    if (pairing.redeemed_at !== null) {
      return { ok: false as const, reason: "already_redeemed" };
    }

    // Expired → fail closed and mark it so it isn't retried.
    if (Date.now() > pairing.expires_at) {
      await ctx.db.patch(pairing._id, { status: "expired" });
      return { ok: false as const, reason: "expired" };
    }

    await ctx.db.patch(pairing._id, {
      redeemed_at: Date.now(),
      telegram_user_id,
      status: "redeemed",
    });

    // Record/refresh institutional verification for the 30-day gate (TASK-11).
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_user", (q) =>
        q.eq("clerk_user_id", pairing.clerk_user_id),
      )
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        telegram_user_id,
        last_verified_at: now,
      });
    } else {
      await ctx.db.insert("users", {
        clerk_user_id: pairing.clerk_user_id,
        email: pairing.email,
        telegram_user_id,
        last_verified_at: now,
      });
    }

    return { ok: true as const, clerk_user_id: pairing.clerk_user_id };
  },
});
