// Property-based test P3: Pairing TTL.
//
// **Property 3: Pairing TTL.**
// **Validates: Requirements 5.2** (design.md § Correctness Properties P3,
// § Algorithm `redeemPairingToken`).
//
// Formal statement:
//   ∀ T minted at t0, ∀ t > t0 + PAIRING_TTL_MS,
//     redeemPairingToken(T, *) at t returns { ok: false, reason: "expired" }.
//
// numRuns override: 25 (user override, reduced from the original spec's 100
// per R11.4 for local iteration speed). The TTL branch has no continuous
// parameter to explore — every `dt > 180_000` exercises the same code path
// — so a smaller run count still gives high confidence in the property.
//
// WHY THIS IS A MIRROR, NOT AN IMPORT:
//   convex/pairing.ts is a TypeScript module and imports Convex-generated
//   helpers (`./_generated/server`, `convex/values`) whose runtime shape at
//   module-load time depends on `convex dev` codegen. Node's built-in
//   `node --test` runner cannot load TypeScript without a loader, and the
//   AGENTS.md § "Approval Checkpoints" rule forbids adding new devDependencies
//   beyond the pinned `fast-check` exception (Requirement 11.2, 11.3). This
//   file therefore inlines a plain-JavaScript port of the `redeemPairingToken`
//   handler body. A drift guard at the bottom re-reads the source .ts and
//   asserts the identifiers, TTL constant, and expired-branch behavior this
//   mirror depends on are still present; if pairing.ts drifts, the guard
//   fails loudly and the mirror must be updated in lockstep. Same pattern as
//   config/isAdminEmail.p1.property.test.mjs.
//
// CLOCK PATCHING (per convex/pairing.testStub.mjs header comment):
//   `pairing.ts` calls the *global* `Date.now()` directly. The stub cannot
//   intercept that transparently. This test patches `Date.now` globally
//   inside each iteration and restores it via a `finally` block so no
//   iteration can leak time state to the next iteration or to unrelated tests.
//
// FRESHNESS PER ITERATION:
//   Each fc.property callback constructs a NEW stub ctx and seeds a NEW
//   pending pairings row. No `pairings` or `users` state carries across
//   iterations, so a shrunk counter-example is attributable to exactly one
//   (t0, dt) input.
//
// Runnable with:  node --test convex/pairing.p3.property.test.mjs
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
// Ported policy — mirrors convex/pairing.ts `redeemPairingToken` handler.
// Keep in lockstep with that file; drift guard at the bottom enforces this.
// ---------------------------------------------------------------------------

const PAIRING_TTL_MS = 3 * 60 * 1000; // 180_000

