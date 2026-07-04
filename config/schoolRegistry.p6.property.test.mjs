// Property 6: Registry uniqueness — every distinct SCHOOL_REGISTRY entry has a
// distinct `code`.
//
// Formal statement:
//   ∀ (A, B) ∈ SCHOOL_REGISTRY × SCHOOL_REGISTRY,
//   A ≠ B ⟹ A.code ≠ B.code
//
// Validates: Requirements 1.1
// Design:    .kiro/specs/multi-school-template-hardening/design.md
//            § Correctness Properties — Property 6
//            § Registry Contract invariants
//
// WHY THIS IS A MIRROR, NOT AN IMPORT:
//   config/schoolRegistry.ts is a TypeScript module. Node's built-in
//   `node --test` runner cannot load TypeScript without a loader, and the
//   AGENTS.md § "Approval Checkpoints" rule forbids adding new devDependencies
//   without explicit sign-off — the sole approved exception is `fast-check`
//   itself (Requirement 11.2). This file therefore parses the `code: "..."`
//   entries directly out of the .ts source at load time. That parse doubles
//   as a drift guard: if the source stops matching the shape the regex
//   assumes, this test fails loudly and must be updated in lockstep with
//   the source change.
//
// Companion example-based test: config/schoolRegistry.test.mjs (Task 2.1)
// asserts uniqueness via `new Set(codes).size === codes.length`. Task 2.1
// and this P6 property test pass together or neither does.
//
// Runnable with:  node --test config/schoolRegistry.p6.property.test.mjs
// Or via:         npm run test:pbt
//
// Iteration count reduced to 25 per user override on 2025-01-XX (Requirement 11.4 was ">=100"); trade slower shrinker coverage for faster local runs.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import fc from "fast-check";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Parse `code: "..."` string literals out of config/schoolRegistry.ts.
// The `SchoolEntry` interface field `code: string;` (no quoted value) is
// intentionally NOT matched by this regex — only concrete registry rows are.
// ---------------------------------------------------------------------------

const registrySource = readFileSync(
  resolve(__dirname, "schoolRegistry.ts"),
  "utf8",
);

const codeMatches = [...registrySource.matchAll(/code:\s*"([^"]+)"/g)];
const SCHOOL_REGISTRY = codeMatches.map(([, code]) => ({ code }));

// ---------------------------------------------------------------------------
// Property 6 — Registry uniqueness (P6)
// ---------------------------------------------------------------------------

describe("SCHOOL_REGISTRY (Property 6: Registry uniqueness)", () => {
  it("has at least two entries so the pair property is meaningful", () => {
    assert.ok(
      SCHOOL_REGISTRY.length >= 2,
      `expected ≥2 registry entries, parsed ${SCHOOL_REGISTRY.length}`,
    );
  });

  it("∀ (A, B) ∈ SCHOOL_REGISTRY × SCHOOL_REGISTRY, A ≠ B ⟹ A.code ≠ B.code", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 0, max: SCHOOL_REGISTRY.length - 1 }),
          fc.integer({ min: 0, max: SCHOOL_REGISTRY.length - 1 }),
        ),
        ([i, j]) => {
          fc.pre(i !== j);
          return SCHOOL_REGISTRY[i].code !== SCHOOL_REGISTRY[j].code;
        },
      ),
      { numRuns: 25 },
    );
  });
});
