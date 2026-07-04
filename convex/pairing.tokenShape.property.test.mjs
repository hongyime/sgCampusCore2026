// Property-based regression guard for the pairing-token OUTPUT SHAPE.
//
// **Validates: Requirements 5.3, 5.4** (design.md § LLD-3, § Security
// Considerations "Entropy floor for pairing tokens").
//
// This test does NOT re-derive the 128-bit entropy floor claim (that's an
// analytical property of `crypto.getRandomValues`, not something a runtime
// test can measure). It pins the observable output shape of the token
// generator so a future refactor cannot silently change the format that
// the pairings schema and every consumer downstream depends on.
//
// Formal statement:
//   ∀ token T minted by the pairing-token generator,
//     T matches /^[0-9a-f]{32}$/
//     AND length(T) === 32
//     AND every character is lowercase-hex (no dashes, no uppercase,
//         no leading `0x`, no whitespace).
//
// The generator itself is a two-line snippet in `convex/pairing.ts`:
//     const tokenBytes = crypto.getRandomValues(new Uint8Array(16));
//     const token = Array.from(tokenBytes, (b) =>
//       b.toString(16).padStart(2, "0")
//     ).join("");
// The 2026-07-04 migration replaced the earlier
//     const token = crypto.randomUUID().replace(/-/g, "");
// form (122 bits) with the above (128 bits) per Requirement 5.4 and the
// deferred item recorded in WAITING_ON_HUMAN.md § "Deferred Items —
// 128-bit token migration". The output shape is invariant across both
// forms — a lowercase-hex string of 32 chars — so this test would have
// passed against the pre-migration code too. It exists to keep the
// invariant load-bearing going forward.
//
// WHY MIRROR-PLUS-DRIFT-GUARD: same reason as P1/P2/P3/P4/P5/P7 —
// `convex/pairing.ts` is TypeScript importing `./_generated/server`, and
// Node's `node --test` runner cannot load TypeScript. The drift guard
// at the bottom re-reads `convex/pairing.ts` and asserts the exact
// two-line generator snippet is present verbatim so a future rewrite
// that changes the generator without updating this test fails loudly.
//
// Runnable with:  node --test convex/pairing.tokenShape.property.test.mjs
// Or via:         npm run test:pbt

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import fc from "fast-check";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Ported generator — mirrors the two lines above in `convex/pairing.ts`.
// Keep in lockstep; drift guard below enforces this.
// ---------------------------------------------------------------------------

function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Property test — output shape invariant
// ---------------------------------------------------------------------------

const TOKEN_SHAPE_RE = /^[0-9a-f]{32}$/;

describe("pairing-token generator — output shape invariant", () => {
  it("every generated token matches /^[0-9a-f]{32}$/", () => {
    // fc.gen supplies a dummy driver; the property is quantifying over
    // the CSPRNG output itself. numRuns: 100 satisfies R11.4.
    fc.assert(
      fc.property(fc.integer(), () => {
        const token = generateToken();
        return TOKEN_SHAPE_RE.test(token);
      }),
      { numRuns: 100 },
    );
  });

  it("every generated token has length 32", () => {
    fc.assert(
      fc.property(fc.integer(), () => generateToken().length === 32),
      { numRuns: 100 },
    );
  });

  it("no generated token contains a dash, uppercase, whitespace, or `0x`", () => {
    fc.assert(
      fc.property(fc.integer(), () => {
        const t = generateToken();
        return (
          !t.includes("-") &&
          t === t.toLowerCase() &&
          !/\s/.test(t) &&
          !t.startsWith("0x")
        );
      }),
      { numRuns: 100 },
    );
  });

  it("distinctness anchor: 100 sequential draws produce 100 distinct tokens", () => {
    // Not a property of CSPRNG output at zero probability of collision,
    // but at 128 bits the birthday-collision probability across 100
    // draws is ~1.5e-35 — this test failing means the generator is
    // broken (returning a constant, using a bad source), not that we
    // hit a birthday. Explicit example-based check bolted on so a
    // regression to `Math.random` (or worse, a constant) is caught.
    const seen = new Set();
    for (let i = 0; i < 100; i++) seen.add(generateToken());
    assert.equal(seen.size, 100, "generator produced duplicates in 100 draws");
  });
});

// ---------------------------------------------------------------------------
// Drift guard — the mirror above is only meaningful if `convex/pairing.ts`
// still uses the exact same two-line generator. If a future rewrite
// changes the shape, this test fails loudly and the mirror must be
// updated in lockstep.
// ---------------------------------------------------------------------------

describe("drift guard: token-shape mirror still matches convex/pairing.ts", () => {
  it("convex/pairing.ts uses crypto.getRandomValues(new Uint8Array(16)) + hex encoding", () => {
    const source = readFileSync(resolve(__dirname, "pairing.ts"), "utf8");
    assert.match(
      source,
      /crypto\.getRandomValues\(new\s+Uint8Array\(16\)\)/,
      "Web Crypto 128-bit byte source (crypto.getRandomValues(new Uint8Array(16))) missing",
    );
    assert.match(
      source,
      /\.toString\(16\)\.padStart\(2,\s*"0"\)/,
      "hex-per-byte encoding (.toString(16).padStart(2, \"0\")) missing",
    );
    // Anti-regression: the old randomUUID().replace(/-/g, "") form must
    // not silently return in EXECUTABLE code. Strip line-comments before
    // the check so the historical-note comment in pairing.ts that names
    // the pre-migration form does not trigger this guard. If someone
    // re-introduces the old generator, the property still holds (both
    // produce 32-hex-char strings) — but this guard catches the swap so
    // the entropy discussion is at least reopened, not silently regressed.
    const stripped = source.replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(
      stripped,
      /crypto\.randomUUID\(\)\.replace\(/,
      "regression: old randomUUID().replace() token generator has been reintroduced. If this is intentional, delete this assertion and update the entropy-floor comment in convex/pairing.ts + this test's header per the deferred-migration reversal.",
    );
    assert.doesNotMatch(
      source,
      /Math\.random\(\)/,
      "Math.random() is forbidden as a token source (design § Security Considerations)",
    );
  });
});
