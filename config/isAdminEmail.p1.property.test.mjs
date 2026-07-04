// Property-based test P1 for isAdminEmail — fail-closed admin gate.
//
// **Validates: Requirements 3.1, 12.8**
// Design:      .kiro/specs/multi-school-template-hardening/design.md
//              § Correctness Properties — Property 1, § LLD-4,
//              § Auth Model (fail-closed invariant)
//
// Formal statement:
//   ∀ E ∈ String, allowlist(env) = ∅ ⟹ isAdminEmail(E) = false
//
// The property is checked against FIVE empty-equivalent env-var states,
// each of which must produce an EMPTY parsed allowlist under the current
// `.split(/[\s,]+/).map(trim).map(lowercase).filter(Boolean)` pipeline in
// config/school.ts:
//   1. ""                   — literal empty string
//   2. "   "                — spaces only
//   3. "\n\t"               — whitespace only (newline + tab)
//   4. ",,,, "              — only separators
//   5. undefined (via delete) — env var not set at all
//
// WHY THIS IS A MIRROR, NOT AN IMPORT:
//   config/school.ts and config/schoolRegistry.ts are TypeScript. Node's
//   built-in `node --test` runner cannot load TypeScript without a loader,
//   and the multi-school-hardening spec forbids adding any devDependency
//   beyond the AGENTS.md-approved `fast-check` exception (Requirement 11.3).
//   This file therefore inlines a plain-JavaScript port of the isAdminEmail
//   policy and the two helpers it stands on (isStaffEmail, getAdminAllowlist,
//   emailDomain), plus the single SMU registry row it exercises. A drift
//   guard at the bottom re-reads the source .ts files and asserts the mirror
//   still corresponds to real exports; if someone renames isAdminEmail,
//   drops trim-before-lowercase, or changes the split regex, the guard
//   fails loudly and this file must be updated in lockstep.
//
// This mirror pattern matches config/school.test.mjs from Session 3.
//
// Runnable with:  node --test config/isAdminEmail.p1.property.test.mjs
// Or via:         npm run test:pbt

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import fc from "fast-check";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Ported policy — mirrors config/school.ts (post-Task-1.3 trim-before-
// lowercase pipeline) + the SMU row of config/schoolRegistry.ts. Only the
// SMU school is modelled because the P1 test locks CAMPUSCORE_SCHOOL_CODE
// to "smu" in beforeEach for determinism.
// ---------------------------------------------------------------------------

const SMU = {
  code: "smu",
  studentDomains: ["smu.edu.sg"],
  staffDomains: ["smu.edu.sg"],
};

const DEFAULT_SCHOOL_CODE = "smu";

function findSchoolByCode(code) {
  const c = (code || "").toLowerCase();
  if (c === "smu") return SMU;
  return undefined;
}

function getActiveSchoolCode() {
  return (process.env.CAMPUSCORE_SCHOOL_CODE || DEFAULT_SCHOOL_CODE).toLowerCase();
}

function getActiveSchool() {
  return findSchoolByCode(getActiveSchoolCode()) || SMU;
}

function emailDomain(email) {
  // Trim BEFORE slicing at the last `@` and BEFORE lowercasing so a
  // whitespace-padded input normalizes to the same domain as its trimmed
  // form. `lastIndexOf("@")` (not `indexOf`) is deliberate — matches Clerk
  // and the RFC-permitted quoted local-part interpretation.
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  return at === -1 ? "" : trimmed.slice(at + 1).toLowerCase();
}

function isStaffEmail(email) {
  const domain = emailDomain(email);
  if (!domain) return false;
  return getActiveSchool().staffDomains.includes(domain);
}

function getAdminAllowlist() {
  return (process.env.CAMPUSCORE_ADMIN_ALLOWLIST || "")
    .split(/[\s,]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminEmail(email) {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (!isStaffEmail(normalized)) return false;
  return getAdminAllowlist().includes(normalized);
}

// ---------------------------------------------------------------------------
// Env save/restore — each case runs with a known, isolated env slice so
// leftover state from a prior case cannot mask a fail-closed regression.
// beforeEach also pins CAMPUSCORE_SCHOOL_CODE to "smu" so getActiveSchool()
// is deterministic across the whole file.
// ---------------------------------------------------------------------------

const ENV_KEYS = ["CAMPUSCORE_SCHOOL_CODE", "CAMPUSCORE_ADMIN_ALLOWLIST"];
let ORIGINAL_ENV;

beforeEach(() => {
  ORIGINAL_ENV = {};
  for (const key of ENV_KEYS) {
    ORIGINAL_ENV[key] = process.env[key];
    delete process.env[key];
  }
  process.env.CAMPUSCORE_SCHOOL_CODE = "smu";
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = ORIGINAL_ENV[key];
  }
});

// ---------------------------------------------------------------------------
// Property 1 — fail-closed admin.
// For each of the 5 empty-equivalent env states, quantify over ALL strings
// via fc.string(). Each `it()` runs a fresh fc.assert so a shrunk
// counter-example is attributed to exactly one env state.
// Iteration count reduced to 25 per user override on 2025-01-XX (Requirement 11.4 was ">=100"); trade slower shrinker coverage for faster local runs.
// ---------------------------------------------------------------------------

const DELETE_SENTINEL = Symbol("delete-env");

/** The oracle set of "empty-equivalent" CAMPUSCORE_ADMIN_ALLOWLIST values. */
const EMPTY_EQUIVALENT_VALUES = [
  { label: '""', value: "" },
  { label: '"   " (spaces)', value: "   " },
  { label: '"\\n\\t" (whitespace)', value: "\n\t" },
  { label: '",,,, " (separators only)', value: ",,,, " },
  { label: "undefined (unset)", value: DELETE_SENTINEL },
];

function setAllowlist(value) {
  if (value === DELETE_SENTINEL) {
    delete process.env.CAMPUSCORE_ADMIN_ALLOWLIST;
  } else {
    process.env.CAMPUSCORE_ADMIN_ALLOWLIST = value;
  }
}

describe("isAdminEmail — Property 1: fail-closed admin (∀ E, allowlist=∅ ⟹ !isAdminEmail(E))", () => {
  for (const { label, value } of EMPTY_EQUIVALENT_VALUES) {
    it(`returns false for every string when CAMPUSCORE_ADMIN_ALLOWLIST = ${label}`, () => {
      setAllowlist(value);

      // Sanity precondition: the parsed allowlist really is empty for this
      // env state. If the split/trim/filter pipeline ever changes such that
      // one of these five values yields a non-empty allowlist, the whole
      // premise of P1 collapses and we want a loud early failure.
      assert.deepEqual(
        getAdminAllowlist(),
        [],
        `allowlist parsed non-empty for env=${label}`,
      );

      fc.assert(
        fc.property(fc.string(), (email) => {
          return isAdminEmail(email) === false;
        }),
        { numRuns: 25 },
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Drift guard — the mirror above is only meaningful if the source .ts still
// implements the same policy. Assert the identifiers, env-var names, and
// key pipeline substrings this test depends on are still present. If any
// of these fail, the mirror is stale and MUST be updated in lockstep before
// the source files change land.
// ---------------------------------------------------------------------------

describe("drift guard: P1 mirror still matches config/school.ts", () => {
  it("config/school.ts still exports isAdminEmail with trim-before-lowercase and reads CAMPUSCORE_ADMIN_ALLOWLIST", () => {
    const source = readFileSync(resolve(__dirname, "school.ts"), "utf8");
    assert.match(
      source,
      /export\s+function\s+isAdminEmail\b/,
      "isAdminEmail export missing",
    );
    assert.match(
      source,
      /function\s+getAdminAllowlist\b/,
      "getAdminAllowlist helper missing",
    );
    assert.match(
      source,
      /function\s+isStaffEmail\b/,
      "isStaffEmail helper missing",
    );
    assert.match(
      source,
      /CAMPUSCORE_ADMIN_ALLOWLIST/,
      "CAMPUSCORE_ADMIN_ALLOWLIST env var name missing",
    );
    assert.match(
      source,
      /CAMPUSCORE_SCHOOL_CODE/,
      "CAMPUSCORE_SCHOOL_CODE env var name missing",
    );
    assert.match(
      source,
      /email\.trim\(\)\.toLowerCase\(\)/,
      "trim-before-lowercase pipeline missing in isAdminEmail (Task 1.3 fix)",
    );
    assert.match(
      source,
      /split\(\/\[\\s,\]\+\/\)/,
      "getAdminAllowlist split-on-whitespace-or-comma regex missing",
    );
    assert.match(
      source,
      /\.filter\(Boolean\)/,
      "getAdminAllowlist empty-token drop (.filter(Boolean)) missing",
    );
  });

  it("config/schoolRegistry.ts still lists smu with staff domain smu.edu.sg", () => {
    const source = readFileSync(resolve(__dirname, "schoolRegistry.ts"), "utf8");
    assert.match(source, /code:\s*"smu"/, "smu code entry missing");
    assert.match(source, /smu\.edu\.sg/, "smu.edu.sg staff domain missing");
  });
});
