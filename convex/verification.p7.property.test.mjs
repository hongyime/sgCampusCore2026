// Property-based test P7 for checkVerification — 30-day gate one-shot.
//
// **Validates: Requirements 4.1, 12.10**
// Design: .kiro/specs/multi-school-template-hardening/design.md
//         § Correctness Properties — Property 7
//         § LLD-5 (three-state table + boundary conditions)
//
// **numRuns override:** this file runs at `numRuns: 25` per an explicit user
// override recorded on the Task 3.7 instructions. The original spec called
// for 100 iterations per Requirement 11.4; the override reduces that to 25
// for faster local iteration on Windows/Node --test. If a P7 regression is
// ever suspected of hiding in the shrinkage tail, bump this back to 100
// (or higher) and re-run before shipping.
//
// Formal statement:
//   ∀ paired user U, ∀ t1 with t1 - U.last_verified_at > REVERIFY_TTL_MS,
//   ∀ t2 ∈ [t1, t3) where t3 = time of next successful
//     redeemPairingToken(_, U.tg_id):
//       checkVerification(t2) = { verified: false, reason: "stale" };
//   AND checkVerification(t3 + ε) = { verified: true, clerk_user_id: U.cid }.
//
// Additional example-based assertion (R4.5 strict-`>` boundary): at the
// exact instant `t = last_verified_at + REVERIFY_TTL_MS`, the gate MUST
// return `verified: true`. This is bolted onto the property block, not a
// separate test, per Task 3.7's spec.
//
// WHY MIRROR-PLUS-DRIFT-GUARD, NOT DIRECT IMPORT:
//   `convex/lib/verification.ts` and `convex/pairing.ts` are TypeScript
//   modules. Node's built-in `node --test` runner cannot load TypeScript
//   without a loader, and Requirement 11.3 forbids adding any devDependency
//   beyond the AGENTS.md-approved `fast-check` exception. This file
//   therefore inlines plain-JavaScript ports of `checkVerification` and
//   `redeemPairingToken.handler`, driven against the in-memory stub from
//   `convex/pairing.testStub.mjs` (Task 2.3). A drift guard at the bottom
//   re-reads the two `.ts` sources and asserts the mirror still corresponds
//   to real exports — if someone renames a function, flips the `>` to `>=`
//   at the 30-day boundary, or changes the upsert path, the guard fails
//   loudly and this file must be updated in lockstep.
//
// This mirror pattern matches config/isAdminEmail.p1.property.test.mjs.
//
// CLOCK CONTROL:
//   `checkVerification` and `redeemPairingToken` call the global `Date.now()`
//   directly (see `convex/pairing.testStub.mjs` header). The stub deliberately
//   does NOT intercept the global; tests patch it themselves and restore in
//   a `finally` — the copy-pasteable pattern the stub documents.
//
// Runnable with:  node --test convex/verification.p7.property.test.mjs
// Or via:         npm run test:pbt

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import fc from "fast-check";

import { createStubCtx } from "./pairing.testStub.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Ported constants — mirror `convex/lib/verification.ts` and `convex/pairing.ts`.
// ---------------------------------------------------------------------------

const REVERIFY_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 2_592_000_000 (30 days)
const PAIRING_TTL_MS = 3 * 60 * 1000; // 180_000 (3 minutes)

// ---------------------------------------------------------------------------
// Ported policy — `checkVerification` from convex/lib/verification.ts.
// Read-only lookup returning one of three verification states.
// Strict `>` at the 30-day boundary per Requirement 4.5 (design § LLD-5).
// ---------------------------------------------------------------------------