async function redeemPairingTokenHandler(ctx, { token, telegram_user_id }) {
  const pairing = await ctx.db
    .query("pairings")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();

  // Unknown token → fail closed.
  if (!pairing) {
    return { ok: false, reason: "invalid" };
  }

  // Already redeemed → fail closed.
  if (pairing.redeemed_at !== null) {
    return { ok: false, reason: "already_redeemed" };
  }

  // Expired → fail closed and mark it so it isn't retried. THIS is the
  // branch Property P3 exercises.
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
// Property 3 — Pairing TTL
//   ∀ T minted at t0, ∀ dt > PAIRING_TTL_MS,
//     redeemPairingToken(T, *) at (t0 + dt) → { ok: false, reason: "expired" }
// ---------------------------------------------------------------------------

describe("redeemPairingToken (Property 3: Pairing TTL)", () => {
  it("∀ dt > PAIRING_TTL_MS, redemption at t0 + dt returns { ok: false, reason: \"expired\" }", async () => {
    // Fixed anchor time. The property doesn't depend on the specific t0
    // — any deterministic non-zero value is fine because both `created_at`
    // and `expires_at` are seeded from this same t0. Choosing a realistic
    // millisecond epoch (2024-01-01T00:00:00Z) rather than 0 catches any
    // accidental unsigned-overflow assumption in a future rewrite.
    const t0 = 1_704_067_200_000;

    // dt strictly greater than PAIRING_TTL_MS, bounded above by 30 days
    // (task spec: keep the test space realistic; the property is trivially
    // true for astronomically large dt and testing that adds no signal).
    const dtArb = fc.integer({
      min: PAIRING_TTL_MS + 1,
      max: 30 * 24 * 60 * 60 * 1000,
    });

    // Token arbitrary: any non-empty string. `pairing.ts` treats `token`
    // as an opaque lookup key, so the shape of the string is not part of
    // the TTL property. `fc.string({ minLength: 1 })` keeps the input
    // space wide without generating empty strings that would collide
    // with a future edge-case test.
    const tokenArb = fc.string({ minLength: 1, maxLength: 64 });

    // Telegram user id arbitrary: any string (including empty), because
    // the expired branch short-circuits before touching this field.
    const tgIdArb = fc.string({ maxLength: 32 });

    await fc.assert(
      fc.asyncProperty(dtArb, tokenArb, tgIdArb, async (dt, token, telegram_user_id) => {
        // FRESH ctx per iteration — no state leakage across shrinking.
        const ctx = createStubCtx({
          pairings: [
            {
              token,
              clerk_user_id: "user_test_p3",
              email: "test@smu.edu.sg",
              created_at: t0,
              expires_at: t0 + PAIRING_TTL_MS,
              redeemed_at: null,
              telegram_user_id: null,
              status: "pending",
            },
          ],
        });

        // Patch the global clock. `pairing.ts` reads `Date.now()` directly,
        // so overriding the global is the only way to advance time from
        // the test. Restore in `finally` so a thrown assertion, a shrink,
        // or an unhandled rejection cannot leak time state to another
        // iteration or another test file.
        const realNow = Date.now;
        Date.now = () => t0 + dt;
        try {
          const result = await redeemPairingTokenHandler(ctx, {
            token,
            telegram_user_id,
          });
          assert.deepEqual(result, { ok: false, reason: "expired" });

          // Side-effect assertion: the expired-branch patch should have
          // marked the row `status: "expired"` (design § Algorithm
          // `redeemPairingToken`, expired branch). Confirms the branch
          // that fired is actually the TTL branch and not, e.g., a
          // silent `invalid` path from a stub lookup miss.
          const row = [...ctx._tables.pairings.values()].find(
            (r) => r.token === token,
          );
          assert.equal(row?.status, "expired");
          assert.equal(row?.redeemed_at, null);
        } finally {
          Date.now = realNow;
        }
      }),
      { numRuns: 25 },
    );
  });
});

// ---------------------------------------------------------------------------
// Drift guard — the mirror above is only meaningful if the source .ts still
// implements the same policy. Assert the identifiers, TTL constant, and
// expired-branch shape this test depends on are still present. If any of
// these fail, the mirror is stale and MUST be updated in lockstep before
// the source change lands.
// ---------------------------------------------------------------------------

describe("drift guard: P3 mirror still matches convex/pairing.ts", () => {
  it("convex/pairing.ts still exports redeemPairingToken with a TTL branch pinned to 180_000 ms", () => {
    const source = readFileSync(resolve(__dirname, "pairing.ts"), "utf8");
    assert.match(
      source,
      /export\s+const\s+redeemPairingToken\s*=\s*mutation\b/,
      "redeemPairingToken export missing",
    );
    assert.match(
      source,
      /PAIRING_TTL_MS\s*=\s*3\s*\*\s*60\s*\*\s*1000/,
      "PAIRING_TTL_MS still fixed at 3 * 60 * 1000 (180_000 ms) — mirror must be updated if this changes",
    );
    assert.match(
      source,
      /Date\.now\(\)\s*>\s*pairing\.expires_at/,
      "expired-branch comparison Date.now() > pairing.expires_at missing",
    );
    assert.match(
      source,
      /reason:\s*"expired"/,
      "expired-branch reason string missing",
    );
    assert.match(
      source,
      /status:\s*"expired"/,
      "expired-branch row patch (status: \"expired\") missing",
    );
    assert.match(
      source,
      /\.withIndex\("by_token"/,
      "pairings by_token index lookup missing",
    );
  });
});
