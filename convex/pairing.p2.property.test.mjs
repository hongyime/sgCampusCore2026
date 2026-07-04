// Property-based test P2 for redeemPairingToken — pairing single-use.
//
// **Validates: Requirements 5.1, 12.9**
// Design:      .kiro/specs/multi-school-template-hardening/design.md
//              § Correctness Properties — Property 2,
//              § Algorithm `redeemPairingToken` serializability note,
//              § Error Scenario 5
//
// numRuns override: 25 (user override, tasks.md § 3.5). Original spec
// called for 100 per Requirement 11.4; reduced for local iteration speed.
// The property (upper-bound-of-1 successes across a randomized redemption
// sequence) is not sensitive to the shrink-space that the extra 75 runs
// would cover — each iteration is a full sequence exercising the
// already_redeemed branch, so 25 iterations is still a strong signal.
//
// Formal statement:
//   ∀ T, ∀ finite sequence of redeemPairingToken(T, *) calls,
//   |{ r : r.ok = true }| ≤ 1
//
// In words: for a single pending pairing token T and any sequence of
// redemption attempts (each attempt binding a fresh telegram_user_id),
// AT MOST ONE attempt returns { ok: true }. Every other attempt must
// return { ok: false, reason: "already_redeemed" | "expired" | "invalid" }.
//
// WHY THIS IS A MIRROR, NOT AN IMPORT:
//   convex/pairing.ts wraps its handler in `mutation({ args, handler })`
//   from `./_generated/server` (which resolves to `mutationGeneric` in
//   `convex/server`). Importing that module from an `.mjs` test would
//   register a real Convex mutation at load time — an inappropriate side
//   effect for a property test, and one whose handler surface is not
//   guaranteed to be directly callable outside a Convex runtime.
//
//   The task instructions call this out explicitly and prescribe the
//   mirror-plus-drift-guard pattern already used by
//   `config/isAdminEmail.p1.property.test.mjs` and Session-3 tests: inline
//   a plain-JavaScript port of the handler body against the in-memory
//   `createStubCtx` from `./pairing.testStub.mjs`, then re-read the .ts
//   source and assert the mirror still corresponds to real exports and
//   real branches. If someone renames the mutation, drops the
//   `redeemed_at !== null` check, or reorders the TTL check, the drift
//   guard fails loudly and this file must be updated in lockstep.
//
// SERIALIZABILITY:
//   Convex mutations are serializable at the granularity of one call
//   (design.md § Algorithm `redeemPairingToken` comment). JavaScript is
//   single-threaded and the stub performs no real I/O — every db
//   operation resolves synchronously on top of an in-memory Map. Property
//   tests invoke the handler sequentially (`for … of` + `await`), so no
//   interleaving is possible mid-mutation. That matches the semantics the
//   real handler relies on.
//
// FRESH SEED PER ITERATION:
//   Task 3.5 requires that each fc iteration freshly seed the stub with
//   one pending pairing (previous iteration state must not leak). The
//   fc.property callback re-invokes `createStubCtx` on every run so the
//   pairing and users tables start empty and are seeded to a known
//   "one pending pairing, no users" state before each redemption
//   sequence.
//
// Runnable with:  node --test convex/pairing.p2.property.test.mjs
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
// Ported handler — mirrors the `redeemPairingToken` mutation handler in
// convex/pairing.ts. Only that handler is needed for P2; the drift guard
// below asserts the source still exposes the same identifier and the same
// three fail-closed branches (invalid / already_redeemed / expired).
// ---------------------------------------------------------------------------

