// In-memory Convex `MutationCtx` stub for property-based tests of
// `createPairingToken` / `redeemPairingToken` (convex/pairing.ts) and
// `checkVerification` (convex/lib/verification.ts).
//
// SCOPE — deliberately narrow, per AGENTS.md workspace/scope limits
// ("keep failure domains separate"):
//   * Two tables only: `pairings` and `users`.
//   * Three indexes: `pairings.by_token`, `users.by_clerk_user`,
//     `users.by_telegram_user` — exactly what the two source files call.
//   * No scheduler, no egress queue, no other tables, no network, no
//     retries.
//   * `crypto.randomUUID` is NOT stubbed. Property tests exercise the
//     real Web Crypto CSPRNG so the entropy path in `createPairingToken`
//     is actually validated (Requirement 5.3, design § LLD-3).
//
// SERIALIZABILITY (why this stub is enough for Property P2):
//   * Convex mutations are serializable at the granularity of one call
//     (design.md § Algorithm `redeemPairingToken` comment).
//   * JavaScript is single-threaded. Each call to a handler runs to
//     completion before the next call begins because property tests
//     invoke handlers sequentially (`for … of` + `await`), and the stub
//     performs no real I/O — every `.unique()` / `.insert()` / `.patch()`
//     resolves synchronously on top of an in-memory `Map`.
//   * Therefore no interleaving is possible mid-mutation. The stub
//     matches the semantics `redeemPairingToken` relies on: it can read
//     `pairing.redeemed_at`, then patch it, without racing a second
//     redemption of the same token.
//
// CLOCK CONTROL — flagged limitation:
//   * `pairing.ts` and `verification.ts` call the *global* `Date.now()`
//     directly. The stub cannot intercept that transparently.
//   * The `now` option on `createStubCtx` is retained as documentation of
//     the caller's intended clock but does NOT patch the global. Tests
//     that need to freeze or advance the clock (P3 TTL, P7 30-day gate)
//     MUST patch `Date.now` themselves and restore it in a `finally`:
//
//         const realNow = Date.now;
//         Date.now = () => t0 + dt;
//         try {
//           const result = await redeemPairingToken.handler(ctx, args);
//           …
//         } finally {
//           Date.now = realNow;
//         }
//
// This file is a test HELPER, not a test. It contains no `test(...)`
// calls; it exports a factory only.

let idCounter = 0;

function makeId(table) {
  idCounter += 1;
  return `${table}_${idCounter}`;
}

/**
 * Build a minimal `ctx` shaped like Convex's `MutationCtx` for the
 * `pairings` and `users` tables.
 *
 * @param {object} [opts]
 * @param {() => number} [opts.now]
 *   Documentation-only clock reference. See file header — does NOT patch
 *   the global `Date.now`. Tests must do that themselves for TTL / 30-day
 *   gate properties (P3, P7).
 * @param {Iterable<object> | Record<string, object>} [opts.users]
 *   Initial `users` rows. Each row may include `_id`; if absent, one is
 *   assigned. Field shape mirrors `convex/schema.ts` (`clerk_user_id`,
 *   `email`, `telegram_user_id`, `last_verified_at`).
 * @param {Iterable<object> | Record<string, object>} [opts.pairings]
 *   Initial `pairings` rows. Shape mirrors `convex/schema.ts` (`token`,
 *   `clerk_user_id`, `email`, `created_at`, `expires_at`, `redeemed_at`,
 *   `telegram_user_id`, `status`).
 * @param {object | null} [opts.identity]
 *   Object returned by `ctx.auth.getUserIdentity()`. `createPairingToken`
 *   reads `.email` and `.subject`; supply both. Pass `null` to simulate
 *   an unauthenticated caller.
 * @returns A `ctx` object with `db.query / db.insert / db.patch /
 *   auth.getUserIdentity` and a `_tables` escape hatch for assertions.
 */
export function createStubCtx({ now, users, pairings, identity } = {}) {
  // In-memory tables, keyed by _id. Values are plain objects with an _id
  // field added. Only `pairings` and `users` are modeled — anything else
  // throws so a test that accidentally touches an unmodeled table fails
  // loudly rather than silently no-op'ing.
  const tables = {
    pairings: new Map(),
    users: new Map(),
  };

  const seed = (name, initial) => {
    if (!initial) return;
    const rows = Symbol.iterator in Object(initial)
      ? Array.from(initial)
      : Object.values(initial);
    for (const row of rows) {
      const _id = row._id ?? makeId(name);
      tables[name].set(_id, { ...row, _id });
    }
  };
  seed("pairings", pairings);
  seed("users", users);

  // Capture the (field, value) pair from a Convex-style filter builder:
  //   .withIndex("by_token", q => q.eq("token", t))
  // The real builder supports chaining and range predicates; the two
  // source files only call `.eq(field, value)` once per query, so that
  // is all we implement. A future range-query call site would need this
  // capture-object extended.
  function makeFilterCapture() {
    const captured = { field: null, value: null };
    const q = {
      eq(field, value) {
        captured.field = field;
        captured.value = value;
        return q;
      },
    };
    return { q, captured };
  }

  function query(tableName) {
    if (!Object.prototype.hasOwnProperty.call(tables, tableName)) {
      throw new Error(
        `createStubCtx: table "${tableName}" is not modeled. ` +
          `This stub covers only "pairings" and "users" — extend the stub ` +
          `explicitly rather than adding a new table to a property test.`,
      );
    }
    return {
      withIndex(_indexName, filterFn) {
        const { q, captured } = makeFilterCapture();
        filterFn(q);
        const matches = [];
        for (const row of tables[tableName].values()) {
          if (row[captured.field] === captured.value) {
            matches.push(row);
          }
        }
        return {
          async unique() {
            if (matches.length === 0) return null;
            if (matches.length > 1) {
              throw new Error(
                `unique(): ${matches.length} rows matched ` +
                  `${tableName}.${captured.field} === ${JSON.stringify(
                    captured.value,
                  )}`,
              );
            }
            return matches[0];
          },
        };
      },
    };
  }

  async function insert(tableName, row) {
    if (!Object.prototype.hasOwnProperty.call(tables, tableName)) {
      throw new Error(
        `createStubCtx: table "${tableName}" is not modeled. ` +
          `This stub covers only "pairings" and "users".`,
      );
    }
    const _id = makeId(tableName);
    tables[tableName].set(_id, { ...row, _id });
    return _id;
  }

  async function patch(id, partial) {
    for (const table of Object.values(tables)) {
      if (table.has(id)) {
        const current = table.get(id);
        table.set(id, { ...current, ...partial });
        return;
      }
    }
    throw new Error(`patch(): no row with _id=${JSON.stringify(id)}`);
  }

  return {
    db: { query, insert, patch },
    auth: {
      async getUserIdentity() {
        return identity ?? null;
      },
    },
    // Escape hatch for property-test assertions and setup:
    //   ctx._tables.pairings.get(id) → row
    //   ctx._tables.users.size       → row count
    // Not part of Convex's real `MutationCtx`; do not use in production.
    _tables: tables,
    // Documentation-only clock reference — see file header.
    _now: now,
  };
}