async function checkVerification(ctx, telegramUserId) {
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

// ---------------------------------------------------------------------------
// Ported policy — `redeemPairingToken.handler` from convex/pairing.ts.
// Serializable atomic single-use redemption; on success upserts the user's
// row keyed on `clerk_user_id` with `last_verified_at = Date.now()`, which
// is the SOLE code path that refreshes the 30-day gate (Requirement 4.7).
// ---------------------------------------------------------------------------

async function redeemPairingTokenHandler(ctx, { token, telegram_user_id }) {
  const pairing = await ctx.db
    .query("pairings")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();

  if (!pairing) {
    return { ok: false, reason: "invalid" };
  }

  if (pairing.redeemed_at !== null) {
    return { ok: false, reason: "already_redeemed" };
  }

  if (Date.now() > pairing.expires_at) {
    await ctx.db.patch(pairing._id, { status: "expired" });
    return { ok: false, reason: "expired" };
  }

  await ctx.db.patch(pairing._id, {
    redeemed_at: Date.now(),
    telegram_user_id,
    status: "redeemed",
  });

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

  return { ok: true, clerk_user_id: pairing.clerk_user_id };
}

// ---------------------------------------------------------------------------
// Test fixtures — a single paired user seeded with `last_verified_at = 0`
// so any `t1 > REVERIFY_TTL_MS` is guaranteed to be strictly past the gate.
// The Telegram id, Clerk id, and email are constants so shrinkage focuses
// entirely on the time coordinate.
// ---------------------------------------------------------------------------

const TELEGRAM_ID = "tg_smu_12345";
const CLERK_ID = "user_smu_abcdef";
const EMAIL = "student@smu.edu.sg";

function seedCtx() {
  return createStubCtx({
    users: [
      {
        clerk_user_id: CLERK_ID,
        email: EMAIL,
        telegram_user_id: TELEGRAM_ID,
        last_verified_at: 0,
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Property 7 — 30-day gate one-shot.
// Quantify t1 over (REVERIFY_TTL_MS, 10 * REVERIFY_TTL_MS] via fc.integer;
// numRuns pinned to 25 per the Task 3.7 user override (spec baseline: 100
// per R11.4 — see the file header for the override rationale).
// ---------------------------------------------------------------------------

describe("checkVerification — Property 7: 30-day gate one-shot", () => {
  it("∀ t1 > REVERIFY_TTL_MS: stale before redeem, verified after redeem", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({
          min: REVERIFY_TTL_MS + 1,
          max: REVERIFY_TTL_MS * 10,
        }),
        async (t1) => {
          const ctx = seedCtx();
          const realNow = Date.now;
          try {
            // ---- At t1 (strictly past the 30-day boundary): stale ----
            Date.now = () => t1;
            const staleResult = await checkVerification(ctx, TELEGRAM_ID);
            if (staleResult.verified !== false) return false;
            if (staleResult.reason !== "stale") return false;

            // ---- Advance clock to t3 > t1 and mint a fresh pairing ----
            // t3 is the "time of the next successful redeemPairingToken"
            // referenced in the formal statement. Any t3 > t1 works; +1 ms
            // keeps arithmetic simple and stays inside integer range.
            const t3 = t1 + 1;
            const token = `p7_token_${t1}`;
            Date.now = () => t3;
            await ctx.db.insert("pairings", {
              token,
              clerk_user_id: CLERK_ID,
              email: EMAIL,
              created_at: t3,
              expires_at: t3 + PAIRING_TTL_MS,
              redeemed_at: null,
              telegram_user_id: null,
              status: "pending",
            });

            // Redeem at t3 — upserts users.last_verified_at to t3.
            const redeemResult = await redeemPairingTokenHandler(ctx, {
              token,
              telegram_user_id: TELEGRAM_ID,
            });
            if (redeemResult.ok !== true) return false;
            if (redeemResult.clerk_user_id !== CLERK_ID) return false;

            // ---- At t3 + ε (ε = 1 ms): verified, correct clerk_user_id ----
            Date.now = () => t3 + 1;
            const freshResult = await checkVerification(ctx, TELEGRAM_ID);
            if (freshResult.verified !== true) return false;
            if (freshResult.clerk_user_id !== CLERK_ID) return false;

            return true;
          } finally {
            Date.now = realNow;
          }
        },
      ),
      { numRuns: 25 },
    );
  });

  // Bolted-on example-based case (per Task 3.7 spec: "one example-based
  // case bolted onto the property, not a separate test"). Locks the
  // strict-`>` boundary from Requirement 4.5 / design § LLD-5.
  it("boundary R4.5: at exact t = last_verified_at + REVERIFY_TTL_MS, verified: true (strict `>`)", async () => {
    const LAST_VERIFIED = 1_000_000; // arbitrary non-zero baseline
    const ctx = createStubCtx({
      users: [
        {
          clerk_user_id: CLERK_ID,
          email: EMAIL,
          telegram_user_id: TELEGRAM_ID,
          last_verified_at: LAST_VERIFIED,
        },
      ],
    });

    const realNow = Date.now;
    try {
      // Exact boundary: Date.now() - last_verified_at === REVERIFY_TTL_MS.
      // Under strict-`>` this is NOT stale.
      Date.now = () => LAST_VERIFIED + REVERIFY_TTL_MS;
      const atBoundary = await checkVerification(ctx, TELEGRAM_ID);
      assert.equal(
        atBoundary.verified,
        true,
        "at exact boundary the gate must be fresh (strict `>`)",
      );
      assert.equal(atBoundary.clerk_user_id, CLERK_ID);

      // One millisecond past the boundary: NOW stale. The pair of
      // assertions together pins the strict-`>` semantic.
      Date.now = () => LAST_VERIFIED + REVERIFY_TTL_MS + 1;
      const pastBoundary = await checkVerification(ctx, TELEGRAM_ID);
      assert.equal(pastBoundary.verified, false);
      assert.equal(pastBoundary.reason, "stale");
    } finally {
      Date.now = realNow;
    }
  });
});

// ---------------------------------------------------------------------------
// Drift guard — the mirror above is only meaningful if the source .ts still
// implements the same policy. Assert the identifiers, TTL constant, and
// key algorithmic substrings this test depends on are still present. If any
// of these fail, the mirror is stale and MUST be updated in lockstep before
// the source-file change lands.
// ---------------------------------------------------------------------------

describe("drift guard: P7 mirror still matches convex/lib/verification.ts + convex/pairing.ts", () => {
  it("convex/lib/verification.ts still exports checkVerification with strict-`>` at REVERIFY_TTL_MS", () => {
    const source = readFileSync(
      resolve(__dirname, "lib/verification.ts"),
      "utf8",
    );
    assert.match(
      source,
      /export\s+(async\s+)?function\s+checkVerification\b/,
      "checkVerification export missing",
    );
    assert.match(
      source,
      /export\s+const\s+REVERIFY_TTL_MS\s*=\s*30\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/,
      "REVERIFY_TTL_MS constant missing or changed from 30d",
    );
    assert.match(
      source,
      /Date\.now\(\)\s*-\s*user\.last_verified_at\s*>\s*REVERIFY_TTL_MS/,
      "strict-`>` comparison at 30-day boundary missing (Requirement 4.5)",
    );
    assert.match(
      source,
      /reason:\s*"stale"/,
      '"stale" reason literal missing',
    );
    assert.match(
      source,
      /reason:\s*"not_paired"/,
      '"not_paired" reason literal missing',
    );
    assert.match(
      source,
      /withIndex\("by_telegram_user"/,
      "by_telegram_user index lookup missing",
    );
  });

  it("convex/pairing.ts still exports redeemPairingToken with upsert-users on success", () => {
    const source = readFileSync(resolve(__dirname, "pairing.ts"), "utf8");
    assert.match(
      source,
      /export\s+const\s+redeemPairingToken\s*=\s*mutation/,
      "redeemPairingToken export missing",
    );
    assert.match(
      source,
      /PAIRING_TTL_MS\s*=\s*3\s*\*\s*60\s*\*\s*1000/,
      "PAIRING_TTL_MS constant missing or changed from 3min",
    );
    assert.match(
      source,
      /withIndex\("by_token"/,
      "by_token index lookup missing in redeemPairingToken",
    );
    assert.match(
      source,
      /withIndex\("by_clerk_user"/,
      "by_clerk_user index lookup missing (upsert path)",
    );
    assert.match(
      source,
      /last_verified_at:\s*now/,
      "last_verified_at upsert on redeem missing (Requirement 4.7 refresh path)",
    );
    assert.match(
      source,
      /Date\.now\(\)\s*>\s*pairing\.expires_at/,
      "expires_at strict-`>` TTL check missing (Requirement 5.2)",
    );
  });
});