async function redeemPairingTokenHandler(ctx, { token, telegram_user_id }) {
  const pairing = await ctx.db
    .query("pairings")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();

  // Unknown token → fail closed.
  if (!pairing) {
    return { ok: false, reason: "invalid" };
  }

  // Already redeemed → fail closed. This is THE branch Property P2 pivots
  // on: once redeemed_at is set, every subsequent call in the sequence
  // takes this exit.
  if (pairing.redeemed_at !== null) {
    return { ok: false, reason: "already_redeemed" };
  }

  // Expired → fail closed and mark so it isn't retried.
  if (Date.now() > pairing.expires_at) {
    await ctx.db.patch(pairing._id, { status: "expired" });
    return { ok: false, reason: "expired" };
  }

  await ctx.db.patch(pairing._id, {
    redeemed_at: Date.now(),
    telegram_user_id,
    status: "redeemed",
  });

  // Upsert the corresponding users row keyed on clerk_user_id (the 30-day
  // gate refresh path — Requirement 4.7). This mirror keeps the upsert so
  // that a future test extending P2 to also assert last_verified_at
  // refresh does not need to re-mirror. For P2 alone, only the return
  // value matters.
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
// Fresh-seed factory — builds a stub ctx with exactly one pending pairing
// row for a fixed token, and no users. Called from inside the fc.property
// callback so every iteration starts from an identical, known state.
// ---------------------------------------------------------------------------

const FIXED_TOKEN = "p2-single-use-token-fixture";
const FIXED_CLERK_USER_ID = "user_p2_fixture";
const FIXED_EMAIL = "fixture@smu.edu.sg";

function seedOnePendingPairing() {
  // Choose an expires_at far in the future so no iteration accidentally
  // exercises the TTL branch — P2 is about the redeemed_at branch, not
  // TTL. P3 covers TTL in its own test. Use Date.now() at seed time so
  // the whole iteration shares one consistent clock reading.
  const now = Date.now();
  return createStubCtx({
    pairings: [
      {
        token: FIXED_TOKEN,
        clerk_user_id: FIXED_CLERK_USER_ID,
        email: FIXED_EMAIL,
        created_at: now,
        expires_at: now + 60 * 60 * 1000, // 1 hour, well past any single run
        redeemed_at: null,
        telegram_user_id: null,
        status: "pending",
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Property 2 — pairing single-use.
// ---------------------------------------------------------------------------

describe("redeemPairingToken — Property 2: pairing single-use (∀ T, |{ r : r.ok = true }| ≤ 1)", () => {
  it("∀ finite sequence of redemption attempts against one pending token, at most one succeeds", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Sequence of telegram_user_id values. minLength: 2 guarantees at
        // least one post-success attempt so the P2 upper bound is
        // actually exercised on every iteration (not just the trivial
        // one-element case). maxLength: 20 keeps runtime bounded.
        fc.array(fc.string(), { minLength: 2, maxLength: 20 }),
        async (telegramUserIds) => {
          // FRESH SEED PER ITERATION — no state leakage between fc runs.
          const ctx = seedOnePendingPairing();

          const results = [];
          for (const id of telegramUserIds) {
            const result = await redeemPairingTokenHandler(ctx, {
              token: FIXED_TOKEN,
              telegram_user_id: id,
            });
            results.push(result);
          }

          const successes = results.filter((r) => r.ok === true);
          return successes.length <= 1;
        },
      ),
      // numRuns: 25 — user override on tasks.md § 3.5 (original spec
      // called for 100 per R11.4; reduced for local iteration speed).
      { numRuns: 25 },
    );
  });
});

// ---------------------------------------------------------------------------
// Drift guard — the mirror above is only meaningful if convex/pairing.ts
// still implements the same policy. Assert the identifiers, index names,
// and the three fail-closed branches this test depends on are present in
// the source. If any check fails, the mirror is stale and MUST be updated
// in lockstep before the source changes land.
// ---------------------------------------------------------------------------

describe("drift guard: P2 mirror still matches convex/pairing.ts", () => {
  it("convex/pairing.ts still exports redeemPairingToken with the three fail-closed branches", () => {
    const source = readFileSync(resolve(__dirname, "pairing.ts"), "utf8");

    // Named export the mirror stands in for.
    assert.match(
      source,
      /export\s+const\s+redeemPairingToken\s*=\s*mutation\s*\(/,
      "redeemPairingToken mutation export missing",
    );

    // Index name used by the query — the stub matches on the (field,
    // value) captured by .eq(), but the "by_token" name is part of the
    // handler contract with the schema.
    assert.match(
      source,
      /\.withIndex\("by_token"/,
      "by_token index usage missing on the pairings query",
    );

    // Fail-closed branch 1: unknown token → invalid.
    assert.match(
      source,
      /reason:\s*"invalid"/,
      "'invalid' fail-closed branch missing (unknown token)",
    );

    // Fail-closed branch 2: already redeemed. This is the branch P2
    // depends on: once redeemed_at is set, subsequent calls take this
    // exit. Match the compound of the null-check plus the reason string.
    assert.match(
      source,
      /pairing\.redeemed_at\s*!==\s*null/,
      "'redeemed_at !== null' guard missing (P2 pivot branch)",
    );
    assert.match(
      source,
      /reason:\s*"already_redeemed"/,
      "'already_redeemed' reason string missing",
    );

    // Fail-closed branch 3: expired.
    assert.match(
      source,
      /Date\.now\(\)\s*>\s*pairing\.expires_at/,
      "TTL comparison missing on pairing.expires_at",
    );
    assert.match(
      source,
      /reason:\s*"expired"/,
      "'expired' reason string missing",
    );

    // Successful redemption patches redeemed_at + telegram_user_id +
    // status. If any of these three fields are dropped the P2 branch on
    // redeemed_at silently stops firing on the second call.
    assert.match(
      source,
      /redeemed_at:\s*Date\.now\(\)/,
      "redeemed_at patch missing on success path",
    );
    assert.match(
      source,
      /status:\s*"redeemed"/,
      "status: 'redeemed' patch missing on success path",
    );

    // Users upsert path — the mirror includes it; keep the source and
    // mirror aligned on the by_clerk_user index name.
    assert.match(
      source,
      /\.withIndex\("by_clerk_user"/,
      "by_clerk_user index usage missing on users upsert",
    );

    // Canonical success shape: { ok: true, clerk_user_id: … }. Task 3.5
    // requires the drift guard to assert all four canonical return
    // shapes of redeemPairingToken. The three failure shapes are checked
    // above; this one closes the set.
    assert.match(
      source,
      /ok:\s*true[\s\S]*?clerk_user_id:\s*pairing\.clerk_user_id/,
      "canonical success shape { ok: true, clerk_user_id } missing on return",
    );
  });
});
