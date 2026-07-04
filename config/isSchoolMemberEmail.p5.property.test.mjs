// Property-based test P5: Case insensitivity in local-part of isSchoolMemberEmail.
//
// **Property 5: Case insensitivity in local-part.**
// **Validates: Requirements 2.1** (design.md § Correctness Properties P5,
// § LLD-2 aggregate fix list).
//
// Formal statement:
//   ∀ E ∈ String, ∀ σ case-transformations of the local-part,
//     isSchoolMemberEmail(E) = isSchoolMemberEmail(σ(E)).
//
// WHY THIS IS A MIRROR, NOT AN IMPORT:
//   config/school.ts and config/schoolRegistry.ts are TypeScript modules
//   that import each other via extensionless relative paths. Node's
//   built-in `node --test` runner cannot load TypeScript without a loader.
//   This file therefore inlines a plain-JavaScript port of
//   `isSchoolMemberEmail` and the two helpers it stands on (`emailDomain`,
//   `getActiveSchool`), plus the single SMU registry row it exercises.
//   The active-school code is pinned to "smu" per the task spec.
//
// DRIFT GUARD:
//   The final describe() block re-reads config/school.ts and
//   config/schoolRegistry.ts from disk and asserts that the identifiers
//   this mirror depends on still exist. If someone renames the exported
//   symbol, changes the `studentDomains`/`staffDomains` field name, or
//   removes the SMU registry entry, the guard fails loudly and this file
//   must be updated in lockstep. Same pattern as config/school.test.mjs.
//
// Design reference: design.md § Correctness Properties — Property 5,
// § LLD-2 aggregate fix list. Requirements: 2.1.
//
// Runnable with:  node --test config/isSchoolMemberEmail.p5.property.test.mjs
// Or via:         npm run test:pbt
//
// Iteration count reduced to 25 per user override on 2025-01-XX (Requirement 11.4 was ">=100"); trade slower shrinker coverage for faster local runs.

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import fc from "fast-check";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Ported policy — mirrors config/school.ts + the SMU row of
// config/schoolRegistry.ts. Keep in lockstep with those files (see drift
// guard below). Only the SMU school is modelled here because the task pins
// `CAMPUSCORE_SCHOOL_CODE='smu'`.
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
  // Trim BEFORE lastIndexOf('@') and BEFORE lowercasing — matches
  // config/school.ts and design.md § LLD-2 item 1.
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  return at === -1 ? "" : trimmed.slice(at + 1).toLowerCase();
}

function isSchoolMemberEmail(email) {
  const school = getActiveSchool();
  const domain = emailDomain(email);
  if (!domain) return false;
  return (
    school.studentDomains.includes(domain) ||
    school.staffDomains.includes(domain)
  );
}

// ---------------------------------------------------------------------------
// Env save/restore — pin CAMPUSCORE_SCHOOL_CODE to "smu" during the property
// run so getActiveSchool() is deterministic (per task).
// ---------------------------------------------------------------------------

const ENV_KEYS = ["CAMPUSCORE_SCHOOL_CODE"];
let ORIGINAL_ENV;

beforeEach(() => {
  ORIGINAL_ENV = {};
  for (const key of ENV_KEYS) {
    ORIGINAL_ENV[key] = process.env[key];
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
// Helper: apply a boolean mask `flipMask` to the local-part `local`.
// For index i where flipMask[i] is true, flip the case of local[i]; where
// false, leave the character unchanged. Mask is aligned to local's length;
// out-of-range mask entries are ignored, missing entries default to false.
// This is the case-transformation σ referenced in the formal statement.
// ---------------------------------------------------------------------------
function applyCaseFlipMask(local, flipMask) {
  let out = "";
  for (let i = 0; i < local.length; i++) {
    const ch = local[i];
    if (flipMask[i]) {
      const upper = ch.toUpperCase();
      // toUpperCase yields ch unchanged for non-alpha characters; flipping to
      // lower catches the case where ch is already uppercase.
      out += upper === ch ? ch.toLowerCase() : upper;
    } else {
      out += ch;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Property 5 — case insensitivity in local-part
// Validates: Requirements 2.1
// Design:    § Correctness Properties Property 5, § LLD-2
// ---------------------------------------------------------------------------

describe("isSchoolMemberEmail (Property 5: case insensitivity in local-part)", () => {
  it("holds ∀ E, ∀ σ case-flip: isSchoolMemberEmail(local@d) === isSchoolMemberEmail(σ(local)@d)", () => {
    // Domain arbitrary mixes in-registry and out-of-registry values so both
    // `true` and `false` outcomes are exercised (task specification).
    //   - "smu.edu.sg"      — in SMU.studentDomains ∪ staffDomains → true
    //   - "ntu.edu.sg"      — out-of-registry from SMU's perspective → false
    //   - "other.example.com" — plain out-of-registry → false
    const domainArb = fc.constantFrom("smu.edu.sg", "ntu.edu.sg", "other.example.com");

    // Local-part arbitrary: RFC-5321 compatible characters, no whitespace,
    // no '@'. Non-empty. Length capped to keep the mask small.
    const localArb = fc
      .string({ minLength: 1, maxLength: 24 })
      .filter((s) => s.length > 0 && !s.includes("@") && !/\s/.test(s));

    // σ mask: one boolean per local-part character. `fc.uniqueArray` is
    // unnecessary — order matters, duplicates are meaningful.
    const flipMaskArb = fc.array(fc.boolean(), { minLength: 0, maxLength: 24 });

    fc.assert(
      fc.property(localArb, domainArb, flipMaskArb, (local, domain, flipMask) => {
        const original = `${local}@${domain}`;
        const sigmaLocal = applyCaseFlipMask(local, flipMask);
        const transformed = `${sigmaLocal}@${domain}`;
        // Property: the two predicates agree regardless of local-part case σ.
        return isSchoolMemberEmail(original) === isSchoolMemberEmail(transformed);
      }),
      { numRuns: 25 },
    );
  });

  // Companion example-based sanity checks — cheap oracles that confirm the
  // property test is exercising both `true` and `false` outcomes and not
  // vacuously passing on one side of the branch.
  it("sanity: SMU-domain email yields true and stays true after uppercase local-part", () => {
    assert.equal(isSchoolMemberEmail("bryan.seah@smu.edu.sg"), true);
    assert.equal(isSchoolMemberEmail("BRYAN.SEAH@smu.edu.sg"), true);
  });

  it("sanity: non-registry-domain email yields false and stays false after case flip", () => {
    assert.equal(isSchoolMemberEmail("alice@other.example.com"), false);
    assert.equal(isSchoolMemberEmail("ALICE@other.example.com"), false);
  });
});

// ---------------------------------------------------------------------------
// Drift guard — assert the identifiers the ported logic depends on still
// exist in config/school.ts and config/schoolRegistry.ts. Same pattern as
// config/school.test.mjs; keep in lockstep.
// ---------------------------------------------------------------------------

describe("drift guard: mirror in this file still matches config/school.ts", () => {
  it("config/school.ts still exports isSchoolMemberEmail and reads studentDomains + staffDomains", () => {
    const source = readFileSync(resolve(__dirname, "school.ts"), "utf8");
    assert.match(source, /export\s+function\s+isSchoolMemberEmail\b/, "isSchoolMemberEmail export missing");
    assert.match(source, /studentDomains/, "'studentDomains' field name missing");
    assert.match(source, /staffDomains/, "'staffDomains' field name missing");
    assert.match(source, /CAMPUSCORE_SCHOOL_CODE/, "CAMPUSCORE_SCHOOL_CODE env var name missing");
  });

  it("config/schoolRegistry.ts still lists smu with domain smu.edu.sg on both student and staff", () => {
    const source = readFileSync(resolve(__dirname, "schoolRegistry.ts"), "utf8");
    assert.match(source, /code:\s*"smu"/, "smu code entry missing");
    assert.match(source, /smu\.edu\.sg/, "smu.edu.sg domain missing");
  });
});
